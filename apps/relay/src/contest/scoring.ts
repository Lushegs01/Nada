import type {
  ContestEventType,
  ContestQualification,
  ContestRiskBand,
  ContestRules
} from "@nada/types";

import type { Queryable } from "../db";
import type { ContestMetrics } from "./metrics";
import type {
  ContestRecord,
  ContestRepository,
  EngagementEventRecord
} from "./repository";
import { assessEventRisk } from "./risk";
import {
  bandAtLeast,
  categoryFor,
  cooldownFor,
  dailyEventCap,
  diminishingMultiplier,
  isChallengeEvent,
  isSelfAuthored,
  periodKey,
  pointsFor,
  riskBand,
  riskMultiplier,
  utcDayStart,
  utcWeekStart
} from "./rules";

/**
 * The scoring engine.
 *
 * Everything a score depends on is decided here, on the server, from data the
 * relay verified for itself. The client never supplies points, rank,
 * eligibility, or a timestamp that matters — it supplies an authenticated
 * action, and this module decides what that action was worth.
 *
 * A single event walks: eligibility → exclusions → risk → caps → decay →
 * ledger. Each stage can only reduce the award, and every reduction is
 * recorded with its reason, so a participant asking "why did this only give me
 * one point?" has an answer that does not require reading this code.
 */

export interface ScoringOutcome {
  eventId: string;
  status: ContestQualification;
  points: number;
  reason: string | null;
  riskScore: number;
  band: ContestRiskBand;
  participantPubkeyHash: string;
  contestId: string;
}

export interface ChallengeAward {
  challengeId: string;
  eventType: ContestEventType;
  periodKey: string;
  points: number;
}

export interface ScoreEventResult {
  outcome: ScoringOutcome | null;
  /** Challenges this event completed, to be emitted as their own events. */
  challenges: ChallengeAward[];
}

const DAY_MS = 86_400_000;

/**
 * Scores one already-recorded event.
 *
 * Returns null when there was nothing to do: the event was claimed by another
 * worker, or it has already been settled. Both are ordinary outcomes under
 * at-least-once processing, not errors.
 */
