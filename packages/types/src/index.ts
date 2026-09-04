import { z } from "zod";

import {
  IdentityProofSchema,
  PubkeyHashSchema,
  PublicKeySchema,
  UuidSchema
} from "./primitives";

export {
  IdentityProofSchema,
  PubkeyHashSchema,
  PublicKeySchema,
  UuidSchema
} from "./primitives";
export type { IdentityProof } from "./primitives";
export * from "./contest";

export const MessageKindSchema = z.enum([
  "text",
  "image",
  "file",
  "video",
  "audio",
  "voice_note",
  "call",
  "system",
  "poll",
  "status"
]);

export const ReplyToMessageSchema = z.object({
  messageId: UuidSchema,
  senderId: PubkeyHashSchema,
  senderName: z.string().min(1).max(80).optional(),
  type: MessageKindSchema,
  textPreview: z.string().max(160).optional(),
  mediaPreview: z.string().max(512).optional(),
  fileName: z.string().max(255).optional(),
  createdAt: z.number().int().positive().optional()
});

export const MediaAttachmentSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  url: z.string().min(1),
  contentHash: z.string().min(32).max(256).optional(),
  keyBase64: z.string().min(1).optional(),
  nonceBase64: z.string().min(1).optional(),
  fileName: z.string().min(1).max(255),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
  thumbnailUrl: z.string().min(1).optional(),
  thumbnailDataUrl: z.string().min(1).optional()
});

export const PollOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(255),
  voterPubkeyHashes: z.array(z.string()).default([])
});

export const PollDataSchema = z.object({
  question: z.string().min(1).max(512),
  options: z.array(PollOptionSchema).min(2).max(10),
  multipleAnswers: z.boolean().default(false)
});

export const MessagePayloadSchema = z.object({
  version: z.literal(1),
  type: MessageKindSchema,
  text: z.string().max(20000).optional(),
  media: MediaAttachmentSchema.optional(),
  poll: PollDataSchema.optional(),
  replyTo: ReplyToMessageSchema.optional()
});

// devPlaintext: dev-only debug field that ships plaintext alongside ciphertext
// so local development can read messages without full crypto wired up.
//
// The schema is intentionally permissive (a string is always allowed) because
// the relay process — not the schema — is the only correct gate. The relay
// strips `devPlaintext` from every envelope before forwarding/queueing unless
// `ALLOW_DEV_PLAINTEXT=true` is explicitly set on the server. Gating the
// schema by NODE_ENV captured at module load was unreliable across self-hosted
// and preview deployments.
const devPlaintextField = z.string().max(20000).optional();

// One copy of a symmetric content key, sealed to a single recipient's identity
// key. Group sender keys and status keys used to travel beside the ciphertext
// in the clear, which handed the relay the ability to decrypt everything it
// routed; they now ride as an array of these instead.
export const SealedKeyEnvelopeSchema = z.object({
  recipient: PubkeyHashSchema,
  sealedKey: z.string().min(1).max(1024)
});
export type SealedKeyEnvelope = z.infer<typeof SealedKeyEnvelopeSchema>;

export const MessageEnvelopeSchema = z.object({
  type: z.literal("message"),
  id: UuidSchema,
  recipient: PubkeyHashSchema,
  sender: PubkeyHashSchema,
  timestamp: z.number().int().positive(),
  ciphertext: z.string().min(1),
  messageKind: MessageKindSchema.optional(),
  replyTo: ReplyToMessageSchema.optional(),
  // Sender's Ed25519 identity key, so a recipient who has never seen an invite
  // link can still address an encrypted reply. The relay rejects any envelope
  // whose senderPublicKey does not hash to the authenticated sender, and the
  // client re-derives the hash itself rather than trusting that check.
  senderPublicKey: PublicKeySchema.optional(),
  devPlaintext: devPlaintextField
});

