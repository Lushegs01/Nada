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
  created_at_ms bigint not null,
  expires_at_ms bigint not null,
  updated_at timestamptz not null
);

create index if not exists status_updates_sender_created_idx
  on status_updates(sender_pubkey_hash, created_at_ms desc);
create index if not exists status_updates_expires_idx on status_updates(expires_at_ms);

-- Audience of a status update: one copy of the status's symmetric content key,
-- sealed to a single viewer's identity key. The relay stores these opaquely
-- and only ever hands a caller the row addressed to their own *verified*
-- identity, so a status is readable by the audience its author chose and by
-- nobody else — the relay operator included.
create table if not exists status_key_envelopes (
  status_id uuid not null,
  recipient_pubkey_hash text not null,
  sealed_key text not null,
  created_at_ms bigint not null,
  primary key (status_id, recipient_pubkey_hash)
);
create index if not exists status_key_envelopes_recipient_idx
  on status_key_envelopes(recipient_pubkey_hash);

-- Stripe delivers each webhook at least once and retries on any non-2xx, so
-- every event has to be processed exactly once. Recording the event id before
-- acting on it turns a replayed delivery into a no-op instead of a duplicate
-- subscription row.
create table if not exists stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null
);

-- One subscription row per Stripe subscription. Without this the webhook
-- handler inserted a fresh uuid on every delivery, so a retried event grew the
-- table forever and left several rows claiming different states for one user.
--
-- Existing deployments already carry those duplicates, and a bare CREATE
-- UNIQUE INDEX against them fails — which, since the schema is applied on
-- boot, would stop the relay from starting. Collapse to the newest row per
-- subscription first; the delete is a no-op on a clean database.
delete from subscriptions a
  using subscriptions b
 where a.stripe_subscription_id = b.stripe_subscription_id
   and (a.updated_at, a.id) < (b.updated_at, b.id);
create unique index if not exists subscriptions_stripe_subscription_idx
  on subscriptions(stripe_subscription_id);

-- Stripe does not guarantee webhook ordering: a "subscription.updated" can be
-- delivered after the "subscription.deleted" that superseded it, and applying
-- it would resurrect a cancelled plan. Recording the event's own timestamp
-- lets a write reject an event older than the one already applied.
alter table subscriptions add column if not exists last_event_at bigint not null default 0;

-- A referral code may be redeemed once per identity. Same de-duplication
-- reason as above.
delete from referral_redemptions a
  using referral_redemptions b
 where a.pubkey_hash = b.pubkey_hash
   and a.referral_code = b.referral_code
   and (a.created_at, a.id) < (b.created_at, b.id);
create unique index if not exists referral_redemptions_unique_idx
  on referral_redemptions(pubkey_hash, referral_code);

-- Whispers: NADA's public global feed. Unlike statuses, whisper content is a
-- public timeline visible to every user, so the body is stored in the clear.
-- No real-world identity or contact data is ever persisted here.
create table if not exists whisper_echoes (
  id uuid primary key,
  author_pubkey_hash text not null,
  author_name text not null,
  body text not null,
  ripple_of_id uuid,
  ripple_of_author_name text,
  ripple_of_body text,
  ripple_of_created_at_ms bigint,
  created_at_ms bigint not null,
  updated_at timestamptz not null
);
create index if not exists whisper_echoes_created_idx on whisper_echoes(created_at_ms desc);

create table if not exists whisper_reflections (
  id uuid primary key,
  echo_id uuid not null,
  author_pubkey_hash text not null,
  author_name text not null,
  body text not null,
  created_at_ms bigint not null
);
create index if not exists whisper_reflections_echo_idx
  on whisper_reflections(echo_id, created_at_ms);

-- Threaded replies: a Reflection may reply to another Reflection. parent_id is
-- the immediate parent (null = top-level reply to the Echo itself); root_id is
-- the top-level ancestor, denormalised so one indexed query loads a whole
-- thread page without recursive CTEs. reply_to_name preserves the "@name"
-- mention of the parent author under anonymity rules (names only, never keys).
-- deleted_at_ms marks a tombstone: a reply with children keeps its slot in the
-- thread but its body is cleared (soft delete); leaf replies are hard-deleted.
alter table whisper_reflections add column if not exists parent_id uuid;
alter table whisper_reflections add column if not exists root_id uuid;
alter table whisper_reflections add column if not exists reply_to_name text;
alter table whisper_reflections add column if not exists deleted_at_ms bigint;
create index if not exists whisper_reflections_root_idx
  on whisper_reflections(root_id, created_at_ms);
