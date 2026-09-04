import { createHash } from "node:crypto";

import type {
  ContestEventType,
  ContestRules,
  ContestStatus
} from "@nada/types";

import type { RelayDb } from "../db";
import type { RelayRedis } from "../redis";
import { TtlCache } from "../ttl-cache";
import { ContestLeaderboard } from "./leaderboard";
import { createContestMetrics, type ContestMetrics } from "./metrics";
import { ContestRepository, type ContestRecord } from "./repository";
import { assessClusterRisk } from "./risk";
import { transitionContest } from "./lifecycle";
import { defaultRules, isChallengeEvent, parseRules, riskBand } from "./rules";
import { reverseEvent, scoreEvent, type ChallengeAward } from "./scoring";

/**
 * The contest engine's front door.
 *
 * Product code calls `emit` and gets back nothing — not a promise, not an
 * error. That is deliberate and it is the single most important property in
 * this file: posting an Echo must not become slower, and must not become able
 * to fail, because a leaderboard exists. Scoring happens on a worker behind a
 * bounded queue; if the queue is full, or the database is down, or the scoring
 * logic throws, the Whisper write has already succeeded and the user sees
 * nothing.
 *
 * What that costs, and how it is paid: an event that never reaches the worker
 * is an unawarded point. Three things recover it — the durable PENDING row
 * written before scoring, the sweeper that re-processes PENDING rows a crashed
 * worker left behind, and `reconcile`, which replays a contest's whole window
 * from the Whisper tables and is run before any contest is finalized.
 */

export interface EngagementInput {
  eventType: ContestEventType;
  /** The identity that earns the points. */
  participantPubkeyHash: string;
  /** The identity whose action produced them. Equal to the participant for authored content. */
  actorPubkeyHash: string;
  sourceEntityType: "echo" | "reflection" | "follow" | "challenge";
  sourceEntityId: string;
  occurredAtMs: number;
  metadata?: Record<string, unknown>;
}

export interface ReversalInput {
  sourceEntityType: "echo" | "reflection" | "follow" | "challenge";
  sourceEntityId: string;
  reason: string;
  /** Limits the reversal to one earner/actor pair, for undone interactions. */
  participantPubkeyHash?: string;
  actorPubkeyHash?: string;
  eventType?: ContestEventType;
}

export interface ContestServiceLogger {
  error: (details: unknown, message: string) => void;
  info: (details: unknown, message: string) => void;
  warn: (details: unknown, message: string) => void;
}

type Job =
  | { kind: "engagement"; input: EngagementInput }
  | { kind: "reversal"; input: ReversalInput }
  | { kind: "sweep" };

/** Bounded so a scoring outage cannot turn into unbounded relay memory. */
const MAX_QUEUE_DEPTH = 20_000;
const ACTIVE_CONTEST_TTL_MS = 10_000;
const PARTICIPANT_TTL_MS = 30_000;
const SWEEP_INTERVAL_MS = 60_000;
/** How stale a PENDING row must be before the sweeper assumes it was orphaned. */
const SWEEP_MIN_AGE_MS = 30_000;
const SWEEP_BATCH = 200;

export class ContestService {
  readonly repository: ContestRepository;
  readonly leaderboard: ContestLeaderboard;
  readonly metrics: ContestMetrics;

  private readonly queue: Job[] = [];
  private draining = false;
  private closed = false;
  private sweepTimer: NodeJS.Timeout | null = null;
  private readonly activeContests = new TtlCache<ContestRecord[]>(ACTIVE_CONTEST_TTL_MS, 4);
  private readonly participantCache = new TtlCache<boolean>(PARTICIPANT_TTL_MS, 20_000);
  private readonly rulesCache = new TtlCache<ContestRules>(60_000, 64);

