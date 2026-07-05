import { z } from "zod";

export const PubkeyHashSchema = z.string().min(16).max(128);
export const PublicKeySchema = z.string().min(32).max(512);
export const UuidSchema = z.string().uuid();

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

// Ed25519 identity proof. Mirrors apps/relay/src/identity-proof.ts and
// apps/web/src/lib/identity-proof-server.ts so request schemas can validate
// the shape before handing off to the verifier.
export const IdentityProofSchema = z.object({
  pubkey: PublicKeySchema,
  pubkeyHash: PubkeyHashSchema,
  signature: z.string().min(1).max(512),
  timestamp: z.number().int().positive()
});
export type IdentityProof = z.infer<typeof IdentityProofSchema>;

export const MessageEnvelopeSchema = z.object({
  type: z.literal("message"),
  id: UuidSchema,
  recipient: PubkeyHashSchema,
  sender: PubkeyHashSchema,
  timestamp: z.number().int().positive(),
  ciphertext: z.string().min(1),
  messageKind: MessageKindSchema.optional(),
  replyTo: ReplyToMessageSchema.optional(),
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
  senderKeyPackage: z.string().min(1).optional(),
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

export const ProductionEnvelopeSchema = z.object({
  version: z.literal(1),
  recipient: PubkeyHashSchema,
  sealedSenderEnvelope: z.string().min(1),
  capabilityToken: z.string().min(1).optional()
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
  ProductionEnvelopeSchema,
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
    type: z.literal("sealed-message"),
    envelope: ProductionEnvelopeSchema
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

export const BlindUploadRequestSchema = z.object({
  contentHash: z.string().min(32).max(256),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().min(1).max(120).optional()
});

export const BlindUploadResponseSchema = z.object({
  uploadId: UuidSchema,
  contentHash: z.string().min(32).max(256),
  expiresAt: z.number().int().positive(),
  uploadUrl: z.null(),
  storage: z.literal("client-encrypted-blind-upload-mvp")
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
  proof: IdentityProofSchema
});

export const StatusDeleteRequestSchema = z.object({
  id: UuidSchema,
  sender: PubkeyHashSchema,
  proof: IdentityProofSchema
});

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
  proof: IdentityProofSchema
});

export const WhisperReactRequestSchema = z.object({
  echoId: UuidSchema,
  reactor: PubkeyHashSchema,
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
  since: z.number().int().nonnegative().optional()
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
export type ProductionEnvelope = z.infer<typeof ProductionEnvelopeSchema>;
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
export type BlindUploadRequest = z.infer<typeof BlindUploadRequestSchema>;
export type BlindUploadResponse = z.infer<typeof BlindUploadResponseSchema>;
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
export type WhisperRippleSource = z.infer<typeof WhisperRippleSourceSchema>;
export type WhisperPublishRequest = z.infer<typeof WhisperPublishRequestSchema>;
export type WhisperDeleteRequest = z.infer<typeof WhisperDeleteRequestSchema>;
export type WhisperReflectRequest = z.infer<typeof WhisperReflectRequestSchema>;
export type WhisperReactRequest = z.infer<typeof WhisperReactRequestSchema>;
export type WhisperRippleRequest = z.infer<typeof WhisperRippleRequestSchema>;
export type WhisperQueryRequest = z.infer<typeof WhisperQueryRequestSchema>;
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