export const GroupMessageEnvelopeSchema = z.object({
  type: z.literal("group-message"),
  id: UuidSchema,
  groupId: z.string().min(1).max(128),
  recipients: z.array(PubkeyHashSchema).min(1).max(512),
  sender: PubkeyHashSchema,
  timestamp: z.number().int().positive(),
  ciphertext: z.string().min(1),
  messageKind: MessageKindSchema.optional(),
  /**
   * @deprecated Plaintext sender key. Readable by the relay, so it is only
   * still emitted when a member's identity key is unknown and there is no way
   * to seal to them. Prefer `keyEnvelopes`.
   */
  senderKeyPackage: z.string().min(1).optional(),
  /** Per-member sealed copies of the group sender key. */
  keyEnvelopes: z.array(SealedKeyEnvelopeSchema).max(512).optional(),
  /**
   * Which key epoch `ciphertext` was encrypted under. Recipients keep every
   * epoch they have been given, so a rotation revokes future messages from
   * anyone no longer sealed to, without blanking out history for those who
   * remain. Absent means epoch 1.
   */
  keyEpoch: z.number().int().positive().optional(),
  senderPublicKey: PublicKeySchema.optional(),
  devPlaintext: devPlaintextField,
  replyToId: UuidSchema.optional(),
  replyTo: ReplyToMessageSchema.optional(),
  mentions: z.array(PubkeyHashSchema).optional(),
  expiresAt: z.number().int().positive().optional()
});

export const CallSignalEnvelopeSchema = z.object({
  type: z.literal("call-signal"),
  id: UuidSchema,
  callId: z.string().min(1).max(128),
  recipient: PubkeyHashSchema,
  sender: PubkeyHashSchema,
  timestamp: z.number().int().positive(),
  mode: z.enum(["voice", "video", "group"]),
  signalType: z.enum(["offer", "answer", "ice", "hangup", "reject"]),
  payload: z.string().min(1)
});

export const RegisterEnvelopeSchema = z.object({
  type: z.literal("register"),
  pubkeyHash: PubkeyHashSchema,
  pubkey: PublicKeySchema,
  signature: z.string().min(1).max(512),
  nonce: z.string().min(1).max(256),
  timestamp: z.number().int().positive()
});

// Sent by the server immediately after a WebSocket opens. The client must
// prove ownership of its identity key by signing the nonce before any other
// envelope will be accepted on this connection.
export const ChallengeEnvelopeSchema = z.object({
  type: z.literal("challenge"),
  nonce: z.string().min(1).max(256)
});

export const TypingEnvelopeSchema = z.object({
  type: z.literal("typing"),
  chatId: z.string().min(1).max(256),
  sender: PubkeyHashSchema,
  recipient: PubkeyHashSchema,
  isTyping: z.boolean()
});

export const ReactionEnvelopeSchema = z.object({
  type: z.literal("reaction"),
  id: UuidSchema,
  chatId: z.string().min(1).max(256),
  messageId: UuidSchema,
  recipient: PubkeyHashSchema,
  sender: PubkeyHashSchema,
  emoji: z.string().min(1).max(8),
  /** null means the reaction was removed */
  removed: z.boolean().optional(),
  timestamp: z.number().int().positive()
});

export const DeletionEnvelopeSchema = z.object({
  type: z.literal("deletion"),
  id: UuidSchema,
  chatId: z.string().min(1).max(256),
  messageId: UuidSchema,
  recipient: PubkeyHashSchema,
  sender: PubkeyHashSchema,
  timestamp: z.number().int().positive()
});

export type DeletionEnvelope = z.infer<typeof DeletionEnvelopeSchema>;

export const DeliveryStatusSchema = z.enum([
  "queued",
  "sent",
  "delivered",
  "read",
  "failed"
]);

export const ClientSocketEnvelopeSchema = z.union([
  RegisterEnvelopeSchema,
  MessageEnvelopeSchema,
  GroupMessageEnvelopeSchema,
  CallSignalEnvelopeSchema,
  TypingEnvelopeSchema,
  ReactionEnvelopeSchema,
  DeletionEnvelopeSchema,
  z.object({
    type: z.literal("delivery"),
    id: UuidSchema,
    recipient: PubkeyHashSchema, // the sender of the original message
    status: DeliveryStatusSchema
  })
]);

