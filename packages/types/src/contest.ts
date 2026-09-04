import { z } from "zod";

import { IdentityProofSchema, PubkeyHashSchema, UuidSchema } from "./primitives";

// ── Contest lifecycle ────────────────────────────────────────────────────────
//
// A contest is financially consequential, so its state machine is enforced on
// the server and every transition is audited. The order below is also the only
// legal progression: nothing jumps from ACTIVE straight to FINALIZED without
// passing through the freeze and the review that make a result defensible.
export const ContestStatusSchema = z.enum([
  "DRAFT",
  "REGISTRATION_OPEN",
  "ACTIVE",
  "FROZEN",
  "UNDER_REVIEW",
  "FINALIZED",
  "CANCELLED"
]);
export type ContestStatus = z.infer<typeof ContestStatusSchema>;

/**
 * Engagement signals the relay can verify for itself.
 *
 * Everything here is derived from a write the relay already authenticated with
 * an identity proof, so a client cannot manufacture one. Deliberately absent:
 * anything only the client knows. NADA's communities are client-side state
 * with no server record, and direct/group message bodies are end-to-end
 * encrypted — awarding points for either would mean trusting a self-report,
 * which is the one thing a prize leaderboard cannot afford.
 */
export const ContestEventTypeSchema = z.enum([
  "ECHO_CREATED",
  "REFLECTION_CREATED",
  "REFLECTION_RECEIVED",
  "REACTION_RECEIVED",
  "REFLECTION_REACTION_RECEIVED",
  "RIPPLE_CREATED",
  "RIPPLE_RECEIVED",
  "FOLLOW_RECEIVED",
  "COMMUNITY_ACTIVITY",
  "DAILY_CHALLENGE_COMPLETED",
  "WEEKLY_CHALLENGE_COMPLETED"
]);
export type ContestEventType = z.infer<typeof ContestEventTypeSchema>;

export const ContestQualificationSchema = z.enum([
  "PENDING",
  "VALID",
  "PENDING_REVIEW",
  "REJECTED",
  "REVERSED"
]);
export type ContestQualification = z.infer<typeof ContestQualificationSchema>;

export const ContestRiskTypeSchema = z.enum([
  "SELF_INTERACTION",
  "REPEATED_ACTOR",
  "REPEATED_TARGET",
  "RAPID_INTERACTION",
  "BURST_ACTIVITY",
  "ABNORMAL_FREQUENCY",
  "AUTOMATION_PATTERN",
  "NEW_ACCOUNT_FARMING",
  "MASS_INTERACTION",
  "ENGAGEMENT_CLUSTER",
  "DUPLICATE_BEHAVIOR"
]);
export type ContestRiskType = z.infer<typeof ContestRiskTypeSchema>;

export const ContestRiskBandSchema = z.enum([
  "LOW",
  "WATCH",
  "SUSPICIOUS",
  "HIGH_RISK"
]);
export type ContestRiskBand = z.infer<typeof ContestRiskBandSchema>;

/**
 * Scoring categories shown in "how did I get this score?". Every ledger row
 * carries one, so the breakdown is a group-by rather than a re-derivation.
 */
export const ContestScoreCategorySchema = z.enum([
  "content",
  "engagement_received",
  "community",
  "challenges",
  "adjustment"
]);
export type ContestScoreCategory = z.infer<typeof ContestScoreCategorySchema>;

// ── Rules ────────────────────────────────────────────────────────────────────

const PointsSchema = z.record(ContestEventTypeSchema, z.number().int().min(0).max(10_000));
const CountsSchema = z.record(ContestEventTypeSchema, z.number().int().min(0).max(100_000));
const DurationsSchema = z.record(ContestEventTypeSchema, z.number().int().min(0).max(86_400_000));

export const ContestChallengeSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  description: z.string().max(240).default(""),
  period: z.enum(["daily", "weekly"]),
  /** Qualifying events of this type, counted inside the period. */
  eventType: ContestEventTypeSchema,
  /** How many are needed for the challenge to complete. */
  count: z.number().int().min(1).max(1_000),
  points: z.number().int().min(0).max(10_000)
});
export type ContestChallenge = z.infer<typeof ContestChallengeSchema>;

/**
 * The complete, versioned scoring configuration.
 *
 * Nothing here is hard-coded in the application: a future contest changes
 * behaviour by shipping a new rules version, not a new deploy. Every field has
 * a default so a partial ruleset from an operator is still a complete one at
 * evaluation time.
 */