export async function scoreEvent(args: {
  repository: ContestRepository;
  contest: ContestRecord;
  rules: ContestRules;
  eventId: string;
  metrics: ContestMetrics;
}): Promise<ScoreEventResult> {
  const { repository, contest, rules, eventId, metrics } = args;

  return repository.database.withTransaction(async (tx) => {
    const event = await repository.claimEventForScoring(eventId, tx);
    if (!event) {
      return { outcome: null, challenges: [] };
    }

    // Lock the earner's row for the rest of the transaction. Every cap below
    // is a read-then-write against this participant's history, so without the
    // lock two concurrent events could each see the same "points so far" and
    // both pass a cap that only one of them should.
    await tx.query(
      "select 1 from contest_participants where contest_id = $1 and pubkey_hash = $2 for update",
      [event.contestId, event.participantPubkeyHash]
    );

    const settle = async (
      status: ContestQualification,
      points: number,
      reason: string | null,
      riskScore: number,
      band: ContestRiskBand
    ): Promise<ScoringOutcome> => {
      await repository.settleEvent(
        event.id,
        {
          qualificationStatus: status,
          pointsAwarded: points,
          riskScore,
          rulesVersion: contest.rulesVersion,
          rejectionReason: reason
        },
        tx
      );
      return {
        eventId: event.id,
        status,
        points,
        reason,
        riskScore,
        band,
        participantPubkeyHash: event.participantPubkeyHash,
        contestId: event.contestId
      };
    };

    const reject = async (reason: string): Promise<ScoreEventResult> => {
      metrics.eventRejected(reason);
      return {
        outcome: await settle("REJECTED", 0, reason, 0, "LOW"),
        challenges: []
      };
    };

    // ── Eligibility ────────────────────────────────────────────────────────
    if (contest.status !== "ACTIVE") {
      return reject("contest_not_active");
    }
    if (event.occurredAtMs < contest.startAtMs || event.occurredAtMs >= contest.endAtMs) {
      return reject("outside_contest_window");
    }

    const participant = await repository.getParticipant(
      event.contestId,
      event.participantPubkeyHash,
      tx
    );
    if (!participant) {
      return reject("not_a_participant");
    }
    if (participant.eligibilityStatus === "disqualified") {
      return reject("participant_disqualified");
    }
    if (participant.eligibilityStatus !== "eligible") {
      return reject(`participant_${participant.eligibilityStatus}`);
    }

    // ── Exclusions ─────────────────────────────────────────────────────────
    if (rules.exclusions.blockedEventTypes.includes(event.eventType)) {
      return reject("event_type_excluded");
    }
    const basePoints = pointsFor(rules, event.eventType);
    if (basePoints <= 0) {
      return reject("event_type_scores_zero");
    }

    // ── Risk ───────────────────────────────────────────────────────────────
    const selfAuthored = isSelfAuthored(event.eventType);
    const assessment = await assessEventRisk({
      repository,
      tx,
      rules,
      event,
      selfAuthored
    });

    for (const signal of assessment.signals) {
      if (signal.score <= 0 && signal.riskType === "SELF_INTERACTION") continue;
      const created = await repository.recordRiskEvent(
        {
          contestId: event.contestId,
          participantPubkeyHash: event.participantPubkeyHash,
          actorPubkeyHash: event.actorPubkeyHash,
          eventId: event.id,
          riskType: signal.riskType,
          severity: signal.severity,
          score: signal.score,
          evidence: signal.evidence,
          dedupeKey: signal.dedupeKey
        },
        tx
      );
      if (created) metrics.fraudFlag(signal.riskType);
    }

    const cumulativeRisk = await repository.cumulativeRisk(
      event.contestId,
      event.participantPubkeyHash,
      tx
    );
    const band = riskBand(rules, cumulativeRisk);
    await repository.setParticipantRisk(
      event.contestId,
      event.participantPubkeyHash,
      cumulativeRisk,
      band,
      tx
    );

    if (assessment.reject) {
      metrics.eventRejected(assessment.reject);
      return {
        outcome: await settle("REJECTED", 0, assessment.reject, cumulativeRisk, band),
        challenges: []
      };
    }

    // Held, not destroyed: the event keeps its row and its evidence, and an
    // admin can release it later. This is the difference between "we withheld
    // points pending review" and "we deleted your engagement".
    if (bandAtLeast(band, rules.risk.holdForReviewAt)) {
      metrics.eventHeld();
      return {
        outcome: await settle(
          "PENDING_REVIEW",
          0,
          "risk_band_hold",
          cumulativeRisk,
          band
        ),
        challenges: []
      };
    }

    // ── Caps and decay ─────────────────────────────────────────────────────
    const capResult = await applyCaps({
      repository,
      tx,
      rules,
      event,
      basePoints,
      selfAuthored
    });
    if (capResult.reason && capResult.points === 0) {
      metrics.eventRejected(capResult.reason);
      return {
        outcome: await settle("REJECTED", 0, capResult.reason, cumulativeRisk, band),
        challenges: []
      };
    }

    // Rounded, not floored. A 25% new-identity discount on a 2-point reaction
    // floors to nothing, which reads to the earner as "that engagement never
    // happened" rather than "that engagement counted less" — and the earner
    // did nothing wrong. An exactly-zero multiplier still means zero: that is
    // the HIGH_RISK hold, and it must not round its way back to a point.
    const multiplier = assessment.eventMultiplier * riskMultiplier(rules, band);
    const points =
      multiplier === 0 ? 0 : Math.max(0, Math.round(capResult.points * multiplier));

    if (points === 0) {
      metrics.eventRejected(capResult.reason ?? "reduced_to_zero");
      return {
        outcome: await settle(
          "REJECTED",
          0,
          capResult.reason ?? "reduced_to_zero",
          cumulativeRisk,
          band
        ),
        challenges: []
      };
    }

    // ── Ledger ─────────────────────────────────────────────────────────────
    const outcome = await settle("VALID", points, capResult.reason, cumulativeRisk, band);
    const credited = await repository.appendLedger(
      {
        contestId: event.contestId,
        participantPubkeyHash: event.participantPubkeyHash,
        eventId: event.id,
        points,
        direction: "CREDIT",
        category: categoryFor(event.eventType),
        reason: describe(event.eventType)
      },
      tx
    );
    if (credited) {
      metrics.pointsAwarded(points);
      metrics.eventProcessed();
    }

    const challenges = isChallengeEvent(event.eventType)
      ? []
      : await evaluateChallenges({ repository, tx, rules, event });

    return { outcome, challenges };
  });
}