export const ServerSocketEnvelopeSchema = z.discriminatedUnion("type", [
  ChallengeEnvelopeSchema,
  z.object({
    type: z.literal("registered"),
    pubkeyHash: PubkeyHashSchema
  }),
  z.object({
    type: z.literal("message"),
    envelope: MessageEnvelopeSchema
  }),
  z.object({
    type: z.literal("group-message"),
    envelope: GroupMessageEnvelopeSchema
  }),
  z.object({
    type: z.literal("call-signal"),
    envelope: CallSignalEnvelopeSchema
  }),
  z.object({
    type: z.literal("typing"),
    envelope: TypingEnvelopeSchema
  }),
  z.object({
    type: z.literal("reaction"),
    envelope: ReactionEnvelopeSchema
  }),
  z.object({
    type: z.literal("deletion"),
    envelope: DeletionEnvelopeSchema
  }),
  z.object({
    type: z.literal("delivery"),
    id: UuidSchema,
    status: DeliveryStatusSchema
  }),
  z.object({
    type: z.literal("error"),
    code: z.string().min(1),
    message: z.string().min(1)
  })
]);

export const InvitePayloadSchema = z.object({
  version: z.literal(1),
  pubkeyHash: PubkeyHashSchema,
  publicKey: PublicKeySchema
});

export const GroupInvitePayloadSchema = z.object({
  version: z.literal(1),
  kind: z.literal("group"),
  groupId: z.string().min(1).max(128),
  title: z.string().min(1).max(80),
  ownerPubkeyHash: PubkeyHashSchema,
  memberPubkeyHashes: z.array(PubkeyHashSchema).min(1).max(512),
  senderKeyPackage: z.string().min(1)
});

export const MediaUploadResponseSchema = z.object({
  id: UuidSchema,
  url: z.string().min(1),
  fileName: z.string().min(1).max(255),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive(),
  encryptedSize: z.number().int().positive(),
  contentHash: z.string().min(32).max(256),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive().nullable()
});

export const BillingPlanSchema = z.enum([
  "free",
  "pro",
  "business",
  "enterprise"
]);

export const PaidBillingPlanSchema = z.enum(["pro", "business", "enterprise"]);

export const SubscriptionCheckoutRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  plan: PaidBillingPlanSchema,
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  referralCode: z.string().min(4).max(64).optional(),
  proof: IdentityProofSchema
});

export const SubscriptionCheckoutResponseSchema = z.object({
  configured: z.boolean(),
  checkoutUrl: z.string().url().nullable(),
  mode: z.literal("stripe_checkout"),
  message: z.string().min(1).optional()
});

export const SubscriptionStateSchema = z.enum([
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid"
]);

// Deprecated GET-query schema kept for type compatibility. The relay only
// accepts the POST body form below, which requires an identity proof.
export const SubscriptionStatusQuerySchema = z.object({
  pubkey_hash: PubkeyHashSchema
});

export const SubscriptionStatusRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  proof: IdentityProofSchema
});

export const SubscriptionStatusResponseSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  plan: BillingPlanSchema,
  status: SubscriptionStateSchema,
  currentPeriodEnd: z.number().int().positive().nullable(),
  capabilityToken: z.string().nullable()
});

export const CapabilityTokenPayloadSchema = z.object({
  version: z.literal(1),
  pubkeyHash: PubkeyHashSchema,
  plan: BillingPlanSchema,
  features: z.array(z.string().min(1)),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive()
});

export const CapabilityIssueRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  plan: BillingPlanSchema,
  expiresAt: z.number().int().positive().optional()
});

export const CapabilityIssueResponseSchema = z.object({
  token: z.string().min(1),
  payload: CapabilityTokenPayloadSchema
});

export const ReferralRedeemRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  referralCode: z.string().min(4).max(64),
  proof: IdentityProofSchema
});

export const PushSubscriptionRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1)
    })
  }),
  proof: IdentityProofSchema
});