export const ContestRulesSchema = z.object({
  /** Points before caps, decay and risk multipliers. */
  points: PointsSchema.default({}),

  caps: z
    .object({
      /** Hard ceiling on points one participant can bank in a UTC day. */
      dailyPointsPerParticipant: z.number().int().min(0).max(1_000_000).default(500),
      /** Per-day count ceiling for each event type. */
      dailyEventsPerType: CountsSchema.default({}),
      /**
       * Ceiling on points one actor can generate for one participant inside
       * `actorPairWindowMs`. This is the primary anti-collusion control:
       * two accounts trading engagement hit it within minutes.
       */
      perActorPairPoints: z.number().int().min(0).max(1_000_000).default(30),
      actorPairWindowMs: z.number().int().min(0).max(2_592_000_000).default(86_400_000),
      /** Ceiling on points any single piece of content can ever generate. */
      perSourceEntityPoints: z.number().int().min(0).max(1_000_000).default(120),
      /** Minimum gap between two scoring events of the same type by one actor. */
      cooldownMsPerEventType: DurationsSchema.default({})
    })
    .default({}),

  /**
   * Repeat interaction between the same two identities is worth less each
   * time. Distinct from the pair cap: the cap is a wall, this is a slope, and
   * the slope is what makes genuine mutual engagement still count while making
   * farming unprofitable long before the wall.
   */
  diminishing: z
    .object({
      /** Interactions at full value before decay starts. */
      fullValueInteractions: z.number().int().min(0).max(1_000).default(3),
      /** Multiplier applied per interaction beyond the full-value allowance. */
      decay: z.number().min(0).max(1).default(0.5),
      /** Never decay below this fraction of face value. */
      floor: z.number().min(0).max(1).default(0)
    })
    .default({}),

  /**
   * Fresh identities are the cheapest thing to mass-produce, so engagement
   * *from* them is worth less until they have a history of their own.
   */
  newIdentity: z
    .object({
      windowMs: z.number().int().min(0).max(2_592_000_000).default(604_800_000),
      /** Multiplier on points an actor inside the window can generate. */
      actorMultiplier: z.number().min(0).max(1).default(0.25)
    })
    .default({}),

  risk: z
    .object({
      /** Cumulative risk score at which each band begins. */
      bands: z
        .object({
          watch: z.number().int().min(0).max(100).default(21),
          suspicious: z.number().int().min(0).max(100).default(51),
          highRisk: z.number().int().min(0).max(100).default(81)
        })
        .default({}),
      /** Point multiplier applied while a participant sits in each band. */
      multipliers: z
        .object({
          LOW: z.number().min(0).max(1).default(1),
          WATCH: z.number().min(0).max(1).default(1),
          SUSPICIOUS: z.number().min(0).max(1).default(0.5),
          HIGH_RISK: z.number().min(0).max(1).default(0)
        })
        .default({}),
      /**
       * At and above this band an event is held as PENDING_REVIEW instead of
       * scoring — evidence preserved, points withheld until a human looks.
       */
      holdForReviewAt: ContestRiskBandSchema.default("HIGH_RISK"),
      signals: z
        .object({
          /** Scoring events one actor may produce per minute before flagging. */
          rapidInteractionPerMinute: z.number().int().min(1).max(10_000).default(20),
          /** Events one participant may receive per minute before flagging. */
          burstReceivedPerMinute: z.number().int().min(1).max(10_000).default(40),
          /** Interactions from one actor to one participant per day before flagging. */
          repeatedActorPerDay: z.number().int().min(1).max(10_000).default(12),
          /** Distinct scoring events on one piece of content before flagging. */
          repeatedTargetPerDay: z.number().int().min(1).max(100_000).default(60),
          /**
           * Automation looks like a metronome. With at least this many
           * consecutive events whose inter-arrival gaps vary by less than
           * `automationJitterMs`, the pattern is flagged.
           */
          automationSampleSize: z.number().int().min(3).max(100).default(6),
          automationJitterMs: z.number().int().min(0).max(60_000).default(750),
          /**
           * Share of a participant's received points that may come from their
           * single largest contributor before the cluster is flagged. Only
           * evaluated once a participant has more than `clusterMinEvents`.
           */
          clusterDominanceRatio: z.number().min(0).max(1).default(0.6),
          clusterMinEvents: z.number().int().min(1).max(10_000).default(20)
        })
        .default({}),
      /** Risk score contributed by one occurrence of each signal. */
      weights: z.record(ContestRiskTypeSchema, z.number().int().min(0).max(100)).default({})
    })
    .default({}),

  challenges: z.array(ContestChallengeSchema).max(40).default([]),

  exclusions: z
    .object({
      /** Interacting with your own content never scores. Off is not offered. */
      selfInteraction: z.literal(true).default(true),
      /** Event types this contest ignores entirely. */
      blockedEventTypes: z.array(ContestEventTypeSchema).max(40).default([])
    })
    .default({})
});
export type ContestRules = z.infer<typeof ContestRulesSchema>;
export type ContestRulesInput = z.input<typeof ContestRulesSchema>;

// ── Public / participant API ────────────────────────────────────────────────

export const ContestSlugSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case.");

export const ContestCurrencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "Currency must be an ISO-4217 code.");

export const ContestJoinRequestSchema = z.object({
  contestId: UuidSchema,
  pubkeyHash: PubkeyHashSchema,
  /** Anonymous handle shown on the leaderboard. Never a real-world name. */
  displayName: z.string().min(1).max(80),
  /** Where Stripe returns a paying entrant. Only used for paid contests. */
  successUrl: z.string().url().max(2_048).optional(),
  cancelUrl: z.string().url().max(2_048).optional(),
  proof: IdentityProofSchema
});
export type ContestJoinRequest = z.infer<typeof ContestJoinRequestSchema>;

