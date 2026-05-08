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
  status: z.enum(["local", "queued", "sent", "delivered", "failed"]),
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

export const GroupKeyRecordSchema = z.object({
  groupId: z.string().min(1).max(128),
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

export const POSTGRES_SCHEMA_SQL = `
create table if not exists users (
  id uuid primary key,
  pubkey_hash text unique not null,
  created_at timestamptz not null,
  plan text not null,
  subscription_status text not null,
  stripe_customer_id text,
  capability_pubkey_version integer not null
);

create table if not exists subscriptions (
  id uuid primary key,
  pubkey_hash text not null references users(pubkey_hash),
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  plan text not null,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists relay_queue (
  id uuid primary key,
  recipient_pubkey_hash text not null,
  encrypted_blob text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists capability_tokens (
  id uuid primary key,
  pubkey_hash text not null references users(pubkey_hash),
  plan text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists referral_redemptions (
  id uuid primary key,
  pubkey_hash text not null references users(pubkey_hash),
  referral_code text not null,
  reward text,
  created_at timestamptz not null
);

create index if not exists users_pubkey_hash_idx on users(pubkey_hash);
create index if not exists subscriptions_pubkey_hash_idx on subscriptions(pubkey_hash);
create index if not exists relay_queue_recipient_expires_idx
  on relay_queue(recipient_pubkey_hash, expires_at);
create index if not exists capability_tokens_pubkey_expires_idx
  on capability_tokens(pubkey_hash, expires_at);
create index if not exists referral_redemptions_pubkey_idx
  on referral_redemptions(pubkey_hash);

create table if not exists push_subscriptions (
  id uuid primary key,
  pubkey_hash text not null,
  endpoint text not null,
  auth text not null,
  p256dh text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists push_subscriptions_endpoint_idx on push_subscriptions(endpoint);
create index if not exists push_subscriptions_pubkey_idx on push_subscriptions(pubkey_hash);

create table if not exists status_updates (
  id uuid primary key,
  sender_pubkey_hash text not null,
  ciphertext text not null,
  dev_plaintext text,
  created_at_ms bigint not null,
  expires_at_ms bigint not null,
  updated_at timestamptz not null
);

create index if not exists status_updates_sender_created_idx
  on status_updates(sender_pubkey_hash, created_at_ms desc);
create index if not exists status_updates_expires_idx on status_updates(expires_at_ms);
`;