export const StatusPublishRequestSchema = z.object({
  ciphertext: z.string().min(1),
  devPlaintext: devPlaintextField,
  id: UuidSchema,
  sender: PubkeyHashSchema,
  timestamp: z.number().int().positive(),
  /**
   * Audience of the status: one sealed copy of the status key per viewer the
   * author chose. The relay stores these opaquely and hands a caller only the
   * envelope addressed to their own verified identity, so a status is
   * readable by its audience and by nobody else — including the relay.
   */
  keyEnvelopes: z.array(SealedKeyEnvelopeSchema).max(512).optional(),
  proof: IdentityProofSchema
});

// Reading statuses requires proving who you are. Without a proof any caller
// could ask for any identity's statuses, and pubkey hashes are public on the
// Whispers feed — so an unauthenticated read was an open window onto every
// user's "vanishing" updates.
export const StatusQueryRequestSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  senderPubkeyHashes: z.array(PubkeyHashSchema).min(1).max(256),
  since: z.number().int().positive().optional(),
  viewerPubkeyHash: PubkeyHashSchema,
  proof: IdentityProofSchema
});

export const StatusDeleteRequestSchema = z.object({
  id: UuidSchema,
  sender: PubkeyHashSchema,
  proof: IdentityProofSchema
});

// ── Prekeys (forward secrecy) ──────────────────────────────────────────────
// The relay stores and distributes public halves only. Senders verify the
// signature on a signed prekey against the owner's identity key before use, so
// a relay that substituted its own key would be caught by the client.
export const PrekeyIdSchema = z.string().min(8).max(64);
export const PrekeyPublicSchema = z.string().min(32).max(128);

export const PrekeyPublishRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  identityPubkey: PublicKeySchema,
  signedPrekeyId: PrekeyIdSchema,
  signedPrekey: PrekeyPublicSchema,
  signedPrekeySignature: z.string().min(1).max(512),
  oneTimePrekeys: z
    .array(z.object({ id: PrekeyIdSchema, prekey: PrekeyPublicSchema }))
    .max(100)
    .default([]),
  proof: IdentityProofSchema
});

// Claiming consumes a one-time prekey, so it must name who is consuming it.
export const PrekeyClaimRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  requester: PubkeyHashSchema,
  proof: IdentityProofSchema
});

export const PrekeyStatusRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  proof: IdentityProofSchema
});

export const PrekeyBundleResponseSchema = z.object({
  identityKey: PublicKeySchema,
  signedPrekeyId: PrekeyIdSchema,
  signedPrekey: PrekeyPublicSchema,
  signedPrekeySignature: z.string().min(1).max(512),
  oneTimePrekeyId: PrekeyIdSchema.optional(),
  oneTimePrekey: PrekeyPublicSchema.optional()
});

export type PrekeyPublishRequest = z.infer<typeof PrekeyPublishRequestSchema>;
export type PrekeyClaimRequest = z.infer<typeof PrekeyClaimRequestSchema>;
export type PrekeyStatusRequest = z.infer<typeof PrekeyStatusRequestSchema>;
export type PrekeyBundleResponse = z.infer<typeof PrekeyBundleResponseSchema>;

// ── Whispers: NADA's public global feed ────────────────────────────────────
// Unlike statuses, whispers are a public timeline visible to every user, so the
// body is stored plaintext on the relay. Writes are still authenticated with an
// identity proof so authorship can't be forged and only authors can delete.
export const WhisperAuthorNameSchema = z.string().min(1).max(80);
export const WhisperBodySchema = z.string().min(1).max(500);
export const WhisperReflectionBodySchema = z.string().min(1).max(280);

export const WhisperRippleSourceSchema = z.object({
  id: UuidSchema,
  authorName: WhisperAuthorNameSchema,
  body: z.string().max(500),
  createdAt: z.number().int().positive()
});

export const WhisperPublishRequestSchema = z.object({
  id: UuidSchema,
  author: PubkeyHashSchema,
  authorName: WhisperAuthorNameSchema,
  body: WhisperBodySchema,
  timestamp: z.number().int().positive(),
  proof: IdentityProofSchema
});

export const WhisperDeleteRequestSchema = z.object({
  id: UuidSchema,
  author: PubkeyHashSchema,
  proof: IdentityProofSchema
});