interface CapResult {
  points: number;
  /** Set when a cap or decay changed the award, naming which one. */
  reason: string | null;
}

async function applyCaps(args: {
  repository: ContestRepository;
  tx: Queryable;
  rules: ContestRules;
  event: EngagementEventRecord;
  basePoints: number;
  selfAuthored: boolean;
}): Promise<CapResult> {
  const { repository, tx, rules, event, basePoints, selfAuthored } = args;
  const dayStart = utcDayStart(event.occurredAtMs);

  // Cooldown: too soon after this actor's last event of the same type.
  const cooldown = cooldownFor(rules, event.eventType);
  if (cooldown > 0) {
    const last = await repository.lastActorEventMs(
      event.contestId,
      event.actorPubkeyHash,
      event.eventType,
      event.id,
      tx
    );
    if (last !== null && event.occurredAtMs - last < cooldown) {
      return { points: 0, reason: "cooldown" };
    }
  }

  // Per-type daily count ceiling.
  const countCap = dailyEventCap(rules, event.eventType);
  if (countCap !== null) {
    const used = await repository.eventCountSince(
      event.contestId,
      event.participantPubkeyHash,
      event.eventType,
      dayStart,
      tx
    );
    if (used >= countCap) {
      return { points: 0, reason: "daily_event_cap" };
    }
  }

  let points = basePoints;
  let reason: string | null = null;

  // Anti-collusion: repeat interaction between the same two identities decays,
  // then stops. Not applied to self-authored events, which have one party.
  if (!selfAuthored) {
    const window = rules.caps.actorPairWindowMs;
    const pair = await repository.pairActivitySince(
      event.contestId,
      event.participantPubkeyHash,
      event.actorPubkeyHash,
      event.occurredAtMs - window,
      tx
    );

    const decayed = Math.floor(
      points * diminishingMultiplier(rules, pair.interactions)
    );
    if (decayed < points) reason = "diminishing_returns";
    points = decayed;

    const pairCap = rules.caps.perActorPairPoints;
    if (pairCap > 0) {
      const remaining = Math.max(0, pairCap - pair.points);
      if (remaining <= 0) {
        return { points: 0, reason: "actor_pair_cap" };
      }
      if (points > remaining) {
        points = remaining;
        reason = "actor_pair_cap";
      }
    }
  }

  // Per-content ceiling: one viral Echo cannot be worth an unbounded score.
  const entityCap = rules.caps.perSourceEntityPoints;
  if (entityCap > 0) {
    const spent = await repository.sourceEntityPoints(
      event.contestId,
      event.sourceEntityType,
      event.sourceEntityId,
      tx
    );
    const remaining = Math.max(0, entityCap - spent);
    if (remaining <= 0) {
      return { points: 0, reason: "source_entity_cap" };
    }
    if (points > remaining) {
      points = remaining;
      reason = "source_entity_cap";
    }
  }

  // Daily ceiling on everything a participant can bank.
  const dailyCap = rules.caps.dailyPointsPerParticipant;
  if (dailyCap > 0) {
    const earned = await repository.pointsSince(
      event.contestId,
      event.participantPubkeyHash,
      dayStart,
      tx
    );
    const remaining = Math.max(0, dailyCap - earned);
    if (remaining <= 0) {
      return { points: 0, reason: "daily_points_cap" };
    }
    if (points > remaining) {
      points = remaining;
      reason = "daily_points_cap";
    }
  }

  return { points, reason };
}

