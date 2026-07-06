export type Panel =
  | "billing"
  | "contacts"
  | "group"
  | "community_create"
  | "migration"
  | "settings"
  | "share"
  | "status_create"
  | null;

export type MessageContextMenuState = {
  messageId: string;
  x: number;
  y: number;
};

export const PENDING_ENCRYPTED_PAYLOAD = "__pending_encryption__";
export const STATUS_COMMENT_PREFIX = "status-comments:";

// Dev-only debug field that ships plaintext alongside ciphertext in envelopes
// so local development can read messages without full crypto wired up.
//
// SAFETY:
//  - Must NEVER be enabled on production builds. Requires both the explicit
//    NEXT_PUBLIC_NADA_DEV_PLAINTEXT="true" opt-in *and* a non-production
//    NODE_ENV. Misconfigured staging environments without NODE_ENV=production
//    no longer leak plaintext just because NODE_ENV is missing.
//  - Production builds should fail fast if the opt-in flag is set; the check
//    below throws at module load to surface the misconfiguration loudly.
export const NADA_DEV_PLAINTEXT_ENABLED =
  process.env["NEXT_PUBLIC_NADA_DEV_PLAINTEXT"] === "true" &&
  process.env["NODE_ENV"] !== "production";

// Relay envelope schema caps devPlaintext at 20k chars; attaching a larger
// value (e.g. a base64 voice note) makes the relay reject the whole envelope.
// Cap here so dev-plaintext mode never breaks delivery of large payloads.
export const DEV_PLAINTEXT_MAX_CHARS = 20000;
export function devPlaintextFor(body: string): { devPlaintext: string } | Record<string, never> {
  if (!NADA_DEV_PLAINTEXT_ENABLED || body.length > DEV_PLAINTEXT_MAX_CHARS) {
    return {};
  }
  return { devPlaintext: body };
}

if (
  process.env["NEXT_PUBLIC_NADA_DEV_PLAINTEXT"] === "true" &&
  process.env["NODE_ENV"] === "production"
) {
  throw new Error(
    "NEXT_PUBLIC_NADA_DEV_PLAINTEXT must not be enabled on production builds."
  );
}

export const COMMUNITIES_SETTING_KEY = "communities.v1";
export const WHISPERS_SETTING_KEY = "whispers.v1";
export const WHISPER_NOTIFICATIONS_SETTING_KEY = "whispers.notifications.v1";
export const WHISPER_PROFILE_SETTING_KEY = "whispers.profile.v1";
/** Reply depth after which further nesting renders flat (still threaded in data). */
export const WHISPER_THREAD_MAX_VISUAL_DEPTH = 4;
export const REPORTS_SETTING_KEY = "safety.reports.v1";
export const ONBOARDING_DISMISSED_SETTING_KEY = "onboarding.dismissed.v1";
export const NOTIFICATION_SETTINGS_KEY = "notifications.settings.v1";
export const CALL_RING_TIMEOUT_MS = 45000;
export const GROUP_DECRYPTION_FALLBACK_TEXT =
  "Encrypted group message unavailable. Ask the creator to send the group invite again.";

export type NotificationTone = "message" | "status" | "call" | "end" | "silent";
export type NotificationSoundChoice = "nada" | "glass" | "pulse" | "silent";
export type NotificationRingtoneChoice = "nada" | "orbit" | "pulse" | "silent";
export type NotificationPreviewPrivacy = "full" | "private";

export type NotificationSettings = {
  notificationTone: NotificationSoundChoice;
  previewPrivacy: NotificationPreviewPrivacy;
  ringtone: NotificationRingtoneChoice;
  vibration: boolean;
};

export const NOTIFICATION_SOUND_CHOICES: NotificationSoundChoice[] = [
  "nada",
  "glass",
  "pulse",
  "silent"
];
export const NOTIFICATION_RINGTONE_CHOICES: NotificationRingtoneChoice[] = [
  "nada",
  "orbit",
  "pulse",
  "silent"
];
export const NOTIFICATION_PREVIEW_PRIVACY_CHOICES: NotificationPreviewPrivacy[] = [
  "full",
  "private"
];

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notificationTone: "nada",
  previewPrivacy: "private",
  ringtone: "nada",
  vibration: true
};
export const STATUS_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉"] as const;

export type ChatListModel = {
  avatar?: string | undefined;
  chatId: string;
  contactHash?: string | undefined;
  groupId?: string | undefined;
  initials: string;
  isArchived: boolean;
  isGroup: boolean;
  isOnline?: boolean | undefined;
  isSelected: boolean;
  preview: string;
  sortTs: number;
  timestamp: string;
  title: string;
  unread: number;
};

export type PendingChatAction = {
  action: "archive" | "unarchive" | "delete" | "delete-group";
  chatId: string;
  contactHash?: string;
  groupId?: string;
  title: string;
};

export type StatusCommentPayload = {
  kind: "status-comment";
  statusId: string;
  statusOwnerPubkeyHash: string;
  text: string;
  version: 1;
};

export type StatusReactionPayload = {
  emoji: string;
  kind: "status-reaction";
  statusId: string;
  statusOwnerPubkeyHash: string;
  version: 1;
};