export const WhisperReflectRequestSchema = z.object({
  id: UuidSchema,
  echoId: UuidSchema,
  author: PubkeyHashSchema,
  authorName: WhisperAuthorNameSchema,
  body: WhisperReflectionBodySchema,
  timestamp: z.number().int().positive(),
  proof: IdentityProofSchema,
  /** Immediate parent Reflection when this is a nested (threaded) reply. */
  parentId: UuidSchema.optional(),
  /** Anonymous handle of the parent author, preserved as an "@name" mention. */
  replyToName: WhisperAuthorNameSchema.optional()
});

export const WhisperReflectionQueryRequestSchema = z.object({
  echoId: UuidSchema,
  viewerPubkeyHash: PubkeyHashSchema,
  /** Max top-level replies per page; their nested replies ride along. */
  limit: z.number().int().min(1).max(100).optional(),
  /** Cursor: only top-level replies created strictly before this timestamp. */
  before: z.number().int().positive().optional()
});

export const WhisperReflectionDeleteRequestSchema = z.object({
  id: UuidSchema,
  author: PubkeyHashSchema,
  proof: IdentityProofSchema
});

export const WhisperReflectionReactRequestSchema = z.object({
  reflectionId: UuidSchema,
  reactor: PubkeyHashSchema,
  /** Anonymous handle shown in the "liked your reflection" notification. */
  reactorName: WhisperAuthorNameSchema.optional(),
  on: z.boolean(),
  timestamp: z.number().int().positive(),
  proof: IdentityProofSchema
});

export const WhisperReactRequestSchema = z.object({
  echoId: UuidSchema,
  reactor: PubkeyHashSchema,
  /** Anonymous handle shown in the "liked your Echo" notification. */
  reactorName: WhisperAuthorNameSchema.optional(),
  on: z.boolean(),
  timestamp: z.number().int().positive(),
  proof: IdentityProofSchema
});

export const WhisperRippleRequestSchema = z.object({
  id: UuidSchema,
  echoId: UuidSchema,
  author: PubkeyHashSchema,
  authorName: WhisperAuthorNameSchema,
  timestamp: z.number().int().positive(),
  rippleOf: WhisperRippleSourceSchema,
  proof: IdentityProofSchema
});

export const WhisperQueryRequestSchema = z.object({
  viewerPubkeyHash: PubkeyHashSchema,
  limit: z.number().int().min(1).max(200).optional(),
  since: z.number().int().nonnegative().optional(),
  /** Cursor: only Echoes created strictly before this timestamp (pagination). */
  before: z.number().int().positive().optional(),
  /** Restrict the timeline to a single author (profile pages). */
  authorPubkeyHash: PubkeyHashSchema.optional()
});

// ── Whisper profiles, follows ("Ghosts") and notifications ─────────────────
export const WhisperBioSchema = z.string().max(280);
export const WhisperInstitutionSchema = z.string().max(80);
// Small self-chosen avatar as a data URL (client downscales before upload).
export const WhisperAvatarSchema = z
  .string()
  .max(120_000)
  .refine((value) => value === "" || value.startsWith("data:image/"), {
    message: "Avatar must be a data:image URL."
  });
export const WhisperDmPrivacySchema = z.enum(["everyone", "ghosts", "none"]);

export const WhisperProfileGetRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  viewerPubkeyHash: PubkeyHashSchema
});

export const WhisperProfileUpdateRequestSchema = z.object({
  author: PubkeyHashSchema,
  displayName: WhisperAuthorNameSchema,
  bio: WhisperBioSchema,
  institution: WhisperInstitutionSchema,
  avatar: WhisperAvatarSchema.optional(),
  showActivity: z.boolean(),
  showLikes: z.boolean().optional(),
  dmPrivacy: WhisperDmPrivacySchema.optional(),
  timestamp: z.number().int().positive(),
  proof: IdentityProofSchema
});

// A user's authored Reflections (profile "Reflects" tab), newest first.
export const WhisperAuthorReflectionsRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  viewerPubkeyHash: PubkeyHashSchema,
  limit: z.number().int().min(1).max(100).optional(),
  before: z.number().int().positive().optional()
});

