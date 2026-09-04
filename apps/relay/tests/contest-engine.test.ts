import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { finalizeContest, transitionContest } from "../src/contest/lifecycle";
import { ContestRepository } from "../src/contest/repository";
import { defaultRules, parseRules } from "../src/contest/rules";
import { ContestService, type EngagementInput } from "../src/contest/service";
import {
  HAS_POSTGRES,
  createTestDatabase,
  silentLogger,
  type TestDatabase
} from "./helpers/contest-db";

/**
 * The contest engine, end to end against a real database.
 *
 * These are the properties a prize depends on: a point is awarded once, caps
 * hold under repetition, deleted content gives its points back, a score can
 * always be rebuilt from the ledger, and a winner cannot be declared without
 * passing through freeze and review.
 */

const AUTHOR = "a".repeat(64);
const REACTOR = "b".repeat(64);
const OUTSIDER = "c".repeat(64);

describe.skipIf(!HAS_POSTGRES)("contest engine", () => {
  let database: TestDatabase;
  let repository: ContestRepository;
  let service: ContestService;
  let contestId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 60_000);

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    // A fresh contest per test rather than a truncate: contests are the unit
    // of isolation the engine itself uses, so tests share the schema exactly
    // as production instances do.
    await database.db.query("delete from contests");
    // Reconciliation reads the Whisper tables, so a row left behind by an
    // earlier test would silently join the next contest's window.
    for (const table of [
      "whisper_reactions",
      "whisper_reflection_reactions",
      "whisper_reflections",
      "whisper_ripples",
      "whisper_follows",
      "whisper_echoes"
    ]) {
      await database.db.query(`delete from ${table}`);
    }
    repository = new ContestRepository(database.db);
    service = new ContestService(database.db, null, silentLogger);

    // Established identities. Engagement from an account with no history on
    // NADA is deliberately discounted, so without this every reaction in every
    // test would carry an unrelated penalty.
    for (const hash of [AUTHOR, REACTOR]) {
      await database.db.query(
        `insert into whisper_profiles (pubkey_hash, display_name, created_at_ms, updated_at)
         values ($1, 'Ghost', $2, now()) on conflict (pubkey_hash) do nothing`,
        [hash, Date.now() - 60 * 86_400_000]
      );
    }

    const contest = await repository.createContest({
      name: "September League",
      slug: `september-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: "",
      // A month-long window, so a test can space events realistically without
      // falling outside the contest.
      startAtMs: Date.now() - 30 * 86_400_000,
      endAtMs: Date.now() + 86_400_000,
      entryFeeMinor: 0,
      entryCurrency: "NGN",
      prizeAmountMinor: 3_000_000,
      prizeCurrency: "NGN",
      // Challenges are exercised in their own test. Leaving them on here would
      // add a second award to every assertion about a single event's worth.
      rules: { ...defaultRules(), challenges: [] },
      createdBy: "admin"
    });
    contestId = contest.id;
    await activate(contestId);
    await join(AUTHOR, "Ghost_82");
    await join(REACTOR, "Ghost_14");
  });

  /** Publishes a new immutable rules version and points the contest at it. */
  async function useRules(rules: ReturnType<typeof defaultRules>): Promise<void> {
    await database.db.withTransaction((tx) =>
      repository.addRuleVersion(contestId, rules, "admin", "test", tx)
    );
    service.invalidateRules();
    service.invalidateContests();
  }

  async function activate(id: string): Promise<void> {
    await transitionContest({
      repository,
      contestId: id,
      to: "REGISTRATION_OPEN",
      actorPubkeyHash: "admin",
      action: "CONTEST_PUBLISHED",
      reason: "test"
    });
    await transitionContest({
      repository,
      contestId: id,
      to: "ACTIVE",
      actorPubkeyHash: "admin",
      action: "CONTEST_ACTIVATED",
      reason: "test"
    });
    service.invalidateContests();
  }

  async function join(pubkeyHash: string, displayName: string): Promise<void> {
    await repository.upsertParticipant({
      contestId,
      pubkeyHash,
      displayName,
      paymentStatus: "not_required",
      eligibilityStatus: "eligible"
    });
    service.invalidateParticipant(contestId, pubkeyHash);
  }

  const echo = (id: string, at = Date.now()): EngagementInput => ({
    eventType: "ECHO_CREATED",
    participantPubkeyHash: AUTHOR,
    actorPubkeyHash: AUTHOR,
    sourceEntityType: "echo",
    sourceEntityId: id,
    occurredAtMs: at
  });

  const reaction = (
    id: string,
    actor = REACTOR,
    at = Date.now()
  ): EngagementInput => ({
    eventType: "REACTION_RECEIVED",
    participantPubkeyHash: AUTHOR,
    actorPubkeyHash: actor,
    sourceEntityType: "echo",
    sourceEntityId: id,
    occurredAtMs: at
  });

  /**
   * Deterministic pseudo-jitter. Perfectly even spacing is what the automation
   * detector exists to catch, so a fixture exercising a cap has to look like a
   * person or it will trip a different rule and prove nothing.
   */
  function jitter(index: number): number {
    return ((index * 7919) % 97) * 1_000;
  }

  async function score(pubkeyHash = AUTHOR): Promise<number> {
    const participant = await repository.getParticipant(contestId, pubkeyHash);
    return participant?.currentScore ?? 0;
  }

  it("scores an event and writes one ledger entry for it", async () => {
    await service.ingest(echo("echo-1"));

    expect(await score()).toBe(10);
    const ledger = await repository.listLedger(contestId, AUTHOR, 10);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.direction).toBe("CREDIT");
    expect(ledger[0]?.points).toBe(10);
    expect(ledger[0]?.category).toBe("content");
  });

  it("never awards the same interaction twice", async () => {
    // A WebSocket reconnect, an HTTP retry and a second relay instance all
    // produce this exact call. It must be worth ten points in total, once.
    await service.ingest(echo("echo-1"));
    await service.ingest(echo("echo-1"));
    await service.ingest(echo("echo-1"));

    expect(await score()).toBe(10);
    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 50
    });
    expect(events).toHaveLength(1);
  });

  it("rebuilds an identical score from the ledger alone", async () => {
    await service.ingest(echo("echo-1"));
    await service.ingest(reaction("echo-1"));

    const cached = await score();
    const reconstructed = await repository.reconstructScore(contestId, AUTHOR);
    expect(reconstructed).toBe(cached);
    expect(cached).toBe(12);
  });

  it("refuses to score self-interaction", async () => {
    await service.ingest(reaction("echo-1", AUTHOR));

    expect(await score()).toBe(0);
    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 10
    });
    expect(events[0]?.qualificationStatus).toBe("REJECTED");
    expect(events[0]?.rejectionReason).toBe("self_interaction");
  });

  it("refuses to score anyone who has not joined", async () => {
    await service.ingest({
      eventType: "ECHO_CREATED",
      participantPubkeyHash: OUTSIDER,
      actorPubkeyHash: OUTSIDER,
      sourceEntityType: "echo",
      sourceEntityId: "echo-x",
      occurredAtMs: Date.now()
    });
    expect(await score(OUTSIDER)).toBe(0);
    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: OUTSIDER,
      limit: 10
    });
    expect(events).toHaveLength(0);
  });

  it("refuses events from outside the contest window", async () => {
    await service.ingest(echo("echo-early", Date.now() - 40 * 86_400_000));
    expect(await score()).toBe(0);
  });

  it("decays repeat interaction from the same ghost to nothing", async () => {
    // Two accounts trading engagement is the cheapest attack on a leaderboard.
    // The slope makes it unprofitable long before any wall is reached.
    const rules = defaultRules();
    const spaced = (i: number) => Date.now() - (40 - i) * 60_000 + jitter(i);
    for (let i = 0; i < 20; i += 1) {
      await service.ingest(reaction(`echo-${i}`, REACTOR, spaced(i)));
    }

    const total = await score();
    expect(total).toBeLessThanOrEqual(rules.caps.perActorPairPoints);
    expect(total).toBeGreaterThan(0);

    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 50
    });
    expect(events.map((event) => event.rejectionReason)).toContain(
      "diminishing_returns"
    );
    // Everything past the allowance is worth nothing, so twenty reciprocal
    // reactions buy about as much as three.
    const valid = events.filter((event) => event.qualificationStatus === "VALID");
    expect(valid.length).toBeLessThan(8);
  });

  it("caps what one ghost can generate for another even without decay", async () => {
    // Decay normally bites first. With it disabled, the pair cap is the last
    // line, and it must hold on its own.
    const rules = defaultRules();
    await useRules({
      ...rules,
      challenges: [],
      diminishing: { fullValueInteractions: 1_000, decay: 1, floor: 1 }
    });

    for (let i = 0; i < 40; i += 1) {
      await service.ingest(
        reaction(`echo-${i}`, REACTOR, Date.now() - (60 - i) * 60_000 + jitter(i))
      );
    }

    expect(await score()).toBeLessThanOrEqual(rules.caps.perActorPairPoints);
    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 60
    });
    expect(events.map((event) => event.rejectionReason)).toContain("actor_pair_cap");
  });

  it("discounts engagement from an identity with no history on NADA", async () => {
    const fresh = "9".repeat(64);
    await service.ingest(reaction("echo-1", fresh, Date.now() - 60_000));

    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 5
    });
    // A quarter of face value, not zero: the earner did nothing wrong.
    expect(events[0]?.pointsAwarded).toBe(1);
    const risk = await repository.listRiskEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 5,
      offset: 0
    });
    expect(risk.some((flag) => flag.riskType === "NEW_ACCOUNT_FARMING")).toBe(true);
  });

  it("enforces the per-type daily count cap", async () => {
    const cap = defaultRules().caps.dailyEventsPerType.ECHO_CREATED ?? 0;
    expect(cap).toBeGreaterThan(0);
    // Spaced past the cooldown so the cap, not the cooldown, is what bites.
    for (let i = 0; i < cap + 3; i += 1) {
      await service.ingest(
        echo(`echo-${i}`, Date.now() - (cap + 5 - i) * 200_000 + jitter(i))
      );
    }
    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      status: "VALID",
      limit: 100
    });
    expect(events).toHaveLength(cap);
    expect(await score()).toBe(cap * 10);
  });

  it("enforces the cooldown between two events of the same type", async () => {
    const now = Date.now();
    await service.ingest(echo("echo-1", now - 200_000));
    await service.ingest(echo("echo-2", now - 199_000));

    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 10
    });
    const cooled = events.find((event) => event.rejectionReason === "cooldown");
    expect(cooled).toBeDefined();
    expect(await score()).toBe(10);
  });

  it("caps what one piece of content can ever be worth", async () => {
    const cap = defaultRules().caps.perSourceEntityPoints;
    // Many distinct reactors so the per-pair cap is not what stops it.
    for (let i = 0; i < 120; i += 1) {
      const actor = `${i.toString(16).padStart(2, "0")}${"f".repeat(62)}`;
      await service.ingest(
        reaction("echo-hot", actor, Date.now() - (200 - i) * 1_000 + jitter(i))
      );
    }
    const spent = await repository.sourceEntityPoints(
      contestId,
      "echo",
      "echo-hot",
      database.db
    );
    expect(spent).toBeLessThanOrEqual(cap);
  });

  it("gives points back when the content behind them is deleted", async () => {
    await service.ingest(echo("echo-1"));
    await service.ingest(reaction("echo-1"));
    expect(await score()).toBe(12);

    await new Promise<void>((resolve) => {
      service.reverse({
        sourceEntityType: "echo",
        sourceEntityId: "echo-1",
        reason: "echo_deleted"
      });
      setTimeout(resolve, 250);
    });

    expect(await score()).toBe(0);
    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 10
    });
    // Evidence survives the reversal; only the points move.
    expect(events.every((event) => event.qualificationStatus === "REVERSED")).toBe(true);
    const ledger = await repository.listLedger(contestId, AUTHOR, 10);
    expect(ledger.filter((row) => row.direction === "DEBIT")).toHaveLength(2);
  });

  it("cannot debit the same reversal twice", async () => {
    await service.ingest(echo("echo-1"));
    const [event] = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 1
    });
    expect(event).toBeDefined();

    const { reverseEvent } = await import("../src/contest/scoring");
    await reverseEvent({ repository, event: event!, reason: "manual" });
    await reverseEvent({ repository, event: event!, reason: "manual" });

    expect(await score()).toBe(0);
    const ledger = await repository.listLedger(contestId, AUTHOR, 10);
    expect(ledger.filter((row) => row.direction === "DEBIT")).toHaveLength(1);
  });

  it("awards a daily challenge once the qualifying count is reached", async () => {
    await useRules(defaultRules());
    // daily_reflect: three Reflections in a UTC day.
    for (let i = 0; i < 3; i += 1) {
      await service.ingest({
        eventType: "REFLECTION_CREATED",
        participantPubkeyHash: AUTHOR,
        actorPubkeyHash: AUTHOR,
        sourceEntityType: "reflection",
        sourceEntityId: `reflection-${i}`,
        occurredAtMs: Date.now() - (3 - i) * 30_000
      });
    }

    const challenge = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 20
    });
    const awarded = challenge.filter(
      (event) => event.eventType === "DAILY_CHALLENGE_COMPLETED"
    );
    expect(awarded.length).toBeGreaterThanOrEqual(1);
    expect(awarded.every((event) => event.qualificationStatus === "VALID")).toBe(true);
    // Only once per period, no matter how many further Reflections land.
    await service.ingest({
      eventType: "REFLECTION_CREATED",
      participantPubkeyHash: AUTHOR,
      actorPubkeyHash: AUTHOR,
      sourceEntityType: "reflection",
      sourceEntityId: "reflection-extra",
      occurredAtMs: Date.now()
    });
    const after = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 30
    });
    expect(
      after.filter((event) => event.eventType === "DAILY_CHALLENGE_COMPLETED")
    ).toHaveLength(awarded.length);
  });

  it("holds events for review instead of scoring them at high risk", async () => {
    // A ruleset that treats a single repeated-actor signal as disqualifying,
    // so the hold behaviour is observable without simulating a whole farm.
    await database.db.query(
      `insert into contest_rule_versions (contest_id, version, rules, note, created_by, created_at)
       values ($1, 2, $2::jsonb, 'test', 'admin', now())`,
      [
        contestId,
        JSON.stringify(
          parseRules({
            points: { REACTION_RECEIVED: 2 },
            caps: { perActorPairPoints: 1_000, dailyPointsPerParticipant: 1_000 },
            diminishing: { fullValueInteractions: 100, decay: 1, floor: 1 },
            newIdentity: { windowMs: 0, actorMultiplier: 1 },
            risk: {
              bands: { watch: 1, suspicious: 2, highRisk: 3 },
              weights: { REPEATED_ACTOR: 90 },
              signals: { repeatedActorPerDay: 1 },
              holdForReviewAt: "HIGH_RISK"
            }
          })
        )
      ]
    );
    await database.db.query("update contests set rules_version = 2 where id = $1", [
      contestId
    ]);
    service.invalidateRules();
    service.invalidateContests();

    await service.ingest(reaction("echo-1", REACTOR, Date.now() - 5_000));
    await service.ingest(reaction("echo-2", REACTOR, Date.now() - 4_000));

    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 10
    });
    const held = events.filter((event) => event.qualificationStatus === "PENDING_REVIEW");
    expect(held.length).toBeGreaterThan(0);
    expect(held[0]?.rejectionReason).toBe("risk_band_hold");

    const risk = await repository.listRiskEvents(contestId, {
      participantPubkeyHash: AUTHOR,
      limit: 10,
      offset: 0
    });
    // The detector's working is preserved, not just its verdict.
    expect(risk.some((flag) => flag.riskType === "REPEATED_ACTOR")).toBe(true);
    expect(risk[0]?.evidence).toBeTruthy();
  });

  it("ranks the leaderboard from Postgres and finds a participant's rank", async () => {
    await service.ingest(echo("echo-1"));
    await service.ingest({
      eventType: "ECHO_CREATED",
      participantPubkeyHash: REACTOR,
      actorPubkeyHash: REACTOR,
      sourceEntityType: "echo",
      sourceEntityId: "echo-2",
      occurredAtMs: Date.now()
    });
    await service.ingest(reaction("echo-1"));

    const page = await repository.leaderboardPage(contestId, 10, 0);
    expect(page[0]?.pubkeyHash).toBe(AUTHOR);
    expect(page[0]?.rank).toBe(1);
    expect(await repository.rankOf(contestId, REACTOR)).toBe(2);

    const standing = await service.leaderboard.standing(contestId, REACTOR);
    expect(standing.rank).toBe(2);
    expect(standing.pointsToNextRank).toBeGreaterThan(0);
  });

  it("recovers events a crashed worker left pending", async () => {
    // Simulates the exact crash window: the durable row exists, the scoring
    // pass never ran. Without the sweeper those points are lost forever.
    const inserted = await repository.insertPendingEvent({
      contestId,
      participantPubkeyHash: AUTHOR,
      actorPubkeyHash: AUTHOR,
      eventType: "ECHO_CREATED",
      sourceEntityType: "echo",
      sourceEntityId: "echo-orphan",
      occurredAtMs: Date.now(),
      idempotencyKey: "orphan-key",
      metadata: {}
    });
    expect(inserted).not.toBeNull();
    await database.db.query(
      "update contest_engagement_events set created_at = now() - interval '10 minutes' where id = $1",
      [inserted!.id]
    );

    expect(await score()).toBe(0);
    await service.sweep();
    expect(await score()).toBe(10);
  });

  it("replays a missed window from the Whisper tables without double-counting", async () => {
    // The queue is best-effort; the Whisper rows are the product's own record.
    // Reconciliation is what turns the second into the first.
    const now = Date.now();
    await database.db.query(
      `insert into whisper_echoes (id, author_pubkey_hash, author_name, body, created_at_ms, updated_at)
       values ('11111111-1111-4111-8111-111111111111', $1, 'Ghost_82', 'hello', $2, now())`,
      [AUTHOR, now - 30_000]
    );
    await database.db.query(
      `insert into whisper_reactions (echo_id, reactor_pubkey_hash, created_at_ms)
       values ('11111111-1111-4111-8111-111111111111', $1, $2)`,
      [REACTOR, now - 20_000]
    );

    const first = await service.reconcile(contestId);
    expect(first.recorded).toBeGreaterThan(0);
    const afterFirst = await score();
    expect(afterFirst).toBe(12);

    const second = await service.reconcile(contestId);
    expect(second.recorded).toBe(0);
    expect(await score()).toBe(afterFirst);
  });

  it("scores events that were still in flight when the contest froze", async () => {
    // The worst moment to lose an event is the last minute of a contest. A row
    // recorded but not yet scored at the deadline has to survive the freeze,
    // or the standings a prize is paid on are missing their final minutes.
    const inserted = await repository.insertPendingEvent({
      contestId,
      participantPubkeyHash: AUTHOR,
      actorPubkeyHash: AUTHOR,
      eventType: "ECHO_CREATED",
      sourceEntityType: "echo",
      sourceEntityId: "echo-in-flight",
      occurredAtMs: Date.now() - 5_000,
      idempotencyKey: "in-flight-key",
      metadata: {}
    });
    expect(inserted).not.toBeNull();

    await transitionContest({
      repository,
      contestId,
      to: "FROZEN",
      actorPubkeyHash: "admin",
      action: "CONTEST_FROZEN",
      reason: "ended"
    });
    service.invalidateContests();
    expect(await score()).toBe(0);

    await service.reconcile(contestId);
    expect(await score()).toBe(10);
  });

  it("scores nothing once a contest is finalized", async () => {
    await transitionContest({
      repository, contestId, to: "FROZEN",
      actorPubkeyHash: "admin", action: "CONTEST_FROZEN", reason: "ended"
    });
    await transitionContest({
      repository, contestId, to: "UNDER_REVIEW",
      actorPubkeyHash: "admin", action: "CONTEST_UNDER_REVIEW", reason: "reconciled"
    });
    const contest = await repository.getContest(contestId);
    await finalizeContest({
      repository, contest: contest!, actorPubkeyHash: "admin",
      reason: "reviewed", winnerCount: 3
    });

    const inserted = await repository.insertPendingEvent({
      contestId,
      participantPubkeyHash: AUTHOR,
      actorPubkeyHash: AUTHOR,
      eventType: "ECHO_CREATED",
      sourceEntityType: "echo",
      sourceEntityId: "echo-too-late",
      occurredAtMs: Date.now() - 5_000,
      idempotencyKey: "too-late-key",
      metadata: {}
    });
    await service.reconcile(contestId);

    const event = await repository.getEvent(inserted!.id);
    expect(event?.qualificationStatus).toBe("REJECTED");
    expect(event?.rejectionReason).toBe("contest_not_scoring");
    expect(await score()).toBe(0);
  });

  it("takes a disqualified participant's points off the board", async () => {
    await service.ingest(echo("echo-1"));
    await service.ingest(reaction("echo-1"));
    expect(await score()).toBe(12);

    await database.db.withTransaction((tx) =>
      repository.disqualifyParticipant(contestId, AUTHOR, "collusion", tx)
    );
    const reversed = await service.reverseParticipantEvents(
      contestId,
      AUTHOR,
      "Disqualified: collusion",
      "admin"
    );

    expect(reversed).toBe(2);
    expect(await score()).toBe(0);
    const board = await repository.leaderboardPage(contestId, 10, 0);
    expect(board.some((entry) => entry.pubkeyHash === AUTHOR)).toBe(false);
  });

  it("re-scores events an admin releases from review", async () => {
    const inserted = await repository.insertPendingEvent({
      contestId,
      participantPubkeyHash: AUTHOR,
      actorPubkeyHash: REACTOR,
      eventType: "REACTION_RECEIVED",
      sourceEntityType: "echo",
      sourceEntityId: "echo-held",
      occurredAtMs: Date.now(),
      idempotencyKey: "held-key",
      metadata: {}
    });
    await database.db.query(
      "update contest_engagement_events set qualification_status = 'PENDING_REVIEW' where id = $1",
      [inserted!.id]
    );

    const released = await service.releaseHeldEvents(contestId, AUTHOR);
    expect(released).toBe(1);
    expect(await score()).toBe(2);
  });

  it("only declares a winner after freeze, reconciliation and review", async () => {
    await service.ingest(echo("echo-1"));
    await service.ingest(reaction("echo-1"));

    const contest = await repository.getContest(contestId);
    // Straight from ACTIVE is refused: the review is not optional.
    const premature = await finalizeContest({
      repository,
      contest: contest!,
      actorPubkeyHash: "admin",
      reason: "too soon",
      winnerCount: 3
    });
    expect(premature.ok).toBe(false);

    await transitionContest({
      repository,
      contestId,
      to: "FROZEN",
      actorPubkeyHash: "admin",
      action: "CONTEST_FROZEN",
      reason: "ended"
    });
    await service.reconcile(contestId);
    await service.sweepClusterRisk(contestId);
    await transitionContest({
      repository,
      contestId,
      to: "UNDER_REVIEW",
      actorPubkeyHash: "admin",
      action: "CONTEST_UNDER_REVIEW",
      reason: "reconciled"
    });

    const frozen = await repository.getContest(contestId);
    const result = await finalizeContest({
      repository,
      contest: frozen!,
      actorPubkeyHash: "admin",
      reason: "reviewed",
      winnerCount: 3
    });
    expect(result.ok).toBe(true);
    expect(result.contest?.status).toBe("FINALIZED");

    const winners = await repository.listWinners(contestId);
    expect(winners[0]?.participantPubkeyHash).toBe(AUTHOR);
    expect(winners[0]?.rank).toBe(1);
    // Staged, not paid: a human still has to approve.
    expect(winners[0]?.reviewStatus).toBe("PENDING");
    expect(winners[0]?.payoutStatus).toBe("PENDING");
    expect(winners[0]?.prizeAmountMinor).toBe(3_000_000);
  });

  it("computes final scores from the ledger, not the cached column", async () => {
    await service.ingest(echo("echo-1"));
    // Corrupt the cache the way a lost write or a bad deploy would.
    await database.db.query(
      "update contest_participants set current_score = 999999 where contest_id = $1 and pubkey_hash = $2",
      [contestId, AUTHOR]
    );

    await transitionContest({
      repository, contestId, to: "FROZEN",
      actorPubkeyHash: "admin", action: "CONTEST_FROZEN", reason: "ended"
    });
    await transitionContest({
      repository, contestId, to: "UNDER_REVIEW",
      actorPubkeyHash: "admin", action: "CONTEST_UNDER_REVIEW", reason: "reconciled"
    });
    const contest = await repository.getContest(contestId);
    await finalizeContest({
      repository, contest: contest!, actorPubkeyHash: "admin",
      reason: "reviewed", winnerCount: 3
    });

    const participant = await repository.getParticipant(contestId, AUTHOR);
    expect(participant?.finalScore).toBe(10);
    expect(participant?.currentScore).toBe(10);
  });

  it("refuses to record a payout for a winner nobody approved", async () => {
    await service.ingest(echo("echo-1"));
    await transitionContest({
      repository, contestId, to: "FROZEN",
      actorPubkeyHash: "admin", action: "CONTEST_FROZEN", reason: "ended"
    });
    await transitionContest({
      repository, contestId, to: "UNDER_REVIEW",
      actorPubkeyHash: "admin", action: "CONTEST_UNDER_REVIEW", reason: "reconciled"
    });
    const contest = await repository.getContest(contestId);
    await finalizeContest({
      repository, contest: contest!, actorPubkeyHash: "admin",
      reason: "reviewed", winnerCount: 3
    });

    const blocked = await database.db.withTransaction((tx) =>
      repository.setWinnerPayout(contestId, AUTHOR, "PAID", "ref-1", "", tx)
    );
    expect(blocked).toBe(0);

    await database.db.withTransaction((tx) =>
      repository.setWinnerReview(contestId, AUTHOR, "APPROVED", "admin", tx)
    );
    const allowed = await database.db.withTransaction((tx) =>
      repository.setWinnerPayout(contestId, AUTHOR, "PAID", "ref-1", "", tx)
    );
    expect(allowed).toBe(1);
  });

  it("activates a paid entrant only from the payment provider, exactly once", async () => {
    const paidHash = "d".repeat(64);
    await repository.upsertParticipant({
      contestId,
      pubkeyHash: paidHash,
      displayName: "Ghost_91",
      paymentStatus: "pending",
      eligibilityStatus: "pending_payment"
    });
    await repository.createEntryPayment({
      contestId,
      pubkeyHash: paidHash,
      providerSessionId: "cs_test_1",
      amountMinor: 50_000,
      currency: "NGN"
    });

    const first = await repository.settleEntryPayment({
      providerSessionId: "cs_test_1",
      contestId,
      pubkeyHash: paidHash,
      paymentReference: "pi_1",
      amountMinor: 50_000,
      currency: "NGN",
      status: "paid"
    });
    expect(first).toBe(true);
    expect((await repository.getParticipant(contestId, paidHash))?.eligibilityStatus).toBe(
      "eligible"
    );

    // Stripe redelivers. The second delivery must change nothing.
    const replay = await repository.settleEntryPayment({
      providerSessionId: "cs_test_1",
      contestId,
      pubkeyHash: paidHash,
      paymentReference: "pi_1",
      amountMinor: 50_000,
      currency: "NGN",
      status: "paid"
    });
    expect(replay).toBe(false);

    const payments = await database.db.query<{ n: string }>(
      "select count(*) as n from contest_entry_payments where contest_id = $1",
      [contestId]
    );
    expect(Number(payments.rows[0]?.n)).toBe(1);
  });

  it("does not score a participant whose entry is unpaid", async () => {
    const paidHash = "e".repeat(64);
    await repository.upsertParticipant({
      contestId,
      pubkeyHash: paidHash,
      displayName: "Ghost_77",
      paymentStatus: "pending",
      eligibilityStatus: "pending_payment"
    });
    service.invalidateParticipant(contestId, paidHash);

    await service.ingest({
      eventType: "ECHO_CREATED",
      participantPubkeyHash: paidHash,
      actorPubkeyHash: paidHash,
      sourceEntityType: "echo",
      sourceEntityId: "echo-unpaid",
      occurredAtMs: Date.now()
    });

    expect(await score(paidHash)).toBe(0);
    const events = await repository.listEvents(contestId, {
      participantPubkeyHash: paidHash,
      limit: 5
    });
    expect(events[0]?.rejectionReason).toBe("participant_pending_payment");
  });

  it("records every privileged change with its actor and reason", async () => {
    await transitionContest({
      repository,
      contestId,
      to: "FROZEN",
      actorPubkeyHash: "admin-key",
      action: "CONTEST_FROZEN",
      reason: "contest ended"
    });
    const audit = await repository.listAudit(contestId, 20, 0);
    const frozen = audit.find((entry) => entry.action === "CONTEST_FROZEN");
    expect(frozen?.actorPubkeyHash).toBe("admin-key");
    expect(frozen?.reason).toBe("contest ended");
    expect(frozen?.before).toMatchObject({ status: "ACTIVE" });
    expect(frozen?.after).toMatchObject({ status: "FROZEN" });
  });

  it("applies migrations once and is safe to re-run", async () => {
    const { MIGRATIONS } = await import("@nada/db");
    const { ensureRelaySchema } = await import("../src/db");
    const applied = await ensureRelaySchema(database.db);
    expect(applied).toHaveLength(0);
    const recorded = await database.db.query<{ n: string }>(
      "select count(*) as n from schema_migrations"
    );
    expect(Number(recorded.rows[0]?.n)).toBe(MIGRATIONS.length);
  });
});
