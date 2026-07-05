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

export type SafetyReport = {
  category: "spam" | "harassment" | "illegal" | "impersonation" | "other";
  createdAt: number;
  id: string;
  notes: string;
  targetId: string;
  targetType: "user" | "community" | "status" | "message";
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
  targetType: "chat" | "group" | "message" | "status" | "community";
};
export type DeliveryGlyph = "clock" | "check" | "double-check" | "double-check-read";