export const ContestLeaderboardRequestSchema = z.object({
  contestId: UuidSchema,
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).max(10_000).default(0)
});
export type ContestLeaderboardRequest = z.infer<typeof ContestLeaderboardRequestSchema>;

export const ContestMeRequestSchema = z.object({
  contestId: UuidSchema,
  pubkeyHash: PubkeyHashSchema,
  proof: IdentityProofSchema
});
export type ContestMeRequest = z.infer<typeof ContestMeRequestSchema>;

export const ContestActivityRequestSchema = z.object({
  contestId: UuidSchema,
  pubkeyHash: PubkeyHashSchema,
  limit: z.number().int().min(1).max(200).default(50),
  before: z.number().int().positive().optional(),
  proof: IdentityProofSchema
});
export type ContestActivityRequest = z.infer<typeof ContestActivityRequestSchema>;

// ── Admin API ────────────────────────────────────────────────────────────────

export const ContestAdminAuthSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  proof: IdentityProofSchema
});

export const ContestCreateRequestSchema = ContestAdminAuthSchema.extend({
  name: z.string().min(3).max(120),
  slug: ContestSlugSchema,
  description: z.string().max(4_000).default(""),
  startAt: z.number().int().positive(),
  endAt: z.number().int().positive(),
  registrationStartAt: z.number().int().positive().optional(),
  registrationEndAt: z.number().int().positive().optional(),
  entryFeeMinor: z.number().int().min(0).max(100_000_000).default(0),
  entryCurrency: ContestCurrencySchema.default("NGN"),
  prizeAmountMinor: z.number().int().min(0).max(10_000_000_000).default(0),
  prizeCurrency: ContestCurrencySchema.default("NGN"),
  maxParticipants: z.number().int().min(1).max(1_000_000).optional(),
  rules: ContestRulesSchema.optional()
});
export type ContestCreateRequest = z.infer<typeof ContestCreateRequestSchema>;

export const ContestUpdateRequestSchema = ContestAdminAuthSchema.extend({
  contestId: UuidSchema,
  name: z.string().min(3).max(120).optional(),
  description: z.string().max(4_000).optional(),
  startAt: z.number().int().positive().optional(),
  endAt: z.number().int().positive().optional(),
  registrationStartAt: z.number().int().positive().optional(),
  registrationEndAt: z.number().int().positive().optional(),
  entryFeeMinor: z.number().int().min(0).max(100_000_000).optional(),
  entryCurrency: ContestCurrencySchema.optional(),
  prizeAmountMinor: z.number().int().min(0).max(10_000_000_000).optional(),
  prizeCurrency: ContestCurrencySchema.optional(),
  maxParticipants: z.number().int().min(1).max(1_000_000).optional(),
  /** Supplying rules creates the next immutable version; it never edits one. */
  rules: ContestRulesSchema.optional(),
  reason: z.string().max(500).default("")
});
export type ContestUpdateRequest = z.infer<typeof ContestUpdateRequestSchema>;

export const ContestTransitionRequestSchema = ContestAdminAuthSchema.extend({
  contestId: UuidSchema,
  reason: z.string().max(500).default("")
});
export type ContestTransitionRequest = z.infer<typeof ContestTransitionRequestSchema>;

export const ContestAdminListRequestSchema = ContestAdminAuthSchema.extend({
  contestId: UuidSchema,
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).max(100_000).default(0)
});
export type ContestAdminListRequest = z.infer<typeof ContestAdminListRequestSchema>;

export const ContestParticipantReviewRequestSchema = ContestAdminAuthSchema.extend({
  contestId: UuidSchema,
  participantPubkeyHash: PubkeyHashSchema,
  action: z.enum(["clear", "flag", "disqualify", "reinstate", "release_held_events"]),
  reason: z.string().min(1).max(500)
});
export type ContestParticipantReviewRequest = z.infer<
  typeof ContestParticipantReviewRequestSchema
>;

export const ContestWinnerApproveRequestSchema = ContestAdminAuthSchema.extend({
  contestId: UuidSchema,
  participantPubkeyHash: PubkeyHashSchema,
  decision: z.enum(["approve", "reject"]),
  reason: z.string().min(1).max(500)
});
export type ContestWinnerApproveRequest = z.infer<typeof ContestWinnerApproveRequestSchema>;

export const ContestPayoutRequestSchema = ContestAdminAuthSchema.extend({
  contestId: UuidSchema,
  participantPubkeyHash: PubkeyHashSchema,
  payoutReference: z.string().min(1).max(200),
  payoutStatus: z.enum(["PAID", "FAILED"]),
  note: z.string().max(500).default("")
});
export type ContestPayoutRequest = z.infer<typeof ContestPayoutRequestSchema>;