  constructor(
    db: RelayDb,
    redis: RelayRedis | null,
    private readonly log: ContestServiceLogger
  ) {
    this.repository = new ContestRepository(db);
    this.metrics = createContestMetrics();
    this.leaderboard = new ContestLeaderboard(this.repository, redis, (error, message) => {
      this.log.error({ err: error }, message);
    });
  }

  start(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.enqueue({ kind: "sweep" });
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Records an engagement signal. Returns immediately and never throws — the
   * caller is a request handler that has already done the user's real work.
   */
  emit(input: EngagementInput): void {
    this.metrics.eventReceived();
    this.enqueue({ kind: "engagement", input });
  }

  /** Reverses points tied to content that was deleted or an action undone. */
  reverse(input: ReversalInput): void {
    this.enqueue({ kind: "reversal", input });
  }

  /** Drops a participant's cached membership so a fresh join scores at once. */
  invalidateParticipant(contestId: string, pubkeyHash: string): void {
    this.participantCache.set(`${contestId}:${pubkeyHash}`, true);
  }

  /** Forces the next scoring pass to reload rules and contest windows. */
  invalidateRules(): void {
    this.rulesCache.clear();
    this.activeContests.clear();
  }

  invalidateContests(): void {
    this.activeContests.clear();
  }

  private enqueue(job: Job): void {
    if (this.closed) return;
    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      // Shed the oldest rather than the newest: recent engagement is the more
      // useful thing to keep, and reconciliation recovers whatever is dropped.
      this.queue.shift();
      this.metrics.eventDropped("queue_full");
    }
    this.queue.push(job);
    this.metrics.queueDepth(this.queue.length);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0 && !this.closed) {
        const job = this.queue.shift();
        this.metrics.queueDepth(this.queue.length);
        if (!job) break;
        try {
          if (job.kind === "engagement") {
            await this.processEngagement(job.input);
          } else if (job.kind === "reversal") {
            await this.processReversal(job.input);
          } else {
            await this.processSweep();
          }
        } catch (error) {
          // One poisoned job must not stop the worker for everyone else.
          this.log.error({ err: error, kind: job.kind }, "Contest job failed");
          this.metrics.eventDropped("job_error");
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async scoringContests(nowMs: number): Promise<ContestRecord[]> {
    return this.activeContests.resolve("active", () =>
      this.repository.listScoringContests(nowMs)
    );
  }

  private async rulesFor(contest: ContestRecord): Promise<ContestRules> {
    return this.rulesCache.resolve(`${contest.id}:${contest.rulesVersion}`, async () => {
      const rules = await this.repository.getRules(contest.id, contest.rulesVersion);
      return rules ?? defaultRules();
    });
  }

  private async isParticipant(contestId: string, pubkeyHash: string): Promise<boolean> {
    return this.participantCache.resolve(`${contestId}:${pubkeyHash}`, async () => {
      const participant = await this.repository.getParticipant(contestId, pubkeyHash);
      return participant !== null && participant.eligibilityStatus !== "disqualified";
    });
  }

  private async processEngagement(input: EngagementInput): Promise<void> {
    const contests = await this.scoringContests(Date.now());
    for (const contest of contests) {
      if (
        input.occurredAtMs < contest.startAtMs ||
        input.occurredAtMs >= contest.endAtMs
      ) {
        continue;
      }
      if (!(await this.isParticipant(contest.id, input.participantPubkeyHash))) {
        continue;
      }
      await this.recordAndScore(contest, input);
    }
  }

  private async recordAndScore(
    contest: ContestRecord,
    input: EngagementInput
  ): Promise<void> {
    const idempotencyKey = buildIdempotencyKey(contest.id, input);
    const event = await this.repository.insertPendingEvent({
      contestId: contest.id,
      participantPubkeyHash: input.participantPubkeyHash,
      actorPubkeyHash: input.actorPubkeyHash,
      eventType: input.eventType,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      occurredAtMs: input.occurredAtMs,
      idempotencyKey,
      metadata: input.metadata ?? {}
    });
    // Already recorded: another instance, an HTTP retry, or the reconciliation
    // sweep got here first. There is nothing left to do — scoring is driven by
    // the row, and the row exists exactly once.
    if (!event) return;

    await this.settleEvent(contest, event.id, input.participantPubkeyHash);
  }

  private async settleEvent(
    contest: ContestRecord,
    eventId: string,
    participantPubkeyHash: string
  ): Promise<void> {
    const rules = await this.rulesFor(contest);
    const result = await scoreEvent({
      repository: this.repository,
      contest,
      rules,
      eventId,
      metrics: this.metrics
    });
    if (!result.outcome) return;

    if (result.outcome.status === "VALID") {
      await this.publishStanding(contest.id, participantPubkeyHash);
    }

    for (const award of result.challenges) {
      await this.awardChallenge(contest, participantPubkeyHash, award);
    }
  }

  private async awardChallenge(
    contest: ContestRecord,
    participantPubkeyHash: string,
    award: ChallengeAward
  ): Promise<void> {
    if (!isChallengeEvent(award.eventType)) return;
    const input: EngagementInput = {
      eventType: award.eventType,
      participantPubkeyHash,
      actorPubkeyHash: participantPubkeyHash,
      sourceEntityType: "challenge",
      sourceEntityId: `${award.challengeId}:${award.periodKey}`,
      occurredAtMs: Date.now(),
      metadata: { challengeId: award.challengeId, period: award.periodKey }
    };
    await this.recordAndScore(contest, input);
  }

  private async publishStanding(
    contestId: string,
    participantPubkeyHash: string
  ): Promise<void> {
    const participant = await this.repository.getParticipant(
      contestId,
      participantPubkeyHash
    );
    if (!participant) return;
    const events = await this.repository.listEvents(contestId, {
      participantPubkeyHash,
      status: "VALID",
      limit: 1
    });
    await this.leaderboard.publishScore(
      contestId,
      participantPubkeyHash,
      participant.currentScore,
      participant.displayName,
      events.length
    );
  }

  private async processReversal(input: ReversalInput): Promise<void> {
    const events = await this.repository.listEventsForSource(
      input.sourceEntityType,
      input.sourceEntityId
    );
    for (const event of events) {
      if (
        input.participantPubkeyHash &&
        event.participantPubkeyHash !== input.participantPubkeyHash
      ) {
        continue;
      }
      if (input.actorPubkeyHash && event.actorPubkeyHash !== input.actorPubkeyHash) {
        continue;
      }
      if (input.eventType && event.eventType !== input.eventType) continue;

      const reversed = await reverseEvent({
        repository: this.repository,
        event,
        reason: input.reason
      });
      if (reversed) {
        this.metrics.eventReversed();
        await this.publishStanding(event.contestId, event.participantPubkeyHash);
      }
    }
  }

  /**
   * Re-processes events a crashed worker left PENDING. This is what makes the
   * durable-insert-then-score split worth having: without it, a restart
   * between the two would silently lose points forever.
   */
  private async processSweep(): Promise<void> {
    await this.advanceLifecycle();

    const ids = await this.repository.listPendingEventIds(SWEEP_BATCH, SWEEP_MIN_AGE_MS);
    if (ids.length === 0) return;
    this.log.info({ pending: ids.length }, "Contest sweeper resuming pending events");

    const contests = new Map<string, ContestRecord>();
    for (const id of ids) {
      const event = await this.repository.getEvent(id);
      if (!event) continue;
      let contest = contests.get(event.contestId);
      if (!contest) {
        const loaded = await this.repository.getContest(event.contestId);
        if (!loaded) continue;
        contests.set(loaded.id, loaded);
        contest = loaded;
      }
      await this.settleEvent(contest, event.id, event.participantPubkeyHash);
    }
  }

  /**
   * Moves contests past their own deadlines without an operator present.
   * Auto-freeze is the important half: without it, scoring would keep running
   * after a contest ended until somebody clicked a button.
   */
  private async advanceLifecycle(): Promise<void> {
    const due = await this.repository.dueLifecycleTransitions(Date.now());
    if (due.length === 0) return;
    for (const item of due) {
      const result = await transitionContest({
        repository: this.repository,
        contestId: item.id,
        to: item.to,
        actorPubkeyHash: "system",
        action: item.to === "ACTIVE" ? "CONTEST_ACTIVATED" : "CONTEST_FROZEN",
        reason: "Automatic transition at the scheduled time."
      });
      if (result.ok) {
        this.log.info({ contestId: item.id, from: item.from, to: item.to }, "Contest advanced");
      }
    }
    this.invalidateContests();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Runs the cluster detector across every participant. Cheap enough to run at
   * freeze and on demand, too expensive to run per event — collusion is only
   * visible in aggregate, so this is where it is looked for.
   */
  async sweepClusterRisk(contestId: string): Promise<number> {
    const contest = await this.repository.getContest(contestId);
    if (!contest) return 0;
    const rules = await this.rulesFor(contest);
    const participants = await this.repository.listParticipants(contestId, 10_000, 0);

    let flagged = 0;
    for (const participant of participants) {
      const signal = await assessClusterRisk({
        repository: this.repository,
        contestId,
        participantPubkeyHash: participant.pubkeyHash,
        rules
      });
      if (!signal) continue;
      const created = await this.repository.database.withTransaction(async (tx) => {
        const inserted = await this.repository.recordRiskEvent(
          {
            contestId,
            participantPubkeyHash: participant.pubkeyHash,
            actorPubkeyHash: null,
            eventId: null,
            riskType: signal.riskType,
            severity: signal.severity,
            score: signal.score,
            evidence: signal.evidence,
            dedupeKey: signal.dedupeKey
          },
          tx
        );
        if (inserted) {
          const risk = await this.repository.cumulativeRisk(
            contestId,
            participant.pubkeyHash,
            tx
          );
          await this.repository.setParticipantRisk(
            contestId,
            participant.pubkeyHash,
            risk,
            riskBand(rules, risk),
            tx
          );
        }
        return inserted;
      });
      if (created) {
        flagged += 1;
        this.metrics.fraudFlag(signal.riskType);
      }
    }
    return flagged;
  }

  /**
   * Replays the contest window from the Whisper tables, recording anything the
   * live path missed. Idempotent by construction: every derived event carries
   * the same key it would have had when it happened, so a second reconcile
   * changes nothing.
   *
   * Run before freezing. A contest finalized without it is a contest whose
   * results depend on the queue never having dropped anything.
   */
  async reconcile(
    contestId: string,
    batchSize = 500
  ): Promise<{ scanned: number; recorded: number }> {
    const contest = await this.repository.getContest(contestId);
    if (!contest) return { scanned: 0, recorded: 0 };

    let cursor: { occurredAtMs: number; sourceId: string; eventType: string } | null = null;
    let scanned = 0;
    let recorded = 0;

    for (;;) {
      const batch = await this.repository.reconciliationBatch({
        contestId,
        startAtMs: contest.startAtMs,
        endAtMs: contest.endAtMs,
        cursor,
        limit: batchSize
      });
      if (batch.length === 0) break;

      for (const signal of batch) {
        scanned += 1;
        const input: EngagementInput = {
          eventType: signal.eventType,
          participantPubkeyHash: signal.participantPubkeyHash,
          actorPubkeyHash: signal.actorPubkeyHash,
          sourceEntityType: signal.sourceEntityType as EngagementInput["sourceEntityType"],
          sourceEntityId: signal.sourceEntityId,
          occurredAtMs: signal.occurredAtMs,
          metadata: { source: "reconciliation" }
        };
        const event = await this.repository.insertPendingEvent({
          contestId,
          participantPubkeyHash: input.participantPubkeyHash,
          actorPubkeyHash: input.actorPubkeyHash,
          eventType: input.eventType,
          sourceEntityType: input.sourceEntityType,
          sourceEntityId: input.sourceEntityId,
          occurredAtMs: input.occurredAtMs,
          idempotencyKey: buildIdempotencyKey(contestId, input),
          metadata: input.metadata ?? {}
        });
        if (!event) continue;
        recorded += 1;
        await this.settleEvent(contest, event.id, input.participantPubkeyHash);
      }

      const last = batch[batch.length - 1];
      if (!last) break;
      cursor = {
        occurredAtMs: last.occurredAtMs,
        sourceId: last.sourceEntityId,
        eventType: last.eventType
      };
      if (batch.length < batchSize) break;
    }

    return { scanned, recorded };
  }

  /**
   * Reverses every event a participant earned, used when an admin disqualifies
   * them. The events keep their rows and their evidence; only the points move.
   */
  async reverseParticipantEvents(
    contestId: string,
    participantPubkeyHash: string,
    reason: string,
    reversedBy: string
  ): Promise<number> {
    let reversed = 0;
    for (;;) {
      const events = await this.repository.listEvents(contestId, {
        participantPubkeyHash,
        status: "VALID",
        limit: 500
      });
      if (events.length === 0) break;
      for (const event of events) {
        const didReverse = await reverseEvent({
          repository: this.repository,
          event,
          reason,
          reversedBy
        });
        if (didReverse) {
          reversed += 1;
          this.metrics.eventReversed();
        }
      }
      if (events.length < 500) break;
    }
    await this.leaderboard.remove(contestId, participantPubkeyHash);
    return reversed;
  }

  /** Re-scores events an admin has released from PENDING_REVIEW. */
  async releaseHeldEvents(
    contestId: string,
    participantPubkeyHash: string
  ): Promise<number> {
    const contest = await this.repository.getContest(contestId);
    if (!contest) return 0;
    const held = await this.repository.listEvents(contestId, {
      participantPubkeyHash,
      status: "PENDING_REVIEW",
      limit: 500
    });
    let released = 0;
    for (const event of held) {
      await this.repository.database.query(
        `update contest_engagement_events
            set qualification_status = 'PENDING', processed_at = null
          where id = $1 and qualification_status = 'PENDING_REVIEW'`,
        [event.id]
      );
      await this.settleEvent(contest, event.id, participantPubkeyHash);
      released += 1;
    }
    return released;
  }

  async statusOf(contestId: string): Promise<ContestStatus | null> {
    const contest = await this.repository.getContest(contestId);
    return contest?.status ?? null;
  }

  async rulesForContest(contest: ContestRecord): Promise<ContestRules> {
    return this.rulesFor(contest);
  }

  parseRules(raw: unknown): ContestRules {
    return parseRules(raw);
  }
}

/**
 * Deterministic identity of an engagement event.
 *
 * Every retry path — an HTTP retry, a WebSocket reconnect, a worker restart, a
 * second relay instance, the reconciliation sweep — produces the same key for
 * the same real-world interaction, and the unique index turns the duplicate
 * into a no-op. The key deliberately includes both parties: one Echo can
 * legitimately earn its author points from many different reactors, and each
 * of those is a distinct event.
 */
export function buildIdempotencyKey(
  contestId: string,
  input: Pick<
    EngagementInput,
    "eventType" | "participantPubkeyHash" | "actorPubkeyHash" | "sourceEntityType" | "sourceEntityId"
  >
): string {
  const parts = [
    contestId,
    input.eventType,
    input.sourceEntityType,
    input.sourceEntityId,
    input.participantPubkeyHash,
    input.actorPubkeyHash
  ].join("|");
  // Hashed so the column stays a fixed, index-friendly width regardless of how
  // long the constituent identifiers get.
  return createHash("sha256").update(parts).digest("hex");
}
