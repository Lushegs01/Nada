import { z } from "zod";

import {
  MessageKindSchema,
  PubkeyHashSchema,
  PublicKeySchema,
  ReplyToMessageSchema
} from "@nada/types";

export const PlanSchema = z.enum(["free", "pro", "business", "enterprise"]);
export const SubscriptionStatusSchema = z.enum([
  "none",
  "trialing",
  "active",
  "past_due",
  "canceled"
]);

export const ClientTableNameSchema = z.enum([
  "identity",
  "calls",
  "contacts",
  "chats",
  "encryptedFiles",
  "groupKeys",
  "messages",
  "settings",
  "sessions"
]);

export type Plan = z.infer<typeof PlanSchema>;
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;
export type ClientTableName = z.infer<typeof ClientTableNameSchema>;

export const IdentityRecordSchema = z.object({
  id: z.literal("primary"),
  pubkey: PublicKeySchema,
  pubkeyHash: PubkeyHashSchema,
  encryptedPrivateKey: z.string().min(1),
  /**
   * Locally-cached unencrypted private key (base64, libsodium ORIGINAL).
   * Required to sign identity-proof challenges (LiveKit/TURN/WS register).
   * Optional only so legacy IDB rows from before this field existed still
   * deserialize; new identities always populate it.
   */
  localPrivateKey: z.string().min(1).optional(),
  seedBackupStatus: z.enum(["pending", "confirmed"]),
  createdAt: z.number().int().positive()
});

export const ContactRecordSchema = z.object({
  id: z.string().min(1),
  pubkeyHash: PubkeyHashSchema,
  publicKey: PublicKeySchema,
  localDisplayName: z.string().min(1).max(80),
  localAvatar: z.string().optional(),
  addedAt: z.number().int().positive(),
  trustStatus: z.enum(["unverified", "trusted", "blocked"])
});

export const ChatRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["direct", "group"]),
  title: z.string().min(1),
  avatar: z.string().optional(),
  memberPubkeyHashes: z.array(PubkeyHashSchema).min(1),
  ownerPubkeyHash: PubkeyHashSchema.optional(),
  groupSenderKey: z.string().min(1).optional(),
  /** Epoch of `groupSenderKey`. Absent on records written before epochs. */
  groupKeyEpoch: z.number().int().positive().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  disappearingTimer: z.number().int().nonnegative()
});

export const MessageRecordSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string().min(1),
  senderPubkeyHash: PubkeyHashSchema,
  recipientPubkeyHash: PubkeyHashSchema,
  direction: z.enum(["inbound", "outbound"]),
  kind: MessageKindSchema.default("text"),
  body: z.string(),
  encryptedPayload: z.string().min(1),
  status: z.enum(["local", "queued", "sent", "delivered", "read", "failed"]),
  replyToId: z.string().uuid().optional(),
  replyTo: ReplyToMessageSchema.optional(),
  mentions: z.array(PubkeyHashSchema).optional(),
  createdAt: z.number().int().positive(),
  editedAt: z.number().int().positive().optional(),
  deletedAt: z.number().int().positive().optional(),
  readAt: z.number().int().positive().optional(),
  expiresAt: z.number().int().positive().optional(),
  /** emoji → [senderPubkeyHash, ...] */
  reactions: z.record(z.string(), z.array(PubkeyHashSchema)).optional()
});

/**
 * One group sender key, at one epoch.
 *
 * Keys are kept per epoch rather than one-per-group so a rotation does not
 * destroy the ability to read history: messages name the epoch they were
 * encrypted under, and old epochs stay readable while new messages use the
 * current one. Rotation is what makes group membership revocable at all —
 * without it, anyone who ever held the key (or an invite link carrying it)
 * could read every future message.
 */
export const GroupKeyRecordSchema = z.object({
  groupId: z.string().min(1).max(128),
  /** Monotonic per group. Epoch 1 is the key a group is created with. */
  epoch: z.number().int().positive().default(1),
  senderKey: z.string().min(1),
  createdByPubkeyHash: PubkeyHashSchema,
  createdAt: z.number().int().positive(),
  rotatedAt: z.number().int().positive().optional()
});

export const CallRecordSchema = z.object({
  id: z.string().min(1).max(128),
  chatId: z.string().min(1),
  peerPubkeyHash: PubkeyHashSchema.optional(),
  mode: z.enum(["voice", "video", "group"]),
  status: z.enum(["idle", "ringing", "connecting", "active", "ended", "failed"]),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive().optional()
});

export const EncryptedFileRecordSchema = z.object({
  contentHash: z.string().min(32).max(256),
  encryptedBlobBase64: z.string().min(1),
  nonceBase64: z.string().min(1),
  keyBase64: z.string().min(1),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive().optional()
});

export type IdentityRecord = z.infer<typeof IdentityRecordSchema>;
export type ContactRecord = z.infer<typeof ContactRecordSchema>;
export type ChatRecord = z.infer<typeof ChatRecordSchema>;
export type MessageRecord = z.infer<typeof MessageRecordSchema>;
export type EncryptedFileRecord = z.infer<typeof EncryptedFileRecordSchema>;
export type GroupKeyRecord = z.infer<typeof GroupKeyRecordSchema>;
export type CallRecord = z.infer<typeof CallRecordSchema>;


export { CONTEST_SCHEMA_SQL } from "./contest-schema";
export { POSTGRES_SCHEMA_SQL } from "./postgres-schema";
export {
  MIGRATIONS,
  SCHEMA_MIGRATIONS_TABLE_SQL,
  type Migration
} from "./migrations";