// Echoes a user has liked (profile "Likes" tab). When the target keeps their
// likes private, the request must carry an identity proof from that same user.
export const WhisperLikedEchoesRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  viewerPubkeyHash: PubkeyHashSchema,
  limit: z.number().int().min(1).max(100).optional(),
  before: z.number().int().positive().optional(),
  proof: IdentityProofSchema.optional()
});

// Followers ("Ghosts") or following list for a profile.
export const WhisperFollowListRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  direction: z.enum(["followers", "following"]),
  limit: z.number().int().min(1).max(200).optional()
});

export const WhisperFollowRequestSchema = z.object({
  follower: PubkeyHashSchema,
  followerName: WhisperAuthorNameSchema,
  followee: PubkeyHashSchema,
  on: z.boolean(),
  timestamp: z.number().int().positive(),
  proof: IdentityProofSchema
});

export const WhisperNotificationKindSchema = z.enum([
  "reflect",
  "reply",
  "echo",
  "reflection_echo",
  "ripple",
  "mention",
  "follow"
]);

export const NotificationQueryRequestSchema = z.object({
  recipient: PubkeyHashSchema,
  limit: z.number().int().min(1).max(200).optional(),
  before: z.number().int().positive().optional(),
  proof: IdentityProofSchema
});

export const NotificationReadRequestSchema = z.object({
  recipient: PubkeyHashSchema,
  /** Specific notification ids; omit to mark every notification read. */
  ids: z.array(UuidSchema).max(200).optional(),
  timestamp: z.number().int().positive(),
  proof: IdentityProofSchema
});

export const ReferralRedeemResponseSchema = z.object({
  accepted: z.boolean(),
  reward: z.string().min(1).nullable(),
  message: z.string().min(1)
});

export const ShareCardPayloadSchema = z.object({
  version: z.literal(1),
  pubkeyHash: PubkeyHashSchema,
  displayName: z.string().min(1).max(80),
  inviteUrl: z.string().url()
});

export const GroupMigrationPayloadSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().int().positive(),
  ownerPubkeyHash: PubkeyHashSchema,
  groups: z.array(
    z.object({
      groupId: z.string().min(1).max(128),
      title: z.string().min(1).max(80),
      memberPubkeyHashes: z.array(PubkeyHashSchema).min(1).max(512),
      inviteUrl: z.string().url().optional()
    })
  )
});

export type PubkeyHash = z.infer<typeof PubkeyHashSchema>;
export type PublicKey = z.infer<typeof PublicKeySchema>;
export type MessageKind = z.infer<typeof MessageKindSchema>;
export type ReplyToMessage = z.infer<typeof ReplyToMessageSchema>;
export type MediaAttachment = z.infer<typeof MediaAttachmentSchema>;
export type PollData = z.infer<typeof PollDataSchema>;
export type PollOption = z.infer<typeof PollOptionSchema>;
export type MessagePayload = z.infer<typeof MessagePayloadSchema>;
export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;
export type GroupMessageEnvelope = z.infer<typeof GroupMessageEnvelopeSchema>;
export type CallSignalEnvelope = z.infer<typeof CallSignalEnvelopeSchema>;
export type RegisterEnvelope = z.infer<typeof RegisterEnvelopeSchema>;
export type ChallengeEnvelope = z.infer<typeof ChallengeEnvelopeSchema>;
export type TypingEnvelope = z.infer<typeof TypingEnvelopeSchema>;
export type ReactionEnvelope = z.infer<typeof ReactionEnvelopeSchema>;
export type DeliveryEnvelope = {
  type: "delivery";
  id: string;
  recipient: string;
  status: "queued" | "sent" | "delivered" | "failed";
};
export type ClientSocketEnvelope = z.infer<typeof ClientSocketEnvelopeSchema>;
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;
export type ServerSocketEnvelope = z.infer<typeof ServerSocketEnvelopeSchema>;
export type InvitePayload = z.infer<typeof InvitePayloadSchema>;
export type GroupInvitePayload = z.infer<typeof GroupInvitePayloadSchema>;
export type MediaUploadResponse = z.infer<typeof MediaUploadResponseSchema>;
export type BillingPlan = z.infer<typeof BillingPlanSchema>;
export type PaidBillingPlan = z.infer<typeof PaidBillingPlanSchema>;
export type SubscriptionCheckoutRequest = z.infer<
  typeof SubscriptionCheckoutRequestSchema
