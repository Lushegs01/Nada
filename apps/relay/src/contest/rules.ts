import {
  ContestRulesSchema,
  type ContestEventType,
  type ContestRiskBand,
  type ContestRiskType,
  type ContestRules,
  type ContestRulesInput
} from "@nada/types";

/**
 * The ruleset a contest starts from.
 *
 * It is data, not behaviour: every number here can be changed per contest (and
 * per rules version within a contest) without touching application code. The
 * shape of the incentive matters more than the magnitudes — receiving genuine
 * engagement is worth more than performing an action, and every earning path
 * is capped, so "press the button more times" converges on nothing well before
 * "write something people respond to" does.
 */
export const DEFAULT_CONTEST_RULES: ContestRulesInput = {
  points: {
    // Contribution: making something for others to respond to.
    ECHO_CREATED: 10,
    REFLECTION_CREATED: 4,
    // A Ripple is a reshare — cheap to perform, so it is worth little to the
    // resharer and meaningful to the person whose work was reshared.
    RIPPLE_CREATED: 1,
    // Engagement received: what other people chose to do with your work.
    REFLECTION_RECEIVED: 5,
    RIPPLE_RECEIVED: 3,
    REACTION_RECEIVED: 2,
    REFLECTION_REACTION_RECEIVED: 1,
    FOLLOW_RECEIVED: 4,
    // Reserved for when communities gain a server-side record. Nothing emits
    // it today, so it scores nothing today; see docs/contest-engine.md.
    COMMUNITY_ACTIVITY: 5,
    DAILY_CHALLENGE_COMPLETED: 10,
    WEEKLY_CHALLENGE_COMPLETED: 25
  },
  caps: {
    dailyPointsPerParticipant: 500,
    dailyEventsPerType: {
      ECHO_CREATED: 12,
      REFLECTION_CREATED: 40,
      RIPPLE_CREATED: 10,
      REACTION_RECEIVED: 200,
      REFLECTION_RECEIVED: 120,
      RIPPLE_RECEIVED: 60,
      REFLECTION_REACTION_RECEIVED: 200,
      FOLLOW_RECEIVED: 40
    },
    perActorPairPoints: 30,
    actorPairWindowMs: 86_400_000,
    perSourceEntityPoints: 120,
    cooldownMsPerEventType: {
      ECHO_CREATED: 120_000,
      REFLECTION_CREATED: 20_000,
      RIPPLE_CREATED: 300_000
    }
  },
  diminishing: {
    fullValueInteractions: 3,
    decay: 0.5,
    floor: 0
  },
  newIdentity: {
    windowMs: 604_800_000,
    actorMultiplier: 0.25
  },
  risk: {
    bands: { watch: 21, suspicious: 51, highRisk: 81 },
    multipliers: { LOW: 1, WATCH: 1, SUSPICIOUS: 0.5, HIGH_RISK: 0 },
    holdForReviewAt: "HIGH_RISK",
    signals: {
      rapidInteractionPerMinute: 20,
      burstReceivedPerMinute: 40,
      repeatedActorPerDay: 12,
      repeatedTargetPerDay: 60,
      automationSampleSize: 6,
      automationJitterMs: 750,
      clusterDominanceRatio: 0.6,
      clusterMinEvents: 20
    },
    weights: {
      SELF_INTERACTION: 0,
      REPEATED_ACTOR: 6,
      REPEATED_TARGET: 4,
      RAPID_INTERACTION: 8,
      BURST_ACTIVITY: 6,
      ABNORMAL_FREQUENCY: 6,
      AUTOMATION_PATTERN: 15,
      NEW_ACCOUNT_FARMING: 5,
      MASS_INTERACTION: 10,
      ENGAGEMENT_CLUSTER: 20,
      DUPLICATE_BEHAVIOR: 8
    }
  },
  challenges: [
    {
      id: "daily_echo",
      label: "Say something",
      description: "Post at least one Echo today.",
      period: "daily",
      eventType: "ECHO_CREATED",
      count: 1,
      points: 10
    },
    {
      id: "daily_reflect",
      label: "Join three conversations",
      description: "Reflect on three Echoes today.",
      period: "daily",
      eventType: "REFLECTION_CREATED",
      count: 3,
      points: 10
    },
    {
      id: "weekly_resonance",
      label: "Be worth replying to",
      description: "Receive ten Reflections this week.",
      period: "weekly",
      eventType: "REFLECTION_RECEIVED",
      count: 10,
      points: 25
    }
  ],
  exclusions: {
    selfInteraction: true,
    blockedEventTypes: []
  }
};

/** Parses stored rules, filling every default. Falls back on malformed JSON. */
export function parseRules(raw: unknown): ContestRules {
  const result = ContestRulesSchema.safeParse(raw);
  if (result.success) return result.data;
  return ContestRulesSchema.parse(DEFAULT_CONTEST_RULES);
}

export function defaultRules(): ContestRules {
  return ContestRulesSchema.parse(DEFAULT_CONTEST_RULES);
}