create index if not exists whisper_reflections_parent_idx
  on whisper_reflections(parent_id);
create index if not exists whisper_reflections_author_idx
  on whisper_reflections(author_pubkey_hash, created_at_ms desc);

-- One row per user per reflection — likes on replies, mirroring whisper_reactions.
create table if not exists whisper_reflection_reactions (
  reflection_id uuid not null,
  reactor_pubkey_hash text not null,
  created_at_ms bigint not null,
  primary key (reflection_id, reactor_pubkey_hash)
);
create index if not exists whisper_reflection_reactions_idx
  on whisper_reflection_reactions(reflection_id);

-- Public profile card for the Whispers feed. Everything here is already-public
-- feed data (anonymous handle, bio) — never real-world identity or contact data.
-- pubkey is the author's Ed25519 public key, captured from a relay-verified
-- identity proof at write time; it lets other ghosts open an encrypted DM lane
-- without an invite link. avatar is a small self-chosen data URL image.
-- dm_privacy: 'everyone' | 'ghosts' (followers only) | 'none'.
create table if not exists whisper_profiles (
  pubkey_hash text primary key,
  display_name text not null,
  bio text not null default '',
  institution text not null default '',
  show_activity boolean not null default true,
  created_at_ms bigint not null,
  updated_at timestamptz not null
);
alter table whisper_profiles add column if not exists pubkey text not null default '';
alter table whisper_profiles add column if not exists avatar text not null default '';
alter table whisper_profiles add column if not exists show_likes boolean not null default true;
alter table whisper_profiles add column if not exists dm_privacy text not null default 'everyone';

-- Ghosts: follower → followee edges between anonymous identities.
create table if not exists whisper_follows (
  follower_pubkey_hash text not null,
  followee_pubkey_hash text not null,
  created_at_ms bigint not null,
  primary key (follower_pubkey_hash, followee_pubkey_hash)
);
create index if not exists whisper_follows_followee_idx
  on whisper_follows(followee_pubkey_hash);

-- Notification inbox. One row per (recipient, actor, kind, target) — the
-- unique index makes notification writes idempotent so replayed/duplicate
-- interactions never produce duplicate notifications. Grouping ("12 people
-- replied") happens at read time in the client, keyed by (echo_id, kind).
create table if not exists whisper_notifications (
  id uuid primary key,
  recipient_pubkey_hash text not null,
  actor_pubkey_hash text not null,
  actor_name text not null,
  kind text not null,
  echo_id uuid,
  reflection_id uuid,
  preview text not null default '',
  created_at_ms bigint not null,
  read_at_ms bigint
);
create unique index if not exists whisper_notifications_dedupe_idx
  on whisper_notifications(
    recipient_pubkey_hash, actor_pubkey_hash, kind,
    coalesce(echo_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(reflection_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists whisper_notifications_recipient_idx
  on whisper_notifications(recipient_pubkey_hash, created_at_ms desc);
create index if not exists whisper_notifications_echo_idx
  on whisper_notifications(echo_id);

create index if not exists whisper_echoes_author_idx
  on whisper_echoes(author_pubkey_hash, created_at_ms desc);

-- One row per user per echo — powers accurate global "Echo" (like) counts.
create table if not exists whisper_reactions (
  echo_id uuid not null,
  reactor_pubkey_hash text not null,
  created_at_ms bigint not null,
  primary key (echo_id, reactor_pubkey_hash)
);
create index if not exists whisper_reactions_echo_idx on whisper_reactions(echo_id);
-- Powers the profile "Likes" tab: everything one user has liked, newest first.
create index if not exists whisper_reactions_reactor_idx
  on whisper_reactions(reactor_pubkey_hash, created_at_ms desc);

-- One row per user per source echo — powers accurate global "Ripple" counts.
create table if not exists whisper_ripples (
  echo_id uuid not null,
  rippler_pubkey_hash text not null,
  created_at_ms bigint not null,
  primary key (echo_id, rippler_pubkey_hash)
);
create index if not exists whisper_ripples_echo_idx on whisper_ripples(echo_id);
`;