>;
export type SubscriptionCheckoutResponse = z.infer<
  typeof SubscriptionCheckoutResponseSchema
>;
export type SubscriptionState = z.infer<typeof SubscriptionStateSchema>;
export type SubscriptionStatusQuery = z.infer<
  typeof SubscriptionStatusQuerySchema
>;
export type SubscriptionStatusRequest = z.infer<
  typeof SubscriptionStatusRequestSchema
>;
export type SubscriptionStatusResponse = z.infer<
  typeof SubscriptionStatusResponseSchema
>;
export type PushSubscriptionRequest = z.infer<
  typeof PushSubscriptionRequestSchema
>;
export type StatusPublishRequest = z.infer<typeof StatusPublishRequestSchema>;
export type StatusDeleteRequest = z.infer<typeof StatusDeleteRequestSchema>;
export type StatusQueryRequest = z.infer<typeof StatusQueryRequestSchema>;
export type WhisperRippleSource = z.infer<typeof WhisperRippleSourceSchema>;
export type WhisperPublishRequest = z.infer<typeof WhisperPublishRequestSchema>;
export type WhisperDeleteRequest = z.infer<typeof WhisperDeleteRequestSchema>;
export type WhisperReflectRequest = z.infer<typeof WhisperReflectRequestSchema>;
export type WhisperReactRequest = z.infer<typeof WhisperReactRequestSchema>;
export type WhisperRippleRequest = z.infer<typeof WhisperRippleRequestSchema>;
export type WhisperQueryRequest = z.infer<typeof WhisperQueryRequestSchema>;
export type WhisperReflectionQueryRequest = z.infer<
  typeof WhisperReflectionQueryRequestSchema
>;
export type WhisperReflectionDeleteRequest = z.infer<
  typeof WhisperReflectionDeleteRequestSchema
>;
export type WhisperReflectionReactRequest = z.infer<
  typeof WhisperReflectionReactRequestSchema
>;
export type WhisperProfileGetRequest = z.infer<typeof WhisperProfileGetRequestSchema>;
export type WhisperProfileUpdateRequest = z.infer<
  typeof WhisperProfileUpdateRequestSchema
>;
export type WhisperDmPrivacy = z.infer<typeof WhisperDmPrivacySchema>;
export type WhisperAuthorReflectionsRequest = z.infer<
  typeof WhisperAuthorReflectionsRequestSchema
>;
export type WhisperLikedEchoesRequest = z.infer<typeof WhisperLikedEchoesRequestSchema>;
export type WhisperFollowListRequest = z.infer<typeof WhisperFollowListRequestSchema>;
export type WhisperFollowRequest = z.infer<typeof WhisperFollowRequestSchema>;
export type WhisperNotificationKind = z.infer<typeof WhisperNotificationKindSchema>;
export type NotificationQueryRequest = z.infer<typeof NotificationQueryRequestSchema>;
export type NotificationReadRequest = z.infer<typeof NotificationReadRequestSchema>;
export type CapabilityTokenPayload = z.infer<
  typeof CapabilityTokenPayloadSchema
>;
export type CapabilityIssueRequest = z.infer<
  typeof CapabilityIssueRequestSchema
>;
export type CapabilityIssueResponse = z.infer<
  typeof CapabilityIssueResponseSchema
>;
export type ReferralRedeemRequest = z.infer<typeof ReferralRedeemRequestSchema>;
export type ReferralRedeemResponse = z.infer<
  typeof ReferralRedeemResponseSchema
>;
export type ShareCardPayload = z.infer<typeof ShareCardPayloadSchema>;
export type GroupMigrationPayload = z.infer<typeof GroupMigrationPayloadSchema>;