export function pointsFor(rules: ContestRules, eventType: ContestEventType): number {
  return rules.points[eventType] ?? 0;
}

export function dailyEventCap(
  rules: ContestRules,
  eventType: ContestEventType
): number | null {
  const cap = rules.caps.dailyEventsPerType[eventType];
  return typeof cap === "number" ? cap : null;
}

export function cooldownFor(rules: ContestRules, eventType: ContestEventType): number {
  return rules.caps.cooldownMsPerEventType[eventType] ?? 0;
}

export function riskWeight(rules: ContestRules, riskType: ContestRiskType): number {
  return rules.risk.weights[riskType] ?? 0;
}

/** Maps a cumulative risk score onto its configured band. */
export function riskBand(rules: ContestRules, score: number): ContestRiskBand {
  const { bands } = rules.risk;
  if (score >= bands.highRisk) return "HIGH_RISK";
  if (score >= bands.suspicious) return "SUSPICIOUS";
  if (score >= bands.watch) return "WATCH";
  return "LOW";
}

const BAND_ORDER: readonly ContestRiskBand[] = [
  "LOW",
  "WATCH",
  "SUSPICIOUS",
  "HIGH_RISK"
];

/** True when `band` is at least as severe as `threshold`. */
export function bandAtLeast(band: ContestRiskBand, threshold: ContestRiskBand): boolean {
  return BAND_ORDER.indexOf(band) >= BAND_ORDER.indexOf(threshold);
}

export function riskMultiplier(rules: ContestRules, band: ContestRiskBand): number {
  return rules.risk.multipliers[band];
}

/**
 * Value of the n-th interaction between the same actor and participant, as a
 * fraction of face value. `priorInteractions` counts what came before it.
 */
export function diminishingMultiplier(
  rules: ContestRules,
  priorInteractions: number
): number {
  const { fullValueInteractions, decay, floor } = rules.diminishing;
  if (priorInteractions < fullValueInteractions) return 1;
  const steps = priorInteractions - fullValueInteractions + 1;
  return Math.max(floor, decay ** steps);
}

/** Which scoring category a ledger row belongs to, for the score breakdown. */
export function categoryFor(
  eventType: ContestEventType
): "content" | "engagement_received" | "community" | "challenges" {
  switch (eventType) {
    case "ECHO_CREATED":
    case "REFLECTION_CREATED":
    case "RIPPLE_CREATED":
      return "content";
    case "REFLECTION_RECEIVED":
    case "REFLECTION_REACTION_RECEIVED":
    case "REACTION_RECEIVED":
    case "RIPPLE_RECEIVED":
    case "FOLLOW_RECEIVED":
      return "engagement_received";
    case "COMMUNITY_ACTIVITY":
      return "community";
    case "DAILY_CHALLENGE_COMPLETED":
    case "WEEKLY_CHALLENGE_COMPLETED":
      return "challenges";
  }
}

/**
 * True when the earner is also the actor: creating an Echo, writing a
 * Reflection, resharing, completing a challenge. These have no second party,
 * so the anti-collusion signals that compare two identities do not apply.
 */
export function isSelfAuthored(eventType: ContestEventType): boolean {
  switch (eventType) {
    case "ECHO_CREATED":
    case "REFLECTION_CREATED":
    case "RIPPLE_CREATED":
    case "COMMUNITY_ACTIVITY":
    case "DAILY_CHALLENGE_COMPLETED":
    case "WEEKLY_CHALLENGE_COMPLETED":
      return true;
    case "REFLECTION_RECEIVED":
    case "REFLECTION_REACTION_RECEIVED":
    case "REACTION_RECEIVED":
    case "RIPPLE_RECEIVED":
    case "FOLLOW_RECEIVED":
      return false;
  }
}

/** Challenge completions are derived from other events; they never recurse. */
export function isChallengeEvent(eventType: ContestEventType): boolean {
  return (
    eventType === "DAILY_CHALLENGE_COMPLETED" ||
    eventType === "WEEKLY_CHALLENGE_COMPLETED"
  );
}

/** Start of the UTC day containing `ms`. Contest windows are UTC throughout. */
export function utcDayStart(ms: number): number {
  return Math.floor(ms / 86_400_000) * 86_400_000;
}

/**
 * Start of the UTC week containing `ms`, weeks starting Monday. Derived from
 * the epoch rather than from a calendar library so it cannot drift with the
 * server's locale.
 */
export function utcWeekStart(ms: number): number {
  const day = utcDayStart(ms);
  // 1970-01-01 was a Thursday, so Monday is 4 days earlier in the cycle.
  const dayIndex = (Math.floor(day / 86_400_000) + 3) % 7;
  return day - dayIndex * 86_400_000;
}

export function periodKey(period: "daily" | "weekly", ms: number): string {
  const start = period === "daily" ? utcDayStart(ms) : utcWeekStart(ms);
  return `${period}:${new Date(start).toISOString().slice(0, 10)}`;
}
