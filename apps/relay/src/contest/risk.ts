import type { ContestRiskType, ContestRules } from "@nada/types";

import type { Queryable } from "../db";
import type { ContestRepository, EngagementEventRecord } from "./repository";
import { riskWeight } from "./rules";

/**
 * Anti-farming.
 *
 * Two principles shape this file. First, no single rule bans anyone: signals
 * accumulate into a score, the score maps onto a band, and the band decides
 * whether points are reduced, withheld for review, or paid in full. A person
 * who posts a lot at lunchtime trips a frequency signal; a bot farm trips six.
 *
 * Second, nothing here destroys evidence. A suspicious event keeps its row and
 * gains a `contest_risk_events` record naming exactly what was seen and why,
 * so an admin reviewing a disqualification is reading the detector's own
 * working, not a verdict.
 *
 * Signals are computed from data NADA already keeps. `SUSPICIOUS_NETWORK` is
 * deliberately not implemented: it would require logging client IPs, which the
 * relay does not do and must not start doing for a leaderboard.
 */

export interface RiskSignal {
  riskType: ContestRiskType;
  severity: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  evidence: Record<string, unknown>;
  /** Distinguishes recurrences of one signal so each is recorded once. */
  dedupeKey: string;
}

export interface RiskAssessment {
  signals: RiskSignal[];
  /** Points multiplier contributed by per-event signals (not by the band). */
  eventMultiplier: number;
  /** Set when the event must not score at all, with the reason. */
  reject: string | null;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Evaluates one event against every per-event signal.
 *
 * Runs inside the scoring transaction, so each query sees a consistent
 * snapshot of the event history it is judging against.
 */
export async function assessEventRisk(args: {
  repository: ContestRepository;
  tx: Queryable;
  rules: ContestRules;
  event: EngagementEventRecord;
  /**
   * True for events where the earner *is* the actor — creating an Echo, a
   * Reflection, completing a challenge. Interaction signals that compare two
   * identities are meaningless there, and applying them would penalise a new
   * user for their own first post.
   */
  selfAuthored: boolean;
}): Promise<RiskAssessment> {
  const { repository, tx, rules, event, selfAuthored } = args;
  const { signals: thresholds } = rules.risk;
  const signals: RiskSignal[] = [];
  let multiplier = 1;
  const reject: string | null = null;

  // Self-interaction never scores. It is not necessarily fraud — liking your
  // own Echo is ordinary behaviour — so it carries whatever weight the ruleset
  // assigns (zero by default) rather than an automatic penalty.
  if (!selfAuthored && event.actorPubkeyHash === event.participantPubkeyHash) {
    signals.push({
      riskType: "SELF_INTERACTION",
      severity: "LOW",
      score: riskWeight(rules, "SELF_INTERACTION"),
      evidence: { eventType: event.eventType, sourceEntityId: event.sourceEntityId },
      dedupeKey: `${dayKey(event.occurredAtMs)}:${event.eventType}`
    });
    return { signals, eventMultiplier: 0, reject: "self_interaction" };
  }

  const [
    actorLastMinute,
    participantLastMinute,
    pairDay,
    sourceEvents,
    actorTimestamps,
    actorFirstSeenMs
  ] = await Promise.all([
    repository.actorEventCountSince(
      event.contestId,
      event.actorPubkeyHash,
      event.occurredAtMs - MINUTE_MS,
      tx
    ),
    repository.participantEventCountSince(
      event.contestId,
      event.participantPubkeyHash,
      event.occurredAtMs - MINUTE_MS,
      tx
    ),
    repository.pairActivitySince(
      event.contestId,
      event.participantPubkeyHash,
      event.actorPubkeyHash,
      event.occurredAtMs - DAY_MS,
      tx
    ),
    repository.sourceEntityEventCount(
      event.contestId,
      event.sourceEntityType,
      event.sourceEntityId,
      tx
    ),
    repository.recentActorTimestamps(
      event.contestId,
      event.actorPubkeyHash,
      thresholds.automationSampleSize,
      tx
    ),
    repository.identityFirstSeenMs(event.actorPubkeyHash, tx)
  ]);

  if (actorLastMinute > thresholds.rapidInteractionPerMinute) {
    signals.push({
      riskType: "RAPID_INTERACTION",
      severity: "MEDIUM",
      score: riskWeight(rules, "RAPID_INTERACTION"),
      evidence: {
        actorEventsLastMinute: actorLastMinute,
        threshold: thresholds.rapidInteractionPerMinute
      },
      dedupeKey: `${Math.floor(event.occurredAtMs / MINUTE_MS)}:${event.actorPubkeyHash}`
    });
    multiplier = Math.min(multiplier, 0.5);
  }

  if (participantLastMinute > thresholds.burstReceivedPerMinute) {
    signals.push({
      riskType: "BURST_ACTIVITY",
      severity: "MEDIUM",
      score: riskWeight(rules, "BURST_ACTIVITY"),
      evidence: {
        receivedLastMinute: participantLastMinute,
        threshold: thresholds.burstReceivedPerMinute
      },
      dedupeKey: `${Math.floor(event.occurredAtMs / MINUTE_MS)}`
    });
    multiplier = Math.min(multiplier, 0.5);
  }

  if (!selfAuthored && pairDay.interactions >= thresholds.repeatedActorPerDay) {
    signals.push({
      riskType: "REPEATED_ACTOR",
      severity: "MEDIUM",
      score: riskWeight(rules, "REPEATED_ACTOR"),
      evidence: {
        actor: event.actorPubkeyHash,
        interactionsLast24h: pairDay.interactions,
        pointsLast24h: pairDay.points,
        threshold: thresholds.repeatedActorPerDay
      },
      dedupeKey: `${dayKey(event.occurredAtMs)}:${event.actorPubkeyHash}`
    });
  }

  if (sourceEvents >= thresholds.repeatedTargetPerDay) {
    signals.push({
      riskType: "REPEATED_TARGET",
      severity: "LOW",
      score: riskWeight(rules, "REPEATED_TARGET"),
      evidence: {
        sourceEntityId: event.sourceEntityId,
        events: sourceEvents,
        threshold: thresholds.repeatedTargetPerDay
      },
      dedupeKey: `${event.sourceEntityType}:${event.sourceEntityId}`
    });
  }

  // A metronome is not a person. Consecutive interactions whose gaps barely
  // vary are the cheapest reliable automation tell, and unlike a raw rate it
  // does not punish someone who simply reads fast.
  const automation = detectAutomation(actorTimestamps, thresholds.automationJitterMs);
  if (actorTimestamps.length >= thresholds.automationSampleSize && automation.detected) {
    signals.push({
      riskType: "AUTOMATION_PATTERN",
      severity: "HIGH",
      score: riskWeight(rules, "AUTOMATION_PATTERN"),
      evidence: {
        sampleSize: actorTimestamps.length,
        meanGapMs: automation.meanGapMs,
        jitterMs: automation.jitterMs,
        threshold: thresholds.automationJitterMs
      },
      dedupeKey: `${Math.floor(event.occurredAtMs / DAY_MS)}:${event.actorPubkeyHash}`
    });
    multiplier = Math.min(multiplier, 0.25);
  }

  // Engagement from an identity with no history is worth less until it has
  // one. `null` means the actor has left no trace on NADA at all, which is
  // exactly the profile of an account minted to inflate someone's score.
  const actorAgeMs =
    actorFirstSeenMs === null ? 0 : Math.max(0, event.occurredAtMs - actorFirstSeenMs);
  if (
    !selfAuthored &&
    rules.newIdentity.windowMs > 0 &&
    actorAgeMs < rules.newIdentity.windowMs
  ) {
    signals.push({
      riskType: "NEW_ACCOUNT_FARMING",
      severity: "LOW",
      score: riskWeight(rules, "NEW_ACCOUNT_FARMING"),
      evidence: {
        actor: event.actorPubkeyHash,
        actorAgeMs,
        windowMs: rules.newIdentity.windowMs
      },
      dedupeKey: `${dayKey(event.occurredAtMs)}:${event.actorPubkeyHash}`
    });
    multiplier = Math.min(multiplier, rules.newIdentity.actorMultiplier);
  }

  return { signals, eventMultiplier: multiplier, reject };
}

/**
 * Cluster detection, run outside the hot path (at freeze, and on demand from
 * the admin console). A participant whose points come overwhelmingly from one
 * other identity is the signature of a two-account ring, and it is only
 * visible in aggregate — no single event looks wrong.
 */
export async function assessClusterRisk(args: {
  repository: ContestRepository;
  contestId: string;
  participantPubkeyHash: string;
  rules: ContestRules;
}): Promise<RiskSignal | null> {
  const { repository, contestId, participantPubkeyHash, rules } = args;
  const { share, events, topActor } = await repository.topContributorShare(
    contestId,
    participantPubkeyHash
  );
  const thresholds = rules.risk.signals;
  if (
    events < thresholds.clusterMinEvents ||
    share < thresholds.clusterDominanceRatio ||
    !topActor
  ) {
    return null;
  }
  return {
    riskType: "ENGAGEMENT_CLUSTER",
    severity: "HIGH",
    score: riskWeight(rules, "ENGAGEMENT_CLUSTER"),
    evidence: {
      topContributor: topActor,
      share: Number(share.toFixed(3)),
      receivedEvents: events,
      threshold: thresholds.clusterDominanceRatio
    },
    dedupeKey: `cluster:${topActor}`
  };
}

export function detectAutomation(
  timestampsNewestFirst: readonly number[],
  jitterMs: number
): { detected: boolean; meanGapMs: number; jitterMs: number } {
  if (timestampsNewestFirst.length < 3) {
    return { detected: false, meanGapMs: 0, jitterMs: 0 };
  }
  const gaps: number[] = [];
  for (let i = 0; i < timestampsNewestFirst.length - 1; i += 1) {
    const newer = timestampsNewestFirst[i];
    const older = timestampsNewestFirst[i + 1];
    if (newer === undefined || older === undefined) continue;
    gaps.push(Math.abs(newer - older));
  }
  if (gaps.length < 2) return { detected: false, meanGapMs: 0, jitterMs: 0 };

  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const variance =
    gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  const deviation = Math.sqrt(variance);
  return {
    detected: deviation <= jitterMs,
    meanGapMs: Math.round(mean),
    jitterMs: Math.round(deviation)
  };
}