/**
 * Challenges are derived, never claimed. The client cannot tell the server it
 * finished one: the server counts the qualifying events it already validated
 * and decides for itself.
 */
async function evaluateChallenges(args: {
  repository: ContestRepository;
  tx: Queryable;
  rules: ContestRules;
  event: EngagementEventRecord;
}): Promise<ChallengeAward[]> {
  const { repository, tx, rules, event } = args;
  const awards: ChallengeAward[] = [];

  for (const challenge of rules.challenges) {
    if (challenge.eventType !== event.eventType) continue;
    const windowStart =
      challenge.period === "daily"
        ? utcDayStart(event.occurredAtMs)
        : utcWeekStart(event.occurredAtMs);
    const completed = await repository.eventCountSince(
      event.contestId,
      event.participantPubkeyHash,
      challenge.eventType,
      windowStart,
      tx
    );
    // The event being scored is still PENDING→VALID inside this transaction,
    // so it is already counted by the query above.
    if (completed < challenge.count) continue;
    awards.push({
      challengeId: challenge.id,
      eventType:
        challenge.period === "daily"
          ? "DAILY_CHALLENGE_COMPLETED"
          : "WEEKLY_CHALLENGE_COMPLETED",
      periodKey: periodKey(challenge.period, event.occurredAtMs),
      points: challenge.points
    });
  }

  return awards;
}

/**
 * Reverses an event's points without deleting anything. Used when the content
 * behind an event is deleted, when an interaction is undone, and when an admin
 * disqualifies a participant.
 */
export async function reverseEvent(args: {
  repository: ContestRepository;
  event: EngagementEventRecord;
  reason: string;
  reversedBy?: string | undefined;
}): Promise<boolean> {
  const { repository, event, reason, reversedBy } = args;
  if (event.pointsAwarded <= 0 && event.qualificationStatus !== "PENDING_REVIEW") {
    // Nothing was ever credited; just mark it so the history reads correctly.
    return repository.database.withTransaction(async (tx) => {
      await repository.settleEvent(
        event.id,
        {
          qualificationStatus: "REVERSED",
          pointsAwarded: 0,
          riskScore: event.riskScore,
          rulesVersion: event.rulesVersion,
          rejectionReason: reason
        },
        tx
      );
      return true;
    });
  }

  return repository.database.withTransaction(async (tx) => {
    await tx.query(
      "select 1 from contest_participants where contest_id = $1 and pubkey_hash = $2 for update",
      [event.contestId, event.participantPubkeyHash]
    );
    const debited = await repository.appendLedger(
      {
        contestId: event.contestId,
        participantPubkeyHash: event.participantPubkeyHash,
        eventId: event.id,
        points: event.pointsAwarded,
        direction: "DEBIT",
        category: "adjustment",
        reason,
        createdBy: reversedBy
      },
      tx
    );
    await repository.settleEvent(
      event.id,
      {
        qualificationStatus: "REVERSED",
        pointsAwarded: event.pointsAwarded,
        riskScore: event.riskScore,
        rulesVersion: event.rulesVersion,
        rejectionReason: reason
      },
      tx
    );
    return debited;
  });
}

const DESCRIPTIONS: Record<ContestEventType, string> = {
  ECHO_CREATED: "Echo created",
  REFLECTION_CREATED: "Reflection written",
  RIPPLE_CREATED: "Echo rippled",
  REFLECTION_RECEIVED: "Reflection received",
  REFLECTION_REACTION_RECEIVED: "Reflection liked",
  REACTION_RECEIVED: "Echo received",
  RIPPLE_RECEIVED: "Ripple received",
  FOLLOW_RECEIVED: "New Ghost",
  COMMUNITY_ACTIVITY: "Community activity",
  DAILY_CHALLENGE_COMPLETED: "Daily challenge completed",
  WEEKLY_CHALLENGE_COMPLETED: "Weekly challenge completed"
};

export function describe(eventType: ContestEventType): string {
  return DESCRIPTIONS[eventType];
}

export { DAY_MS };