export type StatusDeletePayload = {
  kind: "status-delete";
  statusId: string;
  statusOwnerPubkeyHash: string;
  version: 1;
};

export type GroupDeletePayload = {
  groupId: string;
  kind: "group-delete";
  ownerPubkeyHash: string;
  version: 1;
};

export type CommunityRecord = {
  admins: string[];
  category: string;
  channels: Array<{ id: string; title: string }>;
  createdAt: number;
  description: string;
  id: string;
  joined: boolean;
  memberCount: number;
  moderators: string[];
  posts: CommunityPost[];
  privacy: "open" | "invite-only";
  title: string;
  topics: string[];
  updatedAt: number;
};

export type CommunityPost = {
  authorName: string;
  body: string;
  channelId: string;
  createdAt: number;
  id: string;
};

export type CommunityDraft = {
  category: string;
  description: string;
  privacy: "open" | "invite-only";
  title: string;
};

// ── Whispers: NADA's public feed ──────────────────────────────────────────
// A single global timeline where every NADA user can post. Product wording:
//   - a post is an "Echo"        (WhisperEcho)
//   - a comment is a "Reflection" (WhisperReflection)
//   - a like is an "Echo" action  (echoedByMe / echoCount)
//   - a repost is a "Ripple"      (rippleOf / rippleCount)
//   - a follower is a "Ghost"     (WhisperProfile.followerCount)
// Reflections thread: parentId points at the reflection being replied to
// (undefined = a top-level reply to the Echo itself).
export type WhisperReflection = {
  authorHash: string;
  authorName: string;
  body: string;
  createdAt: number;
  id: string;
  parentId?: string;
  /** Anonymous handle of the reply target, rendered as an "@name" mention. */
  replyToName?: string;
  /** Tombstone: deleted but kept as a placeholder because it has replies. */
  deleted?: boolean;
  likeCount: number;
  likedByMe: boolean;
  /** Direct replies to this reflection (drives "N replies" affordances). */
  replyCount: number;
};

export type WhisperNotificationKind =
  | "reflect"
  | "reply"
  | "echo"
  | "reflection_echo"
  | "ripple"
  | "mention"
  | "follow";

export type WhisperNotification = {
  actorHash: string;
  actorName: string;
  createdAt: number;
  echoId?: string;
  id: string;
  kind: WhisperNotificationKind;
  preview: string;
  read: boolean;
  reflectionId?: string;
};

export type WhisperDmPrivacy = "everyone" | "ghosts" | "none";

export type WhisperProfile = {
  /** Small self-chosen data-URL image; empty = gradient identity orb. */
  avatar: string;
  bio: string;
  displayName: string;
  dmPrivacy: WhisperDmPrivacy;
  echoCount: number;
  followedByMe: boolean;
  followerCount: number;
  followingCount: number;
  institution: string;
  joinedAt: number | null;
  likesReceived: number;
  /** Relay-verified Ed25519 pubkey (base64); enables "Message" without an invite. */
  pubkey: string;
  pubkeyHash: string;
  reflectionCount: number;
  showActivity: boolean;
  showLikes: boolean;
};

/** A reflection on a profile's "Reflects" tab, with its Echo context. */
export type WhisperAuthorReflection = WhisperReflection & {
  echoAuthorName: string;
  echoBody: string;
  echoId: string;
};

export type WhisperFollowEntry = {
  avatar: string;
  displayName: string;
  pubkeyHash: string;
};

// When an Echo is a Ripple of another Echo, it carries a lightweight snapshot
// of the original so the quoted content survives even if the source is gone.
export type WhisperRippleSource = {
  authorName: string;
  body: string;
  createdAt: number;
  id: string;
};

export type WhisperEcho = {
  authorHash: string;
  authorName: string;
  body: string;
  createdAt: number;
  // "Likes" — kept as a count plus a personal flag so seeded/other-user
  // activity can show realistic totals in this local-first feed.
  echoCount: number;
  echoedByMe: boolean;
  id: string;
  /** Total live replies across the whole thread (authoritative counter). */
  reflectionCount: number;
  /** Loaded reflections: a small preview until the thread is opened, then the
   *  lazily-paged thread. Always a subset when reflectionCount is larger. */
  reflections: WhisperReflection[];
  // "Reposts"
  rippleCount: number;
  rippledByMe: boolean;
  rippleOf?: WhisperRippleSource;
};

export type SafetyReport = {
  category: "spam" | "harassment" | "illegal" | "impersonation" | "other";
  createdAt: number;
  id: string;
  notes: string;
  targetId: string;
  targetType: "user" | "community" | "status" | "message" | "whisper";
  title: string;
};

export type ReportTarget = {
  id: string;
  title: string;
  type: SafetyReport["targetType"];
};

export type GlobalSearchResult = {
  id: string;
  label: string;
  meta: string;
  targetId: string;
  targetType: "chat" | "group" | "message" | "status" | "community" | "whisper" | "ghost";
};
export type DeliveryGlyph = "clock" | "check" | "double-check" | "double-check-read";
