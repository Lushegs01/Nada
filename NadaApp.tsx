"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from "react";
import Dexie from "dexie";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  BarChart2,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Flag,
  Ghost,
  Gift,
  Image,
  Loader2,
  MessageCircle,
  Mic,
  MoreVertical,
  Music,
  Phone,
  Pin,
  Plus,
  QrCode,
  Reply,
  Search,
  Send,
  Settings,
  Share2,
  ShieldAlert,
  ShieldOff,
  Trash2,
  Upload,
  User,
  Users,
  Video,
  WifiOff,
  X
} from "lucide-react";
import { IncomingCallModal, VoiceCallOverlay, VideoCallOverlay } from "@/components/CallOverlay";
import { GroupCallOverlay } from "@/components/GroupCallOverlay";
import {
  VoiceNoteBubble,
  VoiceRecorderBar,
  isVoiceNoteMessage,
  parseVoiceNoteBody,
  isInlineImageMessage,
  isInlineFileMessage,
  parseInlineFileMessage
} from "@/components/VoiceNote";
import { useCallStore } from "@/stores/useCallStore";
import { QRCodeSVG } from "qrcode.react";
import {
  MobileChatsHome,
  ArchivedRow,
  EmptyChatListState
} from "./NadaMobileUI";
import { IconRail as DesktopNavRail } from "./IconRail";
import { ChatListItem } from "./ChatListItem2";

import {
  createAnonymousIdentity,
  createSeedPhrase,
  createGroupSenderKey,
  decryptGroupMessage,
  encryptGroupMessage,
  mockEncryptMessage,
  mockDecryptMessage
} from "@nada/crypto";
import type {
  ChatRecord,
  ContactRecord,
  IdentityRecord,
  MessageRecord
} from "@nada/db";
import type {
  GroupMessageEnvelope,
  GroupInvitePayload,
  InvitePayload,
  MessageEnvelope,
  PaidBillingPlan,
  PollData,
  PollOption,
  MediaAttachment,
  ReplyToMessage,
  SubscriptionStatusResponse
} from "@nada/types";
import { Avatar, Button, IconButton, IdentityOrb, GroupOrb, cn } from "@nada/ui";

import {
  directChatId,
  loadMessagesForChat,
  markChatAsRead,
  nadaDb,
  primaryIdentityId,
  getChatPref,
  setChatPref,
  isMuted,
  isBlocked,
  getGlobalSetting,
  setGlobalSetting,
  type ChatPrefRecord
} from "@/lib/db";
import {
  fetchSubscriptionStatus,
  redeemReferral,
  startCheckout
} from "@/lib/billing";
import {
  buildGroupMigrationPayload,
  parseGroupMigrationPayload
} from "@/lib/group-migration";
import {
  buildGroupInviteUrl,
  buildInviteUrl,
  parseGroupInviteInput,
  parseGroupInviteToken,
  parseInviteInput,
  parseInviteToken
} from "@/lib/invite";
import {
  buildShareCardPayload,
  shareInviteCard
} from "@/lib/share-card";
import {
  buildMediaPayload,
  buildReplySnapshot,
  buildTextPayload,
  decodeMessagePayload,
  encodeMessagePayload,
  mediaFromMessage,
  messageKindFromRecord,
  previewForMessage,
  textFromMessage
} from "@/lib/media-message";
import {
  formatBytes,
  openDecryptedMedia,
  prepareMediaFile,
  uploadEncryptedMedia,
  validateMediaFile,
  type PreparedMediaFile
} from "@/lib/media-upload";
import { createLocalCallSession, type LocalCallSession } from "@/lib/webrtc";
import type { CallMode } from "@/lib/webrtc";
import { getRelayHttpBaseUrl } from "@/lib/relay-url";
import { useSocketStore } from "@/stores/useSocketStore";
import { useIdentityStore } from "@/stores/useIdentityStore";

type Panel =
  | "billing"
  | "contacts"
  | "group"
  | "community_create"
  | "migration"
  | "settings"
  | "share"
  | "status_create"
  | null;

type MessageContextMenuState = {
  messageId: string;
  x: number;
  y: number;
};

const PENDING_ENCRYPTED_PAYLOAD = "__pending_encryption__";
const STATUS_COMMENT_PREFIX = "status-comments:";

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
const NADA_DEV_PLAINTEXT_ENABLED =
  process.env["NEXT_PUBLIC_NADA_DEV_PLAINTEXT"] === "true" &&
  process.env["NODE_ENV"] !== "production";

if (
  process.env["NEXT_PUBLIC_NADA_DEV_PLAINTEXT"] === "true" &&
  process.env["NODE_ENV"] === "production"
) {
  throw new Error(
    "NEXT_PUBLIC_NADA_DEV_PLAINTEXT must not be enabled on production builds."
  );
}

const COMMUNITIES_SETTING_KEY = "communities.v1";
const REPORTS_SETTING_KEY = "safety.reports.v1";
const ONBOARDING_DISMISSED_SETTING_KEY = "onboarding.dismissed.v1";
const NOTIFICATION_SETTINGS_KEY = "notifications.settings.v1";
const CALL_RING_TIMEOUT_MS = 45000;
const GROUP_DECRYPTION_FALLBACK_TEXT =
  "Encrypted group message unavailable. Ask the creator to send the group invite again.";

type NotificationTone = "message" | "status" | "call" | "end" | "silent";
type NotificationSoundChoice = "nada" | "glass" | "pulse" | "silent";
type NotificationRingtoneChoice = "nada" | "orbit" | "pulse" | "silent";
type NotificationPreviewPrivacy = "full" | "private";

type NotificationSettings = {
  notificationTone: NotificationSoundChoice;
  previewPrivacy: NotificationPreviewPrivacy;
  ringtone: NotificationRingtoneChoice;
  vibration: boolean;
};

const NOTIFICATION_SOUND_CHOICES: NotificationSoundChoice[] = [
  "nada",
  "glass",
  "pulse",
  "silent"
];
const NOTIFICATION_RINGTONE_CHOICES: NotificationRingtoneChoice[] = [
  "nada",
  "orbit",
  "pulse",
  "silent"
];
const NOTIFICATION_PREVIEW_PRIVACY_CHOICES: NotificationPreviewPrivacy[] = [
  "full",
  "private"
];

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notificationTone: "nada",
  previewPrivacy: "private",
  ringtone: "nada",
  vibration: true
};
const STATUS_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉"] as const;

type ChatListModel = {
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

type PendingChatAction = {
  action: "archive" | "unarchive" | "delete" | "delete-group";
  chatId: string;
  contactHash?: string;
  groupId?: string;
  title: string;
};

type StatusCommentPayload = {
  kind: "status-comment";
  statusId: string;
  statusOwnerPubkeyHash: string;
  text: string;
  version: 1;
};

type StatusReactionPayload = {
  emoji: string;
  kind: "status-reaction";
  statusId: string;
  statusOwnerPubkeyHash: string;
  version: 1;
};

type StatusDeletePayload = {
  kind: "status-delete";
  statusId: string;
  statusOwnerPubkeyHash: string;
  version: 1;
};

type GroupDeletePayload = {
  groupId: string;
  kind: "group-delete";
  ownerPubkeyHash: string;
  version: 1;
};

type CommunityRecord = {
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

type CommunityPost = {
  authorName: string;
  body: string;
  channelId: string;
  createdAt: number;
  id: string;
};

type CommunityDraft = {
  category: string;
  description: string;
  privacy: "open" | "invite-only";
  title: string;
};

type SafetyReport = {
  category: "spam" | "harassment" | "illegal" | "impersonation" | "other";
  createdAt: number;
  id: string;
  notes: string;
  targetId: string;
  targetType: "user" | "community" | "status" | "message";
  title: string;
};

type ReportTarget = {
  id: string;
  title: string;
  type: SafetyReport["targetType"];
};

type GlobalSearchResult = {
  id: string;
  label: string;
  meta: string;
  targetId: string;
  targetType: "chat" | "group" | "message" | "status" | "community";
};

function mergeMessageRecords(...groups: MessageRecord[][]): MessageRecord[] {
  const byId = new Map<string, MessageRecord>();
  for (const group of groups) {
    for (const message of group) {
      byId.set(message.id, message);
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id.localeCompare(b.id);
  });
}

function statusCommentChatId(statusId: string): string {
  return `${STATUS_COMMENT_PREFIX}${statusId}`;
}

function parseStatusCommentPayload(body: string): StatusCommentPayload | null {
  try {
    const parsed = JSON.parse(body) as Partial<StatusCommentPayload>;
    return parsed.kind === "status-comment" &&
      parsed.version === 1 &&
      typeof parsed.statusId === "string" &&
      typeof parsed.statusOwnerPubkeyHash === "string" &&
      typeof parsed.text === "string"
      ? {
          kind: "status-comment",
          statusId: parsed.statusId,
          statusOwnerPubkeyHash: parsed.statusOwnerPubkeyHash,
          text: parsed.text,
          version: 1
        }
      : null;
  } catch {
    return null;
  }
}

function parseStatusReactionPayload(body: string): StatusReactionPayload | null {
  try {
    const parsed = JSON.parse(body) as Partial<StatusReactionPayload>;
    return parsed.kind === "status-reaction" &&
      parsed.version === 1 &&
      typeof parsed.statusId === "string" &&
      typeof parsed.statusOwnerPubkeyHash === "string" &&
      typeof parsed.emoji === "string" &&
      parsed.emoji.trim().length > 0
      ? {
          emoji: parsed.emoji,
          kind: "status-reaction",
          statusId: parsed.statusId,
          statusOwnerPubkeyHash: parsed.statusOwnerPubkeyHash,
          version: 1
        }
      : null;
  } catch {
    return null;
  }
}

function parseStatusDeletePayload(body: string): StatusDeletePayload | null {
  try {
    const parsed = JSON.parse(body) as Partial<StatusDeletePayload>;
    return parsed.kind === "status-delete" &&
      parsed.version === 1 &&
      typeof parsed.statusId === "string" &&
      typeof parsed.statusOwnerPubkeyHash === "string"
      ? {
          kind: "status-delete",
          statusId: parsed.statusId,
          statusOwnerPubkeyHash: parsed.statusOwnerPubkeyHash,
          version: 1
        }
      : null;
  } catch {
    return null;
  }
}

function parseGroupDeletePayload(body: string): GroupDeletePayload | null {
  try {
    const parsed = JSON.parse(body) as Partial<GroupDeletePayload>;
    return parsed.kind === "group-delete" &&
      parsed.version === 1 &&
      typeof parsed.groupId === "string" &&
      typeof parsed.ownerPubkeyHash === "string"
      ? {
          groupId: parsed.groupId,
          kind: "group-delete",
          ownerPubkeyHash: parsed.ownerPubkeyHash,
          version: 1
        }
      : null;
  } catch {
    return null;
  }
}

function parseNotificationSettings(value: string | null): NotificationSettings {
  if (!value) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  try {
    const parsed = JSON.parse(value) as Partial<NotificationSettings>;
    return {
      notificationTone: NOTIFICATION_SOUND_CHOICES.includes(
        parsed.notificationTone as NotificationSoundChoice
      )
        ? (parsed.notificationTone as NotificationSoundChoice)
        : DEFAULT_NOTIFICATION_SETTINGS.notificationTone,
      previewPrivacy: NOTIFICATION_PREVIEW_PRIVACY_CHOICES.includes(
        parsed.previewPrivacy as NotificationPreviewPrivacy
      )
        ? (parsed.previewPrivacy as NotificationPreviewPrivacy)
        : DEFAULT_NOTIFICATION_SETTINGS.previewPrivacy,
      ringtone: NOTIFICATION_RINGTONE_CHOICES.includes(
        parsed.ringtone as NotificationRingtoneChoice
      )
        ? (parsed.ringtone as NotificationRingtoneChoice)
        : DEFAULT_NOTIFICATION_SETTINGS.ringtone,
      vibration:
        typeof parsed.vibration === "boolean"
          ? parsed.vibration
          : DEFAULT_NOTIFICATION_SETTINGS.vibration
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

function notificationToneLabel(choice: NotificationSoundChoice): string {
  switch (choice) {
    case "glass":
      return "Glass";
    case "pulse":
      return "Pulse";
    case "silent":
      return "Silent";
    case "nada":
    default:
      return "NADA";
  }
}

function notificationRingtoneLabel(choice: NotificationRingtoneChoice): string {
  switch (choice) {
    case "orbit":
      return "Orbit";
    case "pulse":
      return "Pulse";
    case "silent":
      return "Silent";
    case "nada":
    default:
      return "NADA";
  }
}

function deliveryStatusRank(status: MessageRecord["status"]): number {
  switch (status) {
    case "read":
      return 5;
    case "delivered":
      return 4;
    case "sent":
      return 3;
    case "queued":
      return 2;
    case "failed":
      return 1;
    case "local":
    default:
      return 0;
  }
}

type DeliveryGlyph = "clock" | "check" | "double-check" | "double-check-read";

function deliveryStatusGlyph(
  status: MessageRecord["status"]
): { glyph: DeliveryGlyph; label: string; tone: "muted" | "read" } {
  switch (status) {
    case "read":
      return { glyph: "double-check-read", label: "Read", tone: "read" };
    case "delivered":
      return { glyph: "double-check", label: "Delivered", tone: "muted" };
    case "sent":
      return { glyph: "check", label: "Sent", tone: "muted" };
    case "queued":
    case "local":
    default:
      return { glyph: "clock", label: "Pending", tone: "muted" };
  }
}

function parseCommunityRecords(raw: string | null): CommunityRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): CommunityRecord | null => {
        if (!item || typeof item !== "object") return null;
        const record = item as Partial<CommunityRecord>;
        if (
          typeof record.id !== "string" ||
          typeof record.title !== "string" ||
          typeof record.category !== "string" ||
          typeof record.description !== "string" ||
          typeof record.createdAt !== "number" ||
          typeof record.updatedAt !== "number"
        ) {
          return null;
        }

        return {
          admins: Array.isArray(record.admins)
            ? record.admins.filter((item): item is string => typeof item === "string")
            : [],
          category: record.category,
          channels: Array.isArray(record.channels)
            ? record.channels
                .map((channel) => {
                  if (!channel || typeof channel !== "object") return null;
                  const item = channel as { id?: unknown; title?: unknown };
                  return typeof item.id === "string" && typeof item.title === "string"
                    ? { id: item.id, title: item.title }
                    : null;
                })
                .filter((channel): channel is { id: string; title: string } => Boolean(channel))
            : [{ id: "general", title: "General" }],
          createdAt: record.createdAt,
          description: record.description,
          id: record.id,
          joined: record.joined !== false,
          memberCount:
            typeof record.memberCount === "number" && record.memberCount > 0
              ? record.memberCount
              : 1,
          moderators: Array.isArray(record.moderators)
            ? record.moderators.filter((item): item is string => typeof item === "string")
            : [],
          posts: Array.isArray(record.posts)
            ? record.posts
                .map((post) => {
                  if (!post || typeof post !== "object") return null;
                  const item = post as Partial<CommunityPost>;
                  return typeof item.id === "string" &&
                    typeof item.body === "string" &&
                    typeof item.authorName === "string" &&
                    typeof item.channelId === "string" &&
                    typeof item.createdAt === "number"
                    ? {
                        authorName: item.authorName,
                        body: item.body,
                        channelId: item.channelId,
                        createdAt: item.createdAt,
                        id: item.id
                      }
                    : null;
                })
                .filter((post): post is CommunityPost => Boolean(post))
            : [],
          privacy: record.privacy === "invite-only" ? "invite-only" : "open",
          title: record.title,
          topics: Array.isArray(record.topics)
            ? record.topics.filter((item): item is string => typeof item === "string")
            : [],
          updatedAt: record.updatedAt
        };
      })
      .filter((record): record is CommunityRecord => Boolean(record))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function parseSafetyReports(raw: string | null): SafetyReport[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): SafetyReport | null => {
        if (!item || typeof item !== "object") return null;
        const report = item as Partial<SafetyReport>;
        if (
          typeof report.id !== "string" ||
          typeof report.title !== "string" ||
          typeof report.targetId !== "string" ||
          typeof report.notes !== "string" ||
          typeof report.createdAt !== "number"
        ) {
          return null;
        }
        return {
          category:
            report.category === "spam" ||
            report.category === "harassment" ||
            report.category === "illegal" ||
            report.category === "impersonation"
              ? report.category
              : "other",
          createdAt: report.createdAt,
          id: report.id,
          notes: report.notes,
          targetId: report.targetId,
          targetType:
            report.targetType === "community" ||
            report.targetType === "status" ||
            report.targetType === "message"
              ? report.targetType
              : "user",
          title: report.title
        };
      })
      .filter((report): report is SafetyReport => Boolean(report))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function defaultCommunityChannels(category: string): Array<{ id: string; title: string }> {
  const normalized = category.toLowerCase();
  if (normalized === "sports") {
    return [
      { id: "general", title: "General" },
      { id: "matches", title: "Matches" },
      { id: "transfers", title: "Transfers" }
    ];
  }
  if (normalized === "tech") {
    return [
      { id: "general", title: "General" },
      { id: "builds", title: "Builds" },
      { id: "jobs", title: "Jobs" }
    ];
  }
  return [
    { id: "general", title: "General" },
    { id: "announcements", title: "Announcements" },
    { id: "off-topic", title: "Off-topic" }
  ];
}

function defaultCommunityTopics(category: string): string[] {
  const normalized = category.toLowerCase();
  if (normalized === "sports") return ["Live games", "Predictions", "Highlights"];
  if (normalized === "tech") return ["Startups", "AI", "Frontend"];
  if (normalized === "music") return ["New releases", "Playlists", "Events"];
  return [category, "Introductions", "Events"];
}

async function loadStatusComments(statusId: string): Promise<MessageRecord[]> {
  return loadMessagesForChat(statusCommentChatId(statusId));
}

function generateRandomUsername(seed = crypto.randomUUID()): string {
  const adjectives = [
    "Silent", "Hidden", "Velvet", "Obsidian", "Midnight", "Golden", "Cipher", "Ghost",
    "Signal", "Nocturne", "Nova", "Private", "Quiet", "Vanta", "Echo", "Lunar"
  ];
  const nouns = [
    "Key", "Signal", "Node", "Pulse", "Room", "Cipher", "Trace", "Vault",
    "Relay", "Mask", "Drift", "Halo", "Rune", "Wave", "Lock", "Path"
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const adjective = adjectives[hash % adjectives.length]!;
  const noun = nouns[Math.floor(hash / adjectives.length) % nouns.length]!;
  const suffix = hash.toString(16).slice(0, 4).toUpperCase().padStart(4, "0");
  return `${adjective} ${noun} ${suffix}`;
}

function isLegacyNadaName(name: string): boolean {
  return name === "NADA" || /^NADA\s+[a-f0-9]/i.test(name);
}

export function NadaApp(): JSX.Element {
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const connect = useSocketStore((state) => state.connect);
  const disconnect = useSocketStore((state) => state.disconnect);
  const setUnlocked = useIdentityStore((state) => state.setUnlocked);

  useEffect(() => {
    let active = true;

    void nadaDb.identity.get(primaryIdentityId).then((record) => {
      if (!active) {
        return;
      }

      setIdentity(record ?? null);
      if (record?.localPrivateKey) {
        setUnlocked({
          pubkey: record.pubkey,
          pubkeyHash: record.pubkeyHash,
          privateKey: record.localPrivateKey
        });
      } else {
        setUnlocked(null);
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [setUnlocked]);

  useEffect(() => {
    if (!identity) {
      return;
    }

    connect({ pubkeyHash: identity.pubkeyHash });
    return () => {
      disconnect();
    };
  }, [connect, disconnect, identity]);

  const handleComplete = useCallback(
    (nextIdentity: IdentityRecord) => {
      setIdentity(nextIdentity);
      if (nextIdentity.localPrivateKey) {
        setUnlocked({
          pubkey: nextIdentity.pubkey,
          pubkeyHash: nextIdentity.pubkeyHash,
          privateKey: nextIdentity.localPrivateKey
        });
      }
    },
    [setUnlocked]
  );

  if (isLoading) {
    return <Splash />;
  }

  return (
    <main className="nada-shell min-h-dvh">
      <OfflineBanner isOnline={isOnline} />
      {identity ? (
        <Dashboard identity={identity} />
      ) : (
        <Onboarding onComplete={handleComplete} />
      )}
    </main>
  );
}

function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const handleOnline = (): void => {
      setIsOnline(true);
    };
    const handleOffline = (): void => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

function OfflineBanner({ isOnline }: { isOnline: boolean }): JSX.Element | null {
  if (isOnline) {
    return null;
  }

  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-0 top-0 z-toast flex items-center justify-center gap-2 bg-nada-danger px-4 py-2.5 text-xs font-medium text-white shadow-md"
      initial={{ y: -40, opacity: 0 }}
    >
      <WifiOff size={14} />
      You are offline — messages will sync when reconnected
    </motion.div>
  );
}

function Splash(): JSX.Element {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-nada-bg">
      <div className="pointer-events-none absolute inset-0 nada-hero-gradient" />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-60 blur-[110px] animate-aurora"
        style={{
          background:
            "radial-gradient(circle, rgba(124,58,237,0.45) 0%, rgba(37,99,235,0.20) 40%, rgba(16,217,138,0.10) 60%, transparent 75%)"
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-9 animate-fade-in">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 22 }}
          className="relative"
        >
          <div className="absolute inset-0 rounded-[28px] blur-2xl opacity-80 animate-logo-glow nada-logo-aura" />
          <div className="relative grid h-[84px] w-[84px] place-items-center overflow-hidden rounded-[24px] nada-logo-aura">
            <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
          </div>
        </motion.div>
        <div className="flex flex-col items-center gap-4">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.36em] text-nada-accent/85">
            NADA
          </span>
          <div className="flex items-center gap-1.5">
            <div className="nada-typing-dot" />
            <div className="nada-typing-dot" />
            <div className="nada-typing-dot" />
          </div>
        </div>
      </div>
    </main>
  );
}

function Onboarding({
  onComplete
}: {
  onComplete: (identity: IdentityRecord) => void;
}): JSX.Element {
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState<IdentityRecord | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState("");
  const seedWords = useMemo(() => seedPhrase.split(" ").filter(Boolean), [seedPhrase]);

  const generateIdentity = async (): Promise<void> => {
    setIsGenerating(true);
    const phrase = createSeedPhrase();
    const anonymousIdentity = await createAnonymousIdentity(phrase);
    setSeedPhrase(phrase);
    setDraft({
      id: primaryIdentityId,
      pubkey: anonymousIdentity.pubkey,
      pubkeyHash: anonymousIdentity.pubkeyHash,
      encryptedPrivateKey: anonymousIdentity.encryptedPrivateKey,
      localPrivateKey: anonymousIdentity.privateKey,
      seedBackupStatus: "pending",
      createdAt: anonymousIdentity.createdAt
    });
    setIsGenerating(false);
  };

  const finish = async (): Promise<void> => {
    if (!draft || !saved) {
      return;
    }

    const confirmed: IdentityRecord = {
      ...draft,
      seedBackupStatus: "confirmed"
    };
    await nadaDb.identity.put(confirmed);
    await nadaDb.settings.put({
      key: "displayName",
      value: displayName.trim() || generateRandomUsername(draft.pubkeyHash),
      updatedAt: Date.now()
    });
    onComplete(confirmed);
  };

  return (
    <section className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center overflow-hidden px-6 py-12">
      {/* Aurora backdrop — NADA green */}
      <div className="pointer-events-none absolute inset-0 nada-hero-gradient" />
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-[460px] w-[460px] -translate-x-1/2 rounded-full opacity-50 blur-[110px] animate-aurora"
        style={{
          background:
            "radial-gradient(circle, rgba(124,58,237,0.55) 0%, rgba(37,99,235,0.18) 45%, transparent 72%)"
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full opacity-35 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(16,217,138,0.40) 0%, rgba(37,99,235,0.18) 45%, transparent 72%)"
        }}
      />

      <div className="relative z-10">
        {/* Brand mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="mb-9 relative inline-flex"
        >
          <div className="absolute inset-0 rounded-[22px] blur-xl opacity-70 nada-logo-aura animate-logo-glow" />
          <div className="relative grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-[22px] nada-logo-aura">
            <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
          </div>
        </motion.div>

        <p className="text-[11px] font-extrabold uppercase tracking-[0.32em] text-nada-accent/85">
          NADA
        </p>

        {!draft ? (
          <>
            <h1 className="mt-3 text-[42px] font-extrabold leading-[1.02] tracking-tight text-nada-primary text-balance">
              Message Freely.{" "}
              <span className="nada-accent-text">Stay Unknown.</span>
            </h1>
            <p className="mt-4 max-w-sm text-[15.5px] leading-relaxed text-nada-secondary/85">
              Anonymous conversations with zero pressure. End-to-end encrypted,
              no phone number, no email — your identity is a keypair on this
              device.
            </p>

            <div className="mt-10 space-y-3 animate-fade-in">
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ y: -1 }}
                className="w-full rounded-full py-4 text-[15px] nada-btn-gold disabled:opacity-50"
                disabled={isGenerating}
                onClick={() => { void generateIdentity(); }}
              >
                {isGenerating ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Creating identity…
                  </span>
                ) : (
                  "Enter as a ghost"
                )}
              </motion.button>
              <p className="text-center text-[12px] text-nada-secondary/60">
                We generate a seed phrase you can back up and restore.
              </p>
            </div>

            {/* Trust pills row */}
            <div className="mt-10 flex flex-wrap items-center justify-start gap-2">
              <span className="nada-security-pill">End-to-end encrypted</span>
              <span className="nada-ghost-badge">No phone · No email</span>
              <span className="nada-ghost-badge">Keys stay on device</span>
            </div>
          </>
        ) : (
          <div className="mt-2 animate-fade-in">
            <h1 className="text-[34px] font-extrabold leading-[1.04] tracking-tight text-nada-primary">
              Back up your{" "}
              <span className="nada-accent-text">ghost key</span>
            </h1>
            <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed text-nada-secondary/80">
              These 12 words are the only way to restore your identity. Anyone
              with this phrase can become you.
            </p>

            <div className="mt-8 space-y-5">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-nada-secondary/60">
                <span
                  className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold"
                  style={{
                    background: "var(--n-accent-gradient)",
                    color: "#FFFFFF"
                  }}
                >
                  2
                </span>
                <span>Seed phrase</span>
              </div>

              {/* Seed phrase grid */}
              <div className="rounded-3xl p-5 nada-surface-elevated">
                <div className="grid grid-cols-3 gap-2">
                  {seedWords.map((word, index) => (
                    <div
                      className="flex items-center gap-1.5 rounded-xl border border-nada-border/[0.08] bg-nada-surface/70 px-2.5 py-2 text-[12.5px] font-medium text-nada-primary"
                      key={`${word}-${index}`}
                    >
                      <span className="w-4 text-right font-mono text-[10px] font-semibold tabular-nums text-nada-accent/70">
                        {index + 1}
                      </span>
                      <span className="truncate">{word}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-nada-secondary/65">
                  Write these 12 words down in order, somewhere offline.
                </p>
              </div>

              <label className="flex cursor-pointer select-none items-center gap-3 rounded-2xl border border-nada-border/[0.08] bg-nada-surface/60 px-4 py-3 text-[13.5px] text-nada-primary/90 transition-colors hover:bg-nada-surface-elevated/55">
                <input
                  checked={saved}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: "rgb(var(--nada-accent))" }}
                  onChange={(event) => { setSaved(event.target.checked); }}
                  type="checkbox"
                />
                I&apos;ve saved my seed phrase somewhere safe
              </label>

              <input
                className="nada-input-dark h-12 w-full text-[15px]"
                maxLength={40}
                onChange={(event) => { setDisplayName(event.target.value); }}
                placeholder="Display name (optional)"
                value={displayName}
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ y: -1 }}
                className="w-full rounded-full py-4 text-[15px] nada-btn-gold disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!saved}
                onClick={() => void finish()}
              >
                Enter NADA
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Dashboard({ identity }: { identity: IdentityRecord }): JSX.Element {
  const searchParams = useSearchParams();
  const groupInviteToken = searchParams.get("g") ?? "";
  const inviteToken = searchParams.get("n") ?? "";
  const callSignals = useSocketStore((state) => state.callSignals);
  const deliveries = useSocketStore((state) => state.deliveries);
  const groupIncoming = useSocketStore((state) => state.groupIncoming);
  const incoming = useSocketStore((state) => state.incoming);
  const relayStatus = useSocketStore((state) => state.status);
  const sendCallSignal = useSocketStore((state) => state.sendCallSignal);
  const sendDelivery = useSocketStore((state) => state.sendDelivery);
  const sendEnvelope = useSocketStore((state) => state.sendEnvelope);
  const sendGroupEnvelope = useSocketStore((state) => state.sendGroupEnvelope);
  const sendTyping = useSocketStore((state) => state.sendTyping);
  const sendDeletion = useSocketStore((state) => state.sendDeletion);
  const typingIndicators = useSocketStore((state) => state.typingIndicators);
  
  const callStore = useCallStore();
  const activeCall = callStore.call;

  // ── new feature state ────────────────────────────────────────────────────────
  const incomingReactions = useSocketStore((state) => state.incomingReactions);
  const incomingDeletions = useSocketStore((state) => state.incomingDeletions);
  const sendReaction = useSocketStore((state) => state.sendReaction);
  const setSocketGhostMode = useSocketStore((state) => state.setGhostMode);
  const processedReactions = useRef<Set<string>>(new Set());
  const processedDeletions = useRef<Set<string>>(new Set());

  const [ghostMode, setGhostMode] = useState(false);
  const [mood, setMood] = useState("Available");
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);

  // Vantage Ghost Mode — drives the global fog/desaturation/blur CSS layer
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;
    if (ghostMode) {
      root.setAttribute("data-ghost", "true");
      body.setAttribute("data-ghost", "true");
    } else {
      root.removeAttribute("data-ghost");
      body.removeAttribute("data-ghost");
    }
    return () => {
      root.removeAttribute("data-ghost");
      body.removeAttribute("data-ghost");
    };
  }, [ghostMode]);
  // ─────────────────────────────────────────────────────────────────────────────
  
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [disappearingTimer, setDisappearingTimer] = useState(0);
  const [displayName, setDisplayName] = useState("NADA");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [selectedContactHash, setSelectedContactHash] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [chatPref, setChatPrefState] = useState<ChatPrefRecord>({
    chatId: "", mutedUntil: 0, clearedAt: 0, blockedPubkeyHashes: [],
    pinnedMessageId: null, pinnedMessageBody: null, archivedAt: 0, updatedAt: 0
  });
  const [archivedChatIds, setArchivedChatIds] = useState<Set<string>>(
    () => new Set()
  );
  const [mutedChatIds, setMutedChatIds] = useState<Set<string>>(
    () => new Set()
  );
  const [showArchivedChats, setShowArchivedChats] = useState(false);
  const [pendingChatAction, setPendingChatAction] =
    useState<PendingChatAction | null>(null);
  const [blurShieldActive, setBlurShieldActive] = useState(false);
  const [blurShieldRevealed, setBlurShieldRevealed] = useState(false);
  const [showGhostModal, setShowGhostModal] = useState(false);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [pendingReportTarget, setPendingReportTarget] = useState<ReportTarget | null>(null);
  const [inAppNotification, setInAppNotification] = useState<{ id: string; title: string; body: string; chatId: string } | null>(null);

  useEffect(() => {
    if (!showGhostModal && !showMoodModal && !forwardMessageId) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showGhostModal) setShowGhostModal(false);
      else if (showMoodModal) setShowMoodModal(false);
      else if (forwardMessageId) setForwardMessageId(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showGhostModal, showMoodModal, forwardMessageId]);
  const [allStatuses, setAllStatuses] = useState<MessageRecord[]>([]);
  const [communities, setCommunities] = useState<CommunityRecord[]>([]);
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedStatusSenderHash, setSelectedStatusSenderHash] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getGlobalSetting(COMMUNITIES_SETTING_KEY),
      getGlobalSetting(REPORTS_SETTING_KEY),
      getGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY),
      getGlobalSetting(NOTIFICATION_SETTINGS_KEY)
    ]).then(([communitiesValue, reportsValue, onboardingDismissed, notificationSettingsValue]) => {
      if (active) {
        setCommunities(parseCommunityRecords(communitiesValue));
        setSafetyReports(parseSafetyReports(reportsValue));
        setShowOnboarding(onboardingDismissed !== "true");
        setNotificationSettings(parseNotificationSettings(notificationSettingsValue));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const loadStatuses = useCallback(async () => {
    const now = Date.now();
    const records = await nadaDb.messages
      .where("[kind+createdAt]")
      .between(["status", now - 24 * 60 * 60 * 1000], ["status", Dexie.maxKey])
      .reverse()
      .toArray();
    setAllStatuses(records);
  }, []);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const statusPeerHashes = useMemo(
    () =>
      Array.from(
        new Set(
          contacts
            .map((contact) => contact.pubkeyHash)
            .filter((hash) => hash !== identity.pubkeyHash)
        )
      ),
    [contacts, identity.pubkeyHash]
  );

  const visibleStatuses = useMemo(() => {
    const peerSet = new Set(statusPeerHashes);
    return allStatuses.filter(
      (status) =>
        status.senderPubkeyHash === identity.pubkeyHash ||
        peerSet.has(status.senderPubkeyHash)
    );
  }, [allStatuses, identity.pubkeyHash, statusPeerHashes]);

  const syncStatusFeedFromRelay = useCallback(async (): Promise<void> => {
    if (statusPeerHashes.length === 0) return;
    const relayBaseUrl = getRelayHttpBaseUrl();
    if (!relayBaseUrl) return;

    try {
      const response = await fetch(new URL("/api/v1/statuses/query", relayBaseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: 120,
          senderPubkeyHashes: statusPeerHashes,
          since: Date.now() - 24 * 60 * 60 * 1000,
          viewerPubkeyHash: identity.pubkeyHash
        })
      });
      if (!response.ok) return;
      const data = (await response.json()) as { statuses?: MessageEnvelope[] };
      const envelopes = (data.statuses ?? []).filter(
        (envelope) =>
          envelope.messageKind === "status" &&
          statusPeerHashes.includes(envelope.sender)
      );
      if (envelopes.length === 0) return;
      await persistIncomingMessages(identity, envelopes);
      await loadStatuses();
    } catch {
      // Status relay sync is best-effort; direct socket delivery still works.
    }
  }, [identity, loadStatuses, statusPeerHashes]);

  useEffect(() => {
    void syncStatusFeedFromRelay();
    const intervalId = window.setInterval(() => {
      void syncStatusFeedFromRelay();
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, [syncStatusFeedFromRelay]);

  useEffect(() => {
    if (!selectedStatusSenderHash) return;
    if (
      selectedStatusSenderHash !== identity.pubkeyHash &&
      !statusPeerHashes.includes(selectedStatusSenderHash)
    ) {
      setSelectedStatusSenderHash(null);
    }
  }, [identity.pubkeyHash, selectedStatusSenderHash, statusPeerHashes]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);

  const playNotificationTone = useCallback((tone: NotificationTone): void => {
    const soundChoice =
      tone === "call" ? notificationSettings.ringtone : notificationSettings.notificationTone;
    if (tone === "silent" || soundChoice === "silent" || typeof window === "undefined") return;
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const context = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === "suspended") {
        void context.resume().catch(() => {});
      }

      const now = context.currentTime + 0.02;
      const patterns: Record<string, Array<[number, number, number]>> = {
        "call-nada": [
          [0, 560, 0.22],
          [0.28, 720, 0.24],
          [0.58, 560, 0.2]
        ],
        "call-orbit": [
          [0, 420, 0.2],
          [0.25, 620, 0.24],
          [0.52, 840, 0.18]
        ],
        "call-pulse": [
          [0, 520, 0.12],
          [0.2, 520, 0.12],
          [0.4, 700, 0.16]
        ],
        "end-nada": [[0, 240, 0.18]],
        "end-glass": [[0, 520, 0.12]],
        "end-pulse": [[0, 320, 0.1]],
        "message-nada": [
          [0, 720, 0.09],
          [0.12, 960, 0.12]
        ],
        "message-glass": [
          [0, 980, 0.06],
          [0.08, 1240, 0.09]
        ],
        "message-pulse": [
          [0, 520, 0.08],
          [0.12, 520, 0.08]
        ],
        "status-nada": [[0, 640, 0.12]],
        "status-glass": [[0, 1040, 0.1]],
        "status-pulse": [
          [0, 520, 0.08],
          [0.11, 680, 0.08]
        ]
      };
      const patternKey = `${tone}-${soundChoice}`;
      const fallbackKey = tone === "call" ? "call-nada" : `${tone}-nada`;
      const pattern = patterns[patternKey] ?? patterns[fallbackKey] ?? patterns["message-nada"]!;

      pattern.forEach(([offset, frequency, duration]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = tone === "call" ? "sine" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.065, now + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + duration + 0.025);
      });
    } catch {
      // Autoplay policies can block AudioContext until the next user gesture.
    }
  }, [notificationSettings.notificationTone, notificationSettings.ringtone]);

  const stopRingtone = useCallback((): void => {
    if (!ringtoneIntervalRef.current) return;
    window.clearInterval(ringtoneIntervalRef.current);
    ringtoneIntervalRef.current = null;
  }, []);

  const startRingtone = useCallback((chatId?: string): void => {
    if (chatId && mutedChatIds.has(chatId)) return;
    stopRingtone();
    playNotificationTone("call");
    ringtoneIntervalRef.current = window.setInterval(() => {
      playNotificationTone("call");
    }, 1500);
  }, [mutedChatIds, playNotificationTone, stopRingtone]);

  const showNotification = useCallback((
    title: string,
    body: string,
    chatId: string,
    options: { critical?: boolean; requireInteraction?: boolean; tone?: NotificationTone } = {}
  ) => {
    if (mutedChatIds.has(chatId)) {
      return;
    }
    const id = crypto.randomUUID();
    const tone = options.tone ?? (options.critical ? "call" : "message");
    const isPreviewPrivate = notificationSettings.previewPrivacy === "private" && !options.critical;
    const displayTitle = isPreviewPrivate ? "NADA" : title;
    const displayBody = isPreviewPrivate ? "Open NADA to view this update." : body;
    playNotificationTone(tone);
    setInAppNotification({ id, title: displayTitle, body: displayBody, chatId });
    setTimeout(() => {
      setInAppNotification((current) => current?.id === id ? null : current);
    }, options.critical ? 7000 : 4000);
    if (notificationSettings.vibration && "vibrate" in navigator) {
      navigator.vibrate(options.critical ? [80, 40, 80] : 18);
    }
    if (typeof window !== "undefined" && "Notification" in window) {
      const showSystemNotification = () => {
        try {
          const shouldShowSystem =
            document.visibilityState !== "visible" || Boolean(options.requireInteraction);
          if (Notification.permission === "granted" && shouldShowSystem) {
            new Notification(displayTitle, {
              body: displayBody,
              icon: "/logo.png",
              tag: chatId,
              ...(options.requireInteraction !== undefined
                ? { requireInteraction: options.requireInteraction }
                : {})
            });
          }
        } catch {
          // Some mobile/PWA browsers expose Notification but throw at runtime.
        }
      };
      try {
        if (Notification.permission === "default") {
          void Notification.requestPermission().then(showSystemNotification).catch(() => {});
        } else {
          showSystemNotification();
        }
      } catch {
      // Keep the in-app notification even when system notifications fail.
      }
    }
  }, [
    mutedChatIds,
    notificationSettings.previewPrivacy,
    notificationSettings.vibration,
    playNotificationTone
  ]);

  // Mobile UI state
  const [activeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("chats");
  // last-message preview cache: chatId -> { body, ts }
  const [lastMessages, setLastMessages] = useState<Record<string, { body: string; ts: number }>>({});
  // unread count cache: chatId -> count
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const processedGroupIncoming = useRef<Set<string>>(new Set());
  const processedGroupInvite = useRef("");
  const processedIncoming = useRef<Set<string>>(new Set());
  const processedCallSignals = useRef<Set<string>>(new Set());
  const processedInvite = useRef("");
  const callRingTimeoutRef = useRef<number | null>(null);

  const selectedContact = useMemo(
    () =>
      contacts.find((contact) => contact.pubkeyHash === selectedContactHash) ??
      null,
    [contacts, selectedContactHash]
  );
  const selectedGroup = useMemo(
    () => chats.find((chat) => chat.id === selectedGroupId) ?? null,
    [chats, selectedGroupId]
  );
  const selectedChatId = useMemo(
    () => {
      if (selectedGroup) {
        return selectedGroup.id;
      }

      return selectedContact
        ? directChatId(identity.pubkeyHash, selectedContact.pubkeyHash)
        : "";
    },
    [identity.pubkeyHash, selectedContact, selectedGroup]
  );
  const selectedTitle = selectedGroup?.title ?? selectedContact?.localDisplayName ?? "";
  const replyMessage = useMemo(
    () => messages.find((message) => message.id === replyToId) ?? null,
    [messages, replyToId]
  );
  const replySnapshot = useMemo<ReplyToMessage | undefined>(() => {
    if (!replyMessage) {
      return undefined;
    }

    const senderName =
      replyMessage.senderPubkeyHash === identity.pubkeyHash
        ? "You"
        : contacts.find((contact) => contact.pubkeyHash === replyMessage.senderPubkeyHash)
            ?.localDisplayName || undefined;

    return buildReplySnapshot({
      message: replyMessage,
      myPubkeyHash: identity.pubkeyHash,
      ...(senderName && { senderName })
    });
  }, [contacts, identity.pubkeyHash, replyMessage]);
  const editingMessage = useMemo(
    () => messages.find((message) => message.id === editingMessageId) ?? null,
    [editingMessageId, messages]
  );
  const chatMessages = useMemo(
    () => messages.filter((message) => message.createdAt > chatPref.clearedAt),
    [messages, chatPref.clearedAt]
  );

  const peerIsBlocked = useMemo(
    () => selectedContact ? isBlocked(chatPref, selectedContact.pubkeyHash) : false,
    [chatPref, selectedContact]
  );

  const chatIsMuted = useMemo(() => isMuted(chatPref), [chatPref]);

  const totalUnreadCount = useMemo(() => 
    Object.values(unreadCounts).reduce((acc, count) => acc + count, 0),
    [unreadCounts]
  );
  const presenceByHash = useMemo(() => {
    const activeTypingHashes = new Set(Object.values(typingIndicators));
    const next: Record<string, { label: string; online: boolean }> = {};

    for (const contact of contacts) {
      const chatId = directChatId(identity.pubkeyHash, contact.pubkeyHash);
      const lastMessageTs = lastMessages[chatId]?.ts ?? contact.addedAt;
      const isTyping = activeTypingHashes.has(contact.pubkeyHash);
      const online = isTyping;
      next[contact.pubkeyHash] = {
        label: online
          ? "online now"
          : lastMessageTs > 0
            ? `last active ${formatRelativeTime(lastMessageTs)}`
            : "last active hidden",
        online
      };
    }

    return next;
  }, [contacts, identity.pubkeyHash, lastMessages, typingIndicators]);
  const selectedSubtitle = selectedGroup
    ? `${selectedGroup.memberPubkeyHashes.length} members`
    : selectedContact
      ? `${presenceByHash[selectedContact.pubkeyHash]?.label ?? "last active hidden"} · ${selectedContact.trustStatus}`
      : "";
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) {
      setGlobalSearchResults([]);
      return;
    }

    let active = true;
    void nadaDb.messages
      .toArray()
      .then((records) => {
        if (!active) return;
        const recentRecords = records
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 250);
        const results: GlobalSearchResult[] = [];

        for (const contact of contacts) {
          const name = contact.localDisplayName;
          if (name.toLowerCase().includes(query) || contact.pubkeyHash.toLowerCase().includes(query)) {
            results.push({
              id: `chat:${contact.pubkeyHash}`,
              label: name,
              meta: "Direct chat",
              targetId: contact.pubkeyHash,
              targetType: "chat"
            });
          }
        }

        for (const group of chats) {
          if (group.title.toLowerCase().includes(query)) {
            results.push({
              id: `group:${group.id}`,
              label: group.title,
              meta: `${group.memberPubkeyHashes.length} members`,
              targetId: group.id,
              targetType: "group"
            });
          }
        }

        for (const community of communities) {
          const haystack = `${community.title} ${community.description} ${community.category} ${community.topics.join(" ")}`.toLowerCase();
          if (haystack.includes(query)) {
            results.push({
              id: `community:${community.id}`,
              label: community.title,
              meta: `${community.category} community`,
              targetId: community.id,
              targetType: "community"
            });
          }
        }

        for (const status of visibleStatuses) {
          const text = textFromMessage(status);
          if (text.toLowerCase().includes(query)) {
            const name =
              status.senderPubkeyHash === identity.pubkeyHash
                ? "My Status"
                : contacts.find((contact) => contact.pubkeyHash === status.senderPubkeyHash)
                    ?.localDisplayName ?? generateRandomUsername(status.senderPubkeyHash);
            results.push({
              id: `status:${status.id}`,
              label: name,
              meta: text.slice(0, 72) || "Status update",
              targetId: status.senderPubkeyHash,
              targetType: "status"
            });
          }
        }

        for (const message of recentRecords) {
          if (message.deletedAt) continue;
          const preview = previewForMessage(message);
          if (!preview.toLowerCase().includes(query)) continue;
          const contact = contacts.find(
            (item) => directChatId(identity.pubkeyHash, item.pubkeyHash) === message.chatId
          );
          const group = chats.find((item) => item.id === message.chatId);
          results.push({
            id: `message:${message.id}`,
            label: group?.title ?? contact?.localDisplayName ?? "Message",
            meta: preview.slice(0, 80),
            targetId: message.id,
            targetType: "message"
          });
          if (results.length >= 12) break;
        }

        setGlobalSearchResults(results.slice(0, 12));
      });

    return () => {
      active = false;
    };
  }, [chats, communities, contacts, identity.pubkeyHash, searchQuery, visibleStatuses]);

  const sidebarChatItems = useMemo<ChatListModel[]>(() => {
    const groupItems = chats.map((chat) => {
      const chatId = chat.id;
      const lastMsg = lastMessages[chatId];
      const unread = unreadCounts[chatId] ?? 0;
      return {
        avatar: chat.avatar,
        chatId,
        groupId: chat.id,
        initials: chat.title.slice(0, 1).toUpperCase(),
        isArchived: archivedChatIds.has(chatId),
        isGroup: true,
        isSelected: selectedGroupId === chat.id,
        preview: lastMsg?.body || "Start a conversation",
        sortTs: lastMsg?.ts || chat.updatedAt || chat.createdAt,
        timestamp: lastMsg && lastMsg.ts > 0 ? formatRelativeTime(lastMsg.ts) : "",
        title: chat.title,
        unread
      };
    });

    const contactItems = contacts.map((contact) => {
      const chatId = directChatId(identity.pubkeyHash, contact.pubkeyHash);
      const lastMsg = lastMessages[chatId];
      const unread = unreadCounts[chatId] ?? 0;
      return {
        avatar: contact.localAvatar,
        chatId,
        contactHash: contact.pubkeyHash,
        initials: contact.localDisplayName.slice(0, 1).toUpperCase(),
        isArchived: archivedChatIds.has(chatId),
        isGroup: false,
        isOnline: presenceByHash[contact.pubkeyHash]?.online ?? false,
        isSelected: selectedContactHash === contact.pubkeyHash,
        preview: lastMsg?.body || "Start a conversation",
        sortTs: lastMsg?.ts || contact.addedAt,
        timestamp: lastMsg && lastMsg.ts > 0 ? formatRelativeTime(lastMsg.ts) : "",
        title: contact.localDisplayName,
        unread
      };
    });

    return [...groupItems, ...contactItems].sort((a, b) => b.sortTs - a.sortTs);
  }, [
    archivedChatIds,
    chats,
    contacts,
    identity.pubkeyHash,
    lastMessages,
    presenceByHash,
    selectedContactHash,
    selectedGroupId,
    unreadCounts
  ]);
  const archivedCount = useMemo(
    () => sidebarChatItems.filter((item) => item.isArchived).length,
    [sidebarChatItems]
  );
  useEffect(() => {
    if (archivedCount === 0 && showArchivedChats) {
      setShowArchivedChats(false);
    }
  }, [archivedCount, showArchivedChats]);

  const [dashboardToast, setDashboardToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setDashboardToast(msg);
    setTimeout(() => setDashboardToast(null), 2500);
  }, []);

  const saveNotificationSettings = useCallback(async (
    nextSettings: NotificationSettings
  ): Promise<void> => {
    setNotificationSettings(nextSettings);
    await setGlobalSetting(
      NOTIFICATION_SETTINGS_KEY,
      JSON.stringify(nextSettings)
    );
    showToast("Notification settings saved.");
  }, [showToast]);

  const handleGlobalSearchSelect = useCallback(async (result: GlobalSearchResult): Promise<void> => {
    setPanel(null);
    setSearchQuery("");
    setGlobalSearchResults([]);

    if (result.targetType === "community") {
      setSelectedContactHash(null);
      setSelectedGroupId(null);
      setActiveTab("communities");
      return;
    }

    if (result.targetType === "status") {
      setSelectedContactHash(null);
      setSelectedGroupId(null);
      setActiveTab("status");
      setSelectedStatusSenderHash(result.targetId);
      return;
    }

    if (result.targetType === "group") {
      const chat = chats.find((group) => group.id === result.targetId);
      setSelectedContactHash(null);
      setSelectedGroupId(result.targetId);
      setDisappearingTimer(chat?.disappearingTimer ?? 0);
      setActiveTab("chats");
      return;
    }

    if (result.targetType === "chat") {
      setSelectedGroupId(null);
      setSelectedContactHash(result.targetId);
      setActiveTab("chats");
      return;
    }

    const message = await nadaDb.messages.get(result.targetId);
    if (!message) return;
    const group = chats.find((chat) => chat.id === message.chatId);
    if (group) {
      setSelectedContactHash(null);
      setSelectedGroupId(group.id);
      setDisappearingTimer(group.disappearingTimer ?? 0);
    } else {
      const contact = contacts.find(
        (item) => directChatId(identity.pubkeyHash, item.pubkeyHash) === message.chatId
      );
      if (contact) {
        setSelectedGroupId(null);
        setSelectedContactHash(contact.pubkeyHash);
      }
    }
    setActiveTab("chats");
    setMessageSearchQuery(searchQuery.trim());
  }, [chats, contacts, identity.pubkeyHash, searchQuery]);



  // Load chat prefs when selected chat changes
  useEffect(() => {
    if (!selectedChatId) return;
    let active = true;
    void getChatPref(selectedChatId).then((pref) => {
      if (active) setChatPrefState(pref);
    });
    return () => { active = false; };
  }, [selectedChatId]);

  // Mark current chat as read when selected or when new messages arrive
  useEffect(() => {
    if (!selectedChatId) return;
    let active = true;

    void loadMessagesForChat(selectedChatId).then(async (records) => {
      const unread = records.filter(
        (message) =>
          message.direction === "inbound" &&
          !message.readAt &&
          message.senderPubkeyHash !== identity.pubkeyHash
      );
      const readAt = Date.now();
      await markChatAsRead(selectedChatId);
      if (!active) return;

      setUnreadCounts((prev) => ({ ...prev, [selectedChatId]: 0 }));
      if (unread.length > 0) {
        const readIds = new Set(unread.map((message) => message.id));
        setMessages((current) =>
          current.map((message) =>
            readIds.has(message.id) ? { ...message, readAt } : message
          )
        );
        unread.forEach((message) => {
          sendDelivery({
            type: "delivery",
            id: message.id,
            recipient: message.senderPubkeyHash,
            status: "read"
          });
        });
      }
    });

    return () => {
      active = false;
    };
  }, [identity.pubkeyHash, messages.length, selectedChatId, sendDelivery]);


  // Typing indicator — compute current chat's typing state
  const peerIsTyping = selectedChatId ? Boolean(typingIndicators[selectedChatId]) : false;

  useEffect(() => {
    let active = true;

    void nadaDb.settings.get("displayName").then(async (record) => {
      if (!active) {
        return;
      }

      const fallbackName = generateRandomUsername(identity.pubkeyHash);
      const nextName =
        !record?.value || isLegacyNadaName(record.value)
          ? fallbackName
          : record.value;
      if (nextName !== record?.value) {
        await nadaDb.settings.put({
          key: "displayName",
          value: nextName,
          updatedAt: Date.now()
        });
      }
      if (active) {
        setDisplayName(nextName);
      }
    });

    return () => {
      active = false;
    };
  }, [identity.pubkeyHash]);

  // Load ghost mode + mood from settings on mount
  useEffect(() => {
    let active = true;
    void Promise.all([
      getGlobalSetting("ghostMode"),
      getGlobalSetting("mood")
    ]).then(([gm, md]) => {
      if (!active) return;
      const enabled = gm === "true";
      setGhostMode(enabled);
      setSocketGhostMode(enabled);
      if (md) setMood(md);
    });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-blur when the page loses visibility (if blur shield is toggled on)
  useEffect(() => {
    if (!blurShieldActive) return;
    const handleHidden = () => {
      setBlurShieldRevealed(false);
    };
    document.addEventListener("visibilitychange", handleHidden);
    window.addEventListener("blur", handleHidden);
    return () => {
      document.removeEventListener("visibilitychange", handleHidden);
      window.removeEventListener("blur", handleHidden);
    };
  }, [blurShieldActive]);

  // Process incoming deletions from socket
  useEffect(() => {
    const newDeletions = incomingDeletions.filter(
      (d) => !processedDeletions.current.has(d.id)
    );
    if (newDeletions.length === 0) return;

    let active = true;
    void (async () => {
      for (const d of newDeletions) {
        processedDeletions.current.add(d.id);
        const deletedAt = d.timestamp;
        await nadaDb.messages.update(d.messageId, {
          deletedAt,
          body: ""
        });
      }
      if (!active) return;
      const messageRecords = selectedChatId ? await loadMessagesForChat(selectedChatId) : [];
      setMessages((current) =>
        selectedChatId
          ? mergeMessageRecords(
              messageRecords,
              current.filter((message) => message.chatId === selectedChatId)
            )
          : messageRecords
      );
    })();

    return () => { active = false; };
  }, [incomingDeletions, selectedChatId]);

  // Process incoming reactions from socket
  useEffect(() => {
    const newReactions = incomingReactions.filter(
      (r) => !processedReactions.current.has(r.id)
    );
    if (newReactions.length === 0) return;

    let active = true;
    void Promise.all(
      newReactions.map(async (r) => {
        processedReactions.current.add(r.id);
        const msg = await nadaDb.messages.get(r.messageId);
        if (!msg) return;
        const existing = msg.reactions ?? {};
        const senders = existing[r.emoji] ?? [];
        let updated: string[];
        if (r.removed) {
          updated = senders.filter((s) => s !== r.sender);
        } else if (!senders.includes(r.sender)) {
          updated = [...senders, r.sender];
        } else {
          return;
        }
        const nextReactions = { ...existing, [r.emoji]: updated };
        if (updated.length === 0) delete nextReactions[r.emoji];
        await nadaDb.messages.update(r.messageId, { reactions: nextReactions });
        if (active) {
          setMessages((current) =>
            current.map((m) =>
              m.id === r.messageId ? { ...m, reactions: nextReactions } : m
            )
          );
        }
      })
    );
    return () => { active = false; };
  }, [incomingReactions]);

  // Compute last-message preview + unread counts for sidebar
  useEffect(() => {
    if (contacts.length === 0 && chats.length === 0) return;
    let active = true;

    const allChatIds = [
      ...contacts.map((c) => directChatId(identity.pubkeyHash, c.pubkeyHash)),
      ...chats.map((c) => c.id)
    ];

    void Promise.all(
      allChatIds.map(async (chatId) => {
        const msgs = await loadMessagesForChat(chatId);
        const visible = msgs.filter((m) => !m.deletedAt || m.senderPubkeyHash === identity.pubkeyHash);
        const last = visible[visible.length - 1];
        const unread = visible.filter(
          (m) => m.direction === "inbound" && !m.readAt
        ).length;
        
        return {
          chatId,
          body: last ? previewForMessage(last, identity.pubkeyHash) : "Start a conversation",
          ts: last?.createdAt ?? 0,
          unread
        };
      })
    ).then((results) => {
      if (!active) return;
      const lm: Record<string, { body: string; ts: number }> = {};
      const uc: Record<string, number> = {};
      results.forEach(({ chatId, body, ts, unread }) => {
        lm[chatId] = { body, ts };
        uc[chatId] = unread;
      });
      setLastMessages(lm);
      setUnreadCounts(uc);
    });

    return () => { active = false; };
  // Recompute when messages, contacts, or chats change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contacts.length,
    chats.length,
    messages.length,
    identity.pubkeyHash,
    incoming.length,
    groupIncoming.length,
    incomingDeletions.length,
    selectedChatId
  ]);

  useEffect(() => {
    const chatIds = [
      ...contacts.map((contact) =>
        directChatId(identity.pubkeyHash, contact.pubkeyHash)
      ),
      ...chats.map((chat) => chat.id)
    ];
    if (chatIds.length === 0) {
      setArchivedChatIds(new Set());
      setMutedChatIds(new Set());
      return;
    }

    let active = true;
    void Promise.all(
      chatIds.map(async (chatId) => ({
        chatId,
        pref: await getChatPref(chatId)
      }))
    ).then((records) => {
      if (!active) return;
      setArchivedChatIds(
        new Set(
          records
            .filter(({ pref }) => (pref.archivedAt ?? 0) > 0)
            .map(({ chatId }) => chatId)
        )
      );
      setMutedChatIds(
        new Set(
          records
            .filter(({ pref }) => isMuted(pref))
            .map(({ chatId }) => chatId)
        )
      );
    });

    return () => {
      active = false;
    };
  }, [chats, contacts, identity.pubkeyHash]);



  useEffect(() => {
    let active = true;

    void nadaDb.contacts.orderBy("addedAt").reverse().toArray().then(async (records) => {
      if (!active) {
        return;
      }

      const renamed = records.map((contact) =>
        isLegacyNadaName(contact.localDisplayName)
          ? {
              ...contact,
              localDisplayName: generateRandomUsername(contact.pubkeyHash)
            }
          : contact
      );
      await Promise.all(
        renamed
          .filter((contact, index) => contact.localDisplayName !== records[index]?.localDisplayName)
          .map((contact) => nadaDb.contacts.put(contact))
      );
      if (active) {
        setContacts(renamed);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void nadaDb.chats.orderBy("updatedAt").reverse().toArray().then((records) => {
      if (!active) {
        return;
      }

      setChats(records.filter((chat) => chat.type === "group"));
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  useEffect(() => {
    if (!inviteToken || inviteToken === processedInvite.current) {
      return;
    }

    let active = true;
    const payload = parseInviteToken(inviteToken);
    if (!payload || payload.pubkeyHash === identity.pubkeyHash) {
      return;
    }

    processedInvite.current = inviteToken;
    void upsertContact(payload).then(async () => {
      const records = await nadaDb.contacts.orderBy("addedAt").reverse().toArray();
      if (!active) {
        return;
      }

      setContacts(records);
      setSelectedContactHash(payload.pubkeyHash);
      setMessageSearchQuery("");
    });

    return () => {
      active = false;
    };
  }, [identity.pubkeyHash, inviteToken]);

  useEffect(() => {
    if (
      !groupInviteToken ||
      groupInviteToken === processedGroupInvite.current
    ) {
      return;
    }

    const payload = parseGroupInviteToken(groupInviteToken);
    if (!payload) {
      return;
    }

    processedGroupInvite.current = groupInviteToken;
    let active = true;
    void upsertGroupFromInvite(identity, payload).then(async (chat) => {
      const chatRecords = await nadaDb.chats.orderBy("updatedAt").reverse().toArray();
      if (!active) {
        return;
      }

      setChats(chatRecords.filter((record) => record.type === "group"));
      setSelectedContactHash(null);
      setSelectedGroupId(chat.id);
      setDisappearingTimer(chat.disappearingTimer);
      setMessageSearchQuery("");
    });

    return () => {
      active = false;
    };
  }, [groupInviteToken, identity]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages((current) => (current.length === 0 ? current : []));
      return;
    }

    let active = true;
    void loadMessagesForChat(selectedChatId).then((records) => {
      if (!active) {
        return;
      }

      setMessages((current) =>
        mergeMessageRecords(
          records,
          current.filter((message) => message.chatId === selectedChatId)
        )
      );
    });

    return () => {
      active = false;
    };
  }, [selectedChatId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setMessages((current) =>
        current.filter((message) => !message.expiresAt || message.expiresAt > now)
      );
      void nadaDb.messages.where("expiresAt").belowOrEqual(now).delete();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const deliveryEntries = Object.entries(deliveries);
    if (deliveryEntries.length === 0) {
      return;
    }

    let active = true;
    void Promise.all(
      deliveryEntries.map(async ([id, status]) => {
        const existing = await nadaDb.messages.get(id);
        if (!existing) return;
        const nextStatus = status as MessageRecord["status"];
        if (deliveryStatusRank(nextStatus) < deliveryStatusRank(existing.status)) {
          return;
        }
        await nadaDb.messages.update(id, {
          status,
          ...(status === "read" ? { readAt: Date.now() } : {})
        });
      })
    ).then(() => {
      if (!active) {
        return;
      }

      setMessages((current) =>
        current.map((message) => {
          const nextStatus = deliveries[message.id];
          const rankedStatus = nextStatus as MessageRecord["status"] | undefined;
          return rankedStatus &&
            message.status !== rankedStatus &&
            deliveryStatusRank(rankedStatus) >= deliveryStatusRank(message.status)
            ? {
                ...message,
                status: rankedStatus,
                ...(rankedStatus === "read" ? { readAt: Date.now() } : {})
              }
            : message;
        })
      );
    });

    return () => {
      active = false;
    };
  }, [deliveries]);

  useEffect(() => {
    const newEnvelopes = incoming.filter(
      (envelope) =>
        envelope.recipient === identity.pubkeyHash &&
        !processedIncoming.current.has(envelope.id)
    );

    if (newEnvelopes.length === 0) {
      return;
    }

    let active = true;
    void persistIncomingMessages(identity, newEnvelopes).then(async () => {
      newEnvelopes.forEach((envelope) => {
        processedIncoming.current.add(envelope.id);
        sendDelivery({
          type: "delivery",
          id: envelope.id,
          recipient: envelope.sender,
          status: "delivered"
        });
      });
      const contactRecords = await nadaDb.contacts.orderBy("addedAt").reverse().toArray();
      const messageRecords = selectedChatId
        ? await loadMessagesForChat(selectedChatId)
        : [];

      if (!active) {
        return;
      }

      setContacts(contactRecords);
      setMessages((current) =>
        selectedChatId
          ? mergeMessageRecords(
              messageRecords,
              current.filter((message) => message.chatId === selectedChatId)
            )
          : messageRecords
      );

      newEnvelopes.forEach((env) => {
        const senderContact = contactRecords.find(c => c.pubkeyHash === env.sender);
        const title = senderContact?.localDisplayName || generateRandomUsername(env.sender);
        if (env.messageKind === "status") {
          showNotification(title, "Posted a new status", "status", { tone: "status" });
          return;
        }
        if (env.messageKind === "system") {
          const statusReaction = env.devPlaintext
            ? parseStatusReactionPayload(env.devPlaintext)
            : null;
          showNotification(
            title,
            statusReaction
              ? `Reacted ${statusReaction.emoji} to your status`
              : "Commented on your status",
            "status",
            { tone: "status" }
          );
          return;
        }
        const chatId = directChatId(identity.pubkeyHash, env.sender);
        if (chatId !== selectedChatId) {
          showNotification(title, "Sent a new message", chatId);
        }
      });
    });
    void loadStatuses();
    return () => { active = false; };
  }, [identity, incoming, loadStatuses, selectedChatId, sendDelivery, showNotification]);

  useEffect(() => {
    const newGroupEnvelopes = groupIncoming.filter(
      (envelope) =>
        envelope.recipients.includes(identity.pubkeyHash) &&
        !processedGroupIncoming.current.has(envelope.id)
    );

    if (newGroupEnvelopes.length === 0) {
      return;
    }

    let active = true;
    void persistIncomingGroupMessages(identity, newGroupEnvelopes).then(async () => {
      newGroupEnvelopes.forEach((envelope) => {
        processedGroupIncoming.current.add(envelope.id);
        sendDelivery({
          type: "delivery",
          id: envelope.id,
          recipient: envelope.sender,
          status: "delivered"
        });
      });
      const chatRecords = await nadaDb.chats.orderBy("updatedAt").reverse().toArray();
      const messageRecords = selectedChatId
        ? await loadMessagesForChat(selectedChatId)
        : [];

      if (!active) {
        return;
      }

      const groupRecords = chatRecords.filter((chat) => chat.type === "group");
      setChats(groupRecords);
      if (
        selectedGroupId &&
        !groupRecords.some((chat) => chat.id === selectedGroupId)
      ) {
        setSelectedGroupId(null);
        setMessages([]);
      }
      setMessages((current) =>
        selectedChatId
          ? mergeMessageRecords(
              messageRecords,
              current.filter((message) => message.chatId === selectedChatId)
            )
          : messageRecords
      );

      newGroupEnvelopes.forEach((env) => {
         if (env.groupId !== selectedChatId) {
             const group = chatRecords.find(c => c.id === env.groupId);
             const title = group?.title || "A group";
             showNotification(title, "New group message", env.groupId);
         }
      });
    });

    void loadStatuses();

    return () => { active = false; };
  }, [groupIncoming, identity, loadStatuses, selectedChatId, selectedGroupId, sendDelivery, showNotification]);

  /** Insert a system call-log message bubble into the current chat */
  const insertCallLogMessage = useCallback(async (callId: string, mode: CallMode, status: "started" | "ended" | "missed" | "declined", duration?: number): Promise<void> => {
    if (!selectedChatId) return;
    const recipientHash = selectedContact?.pubkeyHash ?? selectedGroup?.id ?? identity.pubkeyHash;
    const body = JSON.stringify({ callId, mode, status, duration });
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const record: MessageRecord = {
      id,
      chatId: selectedChatId,
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: recipientHash,
      direction: "outbound",
      kind: "call",
      body,
      encryptedPayload: body,
      status: "local",
      createdAt: timestamp
    };
    await nadaDb.messages.put(record);
    setMessages((current) => [...current, record]);

    // Broadcast call log to peer if it's a direct chat
    if (selectedContact) {
      sendEnvelope({
        type: "message",
        id,
        recipient: selectedContact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext: body,
        messageKind: "call"
      });
    }
  }, [selectedChatId, selectedContact, selectedGroup, identity.pubkeyHash, sendEnvelope]);

  const clearCallRingTimeout = useCallback((): void => {
    if (callRingTimeoutRef.current) {
      window.clearTimeout(callRingTimeoutRef.current);
      callRingTimeoutRef.current = null;
    }
  }, []);

  const scheduleCallRingTimeout = useCallback(({
    callId,
    mode,
    peerName,
    peerPubkeyHash,
    rejectOnTimeout
  }: {
    callId: string;
    mode: CallMode;
    peerName: string;
    peerPubkeyHash: string;
    rejectOnTimeout: boolean;
  }): void => {
    clearCallRingTimeout();
    callRingTimeoutRef.current = window.setTimeout(() => {
      const call = useCallStore.getState().call;
      if (!call || call.callId !== callId) return;
      if (call.phase !== "incoming-ringing" && call.phase !== "outgoing-ringing") return;

      if (rejectOnTimeout) {
        sendCallSignal({
          type: "call-signal",
          id: crypto.randomUUID(),
          callId,
          recipient: peerPubkeyHash,
          sender: identity.pubkeyHash,
          timestamp: Date.now(),
          mode,
          signalType: "reject",
          payload: "timeout"
        });
      }

      stopRingtone();
      callStore.endCall();
      void nadaDb.calls.update(callId, {
        endedAt: Date.now(),
        status: "ended"
      });
      void insertCallLogMessage(callId, mode, "missed");
      showNotification(
        peerName,
        rejectOnTimeout ? "Missed encrypted call" : "No answer",
        directChatId(identity.pubkeyHash, peerPubkeyHash),
        { critical: true }
      );
    }, CALL_RING_TIMEOUT_MS);
  }, [
    callStore,
    clearCallRingTimeout,
    identity.pubkeyHash,
    insertCallLogMessage,
    sendCallSignal,
    showNotification,
    stopRingtone
  ]);

  useEffect(() => {
    return () => {
      clearCallRingTimeout();
      stopRingtone();
    };
  }, [clearCallRingTimeout, stopRingtone]);

  useEffect(() => {
    const latestSignal = callSignals.find(
      (signal) =>
        signal.recipient === identity.pubkeyHash &&
        !processedCallSignals.current.has(signal.id)
    );

    if (!latestSignal) return;
    processedCallSignals.current.add(latestSignal.id);

    try {
      switch (latestSignal.signalType) {
        case "offer": {
          // Incoming call - validate the SDP before opening the ringing UI.
          JSON.parse(latestSignal.payload) as RTCSessionDescriptionInit;
          const contact = contacts.find(c => c.pubkeyHash === latestSignal.sender);
          const callerName = contact?.localDisplayName ?? generateRandomUsername(latestSignal.sender);
          const callChatId = directChatId(identity.pubkeyHash, latestSignal.sender);
          const existingCall = useCallStore.getState().call;
          if (
            existingCall &&
            existingCall.phase !== "idle" &&
            existingCall.phase !== "ended" &&
            existingCall.phase !== "failed"
          ) {
            sendCallSignal({
              type: "call-signal",
              id: crypto.randomUUID(),
              callId: latestSignal.callId,
              recipient: latestSignal.sender,
              sender: identity.pubkeyHash,
              timestamp: Date.now(),
              mode: latestSignal.mode,
              signalType: "reject",
              payload: "busy"
            });
            break;
          }
          callStore.receiveIncomingOffer({
            callId: latestSignal.callId,
            mode: latestSignal.mode,
            peerPubkeyHash: latestSignal.sender,
            peerName: callerName,
            offerSdp: latestSignal.payload
          });
          startRingtone(callChatId);
          showNotification(
            callerName,
            `Incoming ${latestSignal.mode === "video" ? "video" : "voice"} call`,
            callChatId,
            { critical: true, requireInteraction: true, tone: "call" }
          );
          void nadaDb.calls.put({
            id: latestSignal.callId,
            chatId: callChatId,
            peerPubkeyHash: latestSignal.sender,
            mode: latestSignal.mode,
            status: "ringing",
            startedAt: Date.now()
          });
          scheduleCallRingTimeout({
            callId: latestSignal.callId,
            mode: latestSignal.mode,
            peerName: callerName,
            peerPubkeyHash: latestSignal.sender,
            rejectOnTimeout: true
          });
          // Log incoming call attempt
          void insertCallLogMessage(latestSignal.callId, latestSignal.mode, "started");
          break;
        }
        case "answer": {
          clearCallRingTimeout();
          stopRingtone();
          // Caller receives the answer - set remote description on our PC
          const pc = callStore.call?.localSession?.peerConnection;
          if (!pc) break;
          const answerSdp = JSON.parse(latestSignal.payload) as RTCSessionDescriptionInit;
          pc.setRemoteDescription(new RTCSessionDescription(answerSdp))
            .then(() => {
              // Flush any ICE candidates that arrived before the answer
              const pending = callStore.call?.pendingIceCandidates ?? [];
              pending.forEach(c => void pc.addIceCandidate(new RTCIceCandidate(c)));
              callStore.clearPendingIce();
              callStore.setPhase("active");
              callStore.setStartedAt(Date.now());
            })
            .catch(() => callStore.failCall("Failed to set remote description."));
          break;
        }
        case "ice": {
          const pc = callStore.call?.localSession?.peerConnection;
          const candidate = JSON.parse(latestSignal.payload) as RTCIceCandidateInit;
          if (pc && pc.remoteDescription) {
            void pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            // Queue it until remote description is ready
            callStore.addPendingIce(candidate);
          }
          break;
        }
        case "reject":
          clearCallRingTimeout();
          stopRingtone();
          callStore.endCall();
          showNotification(
            "Call ended",
            latestSignal.payload === "busy" ? "The contact is already on a call." : "Call declined.",
            directChatId(identity.pubkeyHash, latestSignal.sender),
            { critical: true, tone: "end" }
          );
          void insertCallLogMessage(latestSignal.callId, latestSignal.mode, "declined");
          break;
        case "hangup":
          clearCallRingTimeout();
          stopRingtone();
          callStore.endCall();
          break;
      }
    } catch {
      callStore.failCall("The incoming call signal was invalid.");
    }
  }, [
    callSignals,
    identity.pubkeyHash,
    contacts,
    callStore,
    clearCallRingTimeout,
    insertCallLogMessage,
    scheduleCallRingTimeout,
    sendCallSignal,
    showNotification,
    startRingtone,
    stopRingtone
  ]);

  // ── Offline Message Queue Flush ──────────────────────────────────────────────
  useEffect(() => {
    if (relayStatus !== "connected" || !identity) return;

    let isSubscribed = true;

    async function flushQueue() {
      // Find all direct messages that are queued
      const queuedMessages = await nadaDb.messages
        .where("status")
        .equals("queued")
        .toArray();
      const sendableQueuedMessages = queuedMessages.filter(
        (message) => message.encryptedPayload !== PENDING_ENCRYPTED_PAYLOAD
      );

      if (!isSubscribed) return;

      for (const msg of sendableQueuedMessages) {
        if (!isSubscribed || relayStatus !== "connected") break;

        const envelope: MessageEnvelope = {
          type: "message",
          id: msg.id,
          recipient: msg.recipientPubkeyHash,
          sender: msg.senderPubkeyHash,
          timestamp: msg.createdAt,
          ciphertext: msg.encryptedPayload,
          messageKind: msg.kind,
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: msg.body } : {})
        };

        const sent = sendEnvelope(envelope);
        if (sent) {
          await nadaDb.messages.update(msg.id, { status: "sent" });
          setMessages((current) =>
            current.map((m) =>
              m.id === msg.id ? { ...m, status: "sent" } : m
            )
          );
        }
      }

      // Flush "local" group messages that failed to send over network previously
      const localMessages = await nadaDb.messages
        .where("status")
        .equals("local")
        .toArray();
      
      const outboundGroupMessages = localMessages.filter(
        (message) =>
          message.direction === "outbound" &&
          message.encryptedPayload !== PENDING_ENCRYPTED_PAYLOAD
      );
      
      for (const msg of outboundGroupMessages) {
        if (!isSubscribed || relayStatus !== "connected") break;
        
        const group = chats.find(c => c.id === msg.chatId && c.type === "group");
        if (!group) continue;
        
        const recipients = group.memberPubkeyHashes.filter(m => m !== identity.pubkeyHash);
        
        const groupEnvelope: GroupMessageEnvelope = {
          type: "group-message",
          id: msg.id,
          groupId: group.id,
          recipients,
          sender: msg.senderPubkeyHash,
          timestamp: msg.createdAt,
          ciphertext: msg.encryptedPayload,
          messageKind: msg.kind,
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          ...(msg.replyToId ? { replyToId: msg.replyToId } : {}),
          ...(msg.mentions && msg.mentions.length > 0 ? { mentions: msg.mentions } : {}),
          ...(msg.expiresAt ? { expiresAt: msg.expiresAt } : {}),
          ...(group.groupSenderKey ? { senderKeyPackage: group.groupSenderKey } : {}),
          ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: msg.body } : {})
        };
        
        const sent = sendGroupEnvelope(groupEnvelope);
        if (sent) {
          await nadaDb.messages.update(msg.id, { status: "sent" });
          setMessages((current) =>
            current.map((m) =>
              m.id === msg.id ? { ...m, status: "sent" } : m
            )
          );
        }
      }
    }

    void flushQueue();

    return () => {
      isSubscribed = false;
    };
  }, [relayStatus, identity, chats, sendEnvelope, sendGroupEnvelope]);

  const retryOutboundMessage = async (message: MessageRecord): Promise<void> => {
    if (message.direction !== "outbound") return;

    const group = chats.find((chat) => chat.id === message.chatId && chat.type === "group");
    const contact = contacts.find(
      (item) => directChatId(identity.pubkeyHash, item.pubkeyHash) === message.chatId
    );
    if (!group && !contact) {
      showToast("Could not find the recipient for this message.");
      return;
    }

    const retryStatus: MessageRecord["status"] = group ? "local" : "queued";
    await nadaDb.messages.update(message.id, { status: retryStatus });
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, status: retryStatus } : item
      )
    );

    let ciphertext = message.encryptedPayload;
    if (!ciphertext || ciphertext === PENDING_ENCRYPTED_PAYLOAD) {
      try {
        ciphertext = group?.groupSenderKey
          ? JSON.stringify(await encryptGroupMessage(message.body, group.groupSenderKey))
          : await mockEncryptMessage(message.body);
        await nadaDb.messages.update(message.id, { encryptedPayload: ciphertext });
      } catch {
        await nadaDb.messages.update(message.id, { status: "failed" });
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id ? { ...item, status: "failed" } : item
          )
        );
        showToast("Retry failed while preparing the message.");
        return;
      }
    }

    const messageKind = messageKindFromRecord(message);
    let sent = false;
    if (group) {
      const recipients = group.memberPubkeyHashes.filter(
        (member) => member !== identity.pubkeyHash
      );
      sent = sendGroupEnvelope({
        type: "group-message",
        id: message.id,
        groupId: group.id,
        recipients,
        sender: identity.pubkeyHash,
        timestamp: message.createdAt,
        ciphertext,
        messageKind,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        ...(message.replyToId ? { replyToId: message.replyToId } : {}),
        ...(message.mentions?.length ? { mentions: message.mentions } : {}),
        ...(message.expiresAt ? { expiresAt: message.expiresAt } : {}),
        ...(group.groupSenderKey ? { senderKeyPackage: group.groupSenderKey } : {}),
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: message.body } : {})
      });
    } else if (contact) {
      sent = sendEnvelope({
        type: "message",
        id: message.id,
        recipient: contact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp: message.createdAt,
        ciphertext,
        messageKind,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: message.body } : {})
      });
    }

    const nextStatus: MessageRecord["status"] = sent ? "sent" : retryStatus;
    await nadaDb.messages.update(message.id, {
      encryptedPayload: ciphertext,
      status: nextStatus
    });
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? { ...item, encryptedPayload: ciphertext, status: nextStatus }
          : item
      )
    );
    showToast(sent ? "Message resent." : "Message queued for retry.");
  };

  // Helper exposed for ChatPanel's onTyping prop
  const handleTypingStop = useCallback(() => {
    if (!selectedContact || !selectedChatId) return;
    sendTyping({
      type: "typing",
      chatId: selectedChatId,
      sender: identity.pubkeyHash,
      recipient: selectedContact.pubkeyHash,
      isTyping: false
    });
  }, [selectedContact, selectedChatId, identity.pubkeyHash, sendTyping]);

  const sendMessage = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || !selectedChatId) {
      return;
    }

    // Always stop typing indicator when sending
    handleTypingStop();

    if (editingMessageId) {
      const editedAt = Date.now();
      const existingMessage = messages.find((message) => message.id === editingMessageId);
      const editedPayload = buildTextPayload({
        text: trimmed,
        ...(existingMessage?.replyTo ? { replyTo: existingMessage.replyTo } : {})
      });
      const editedBody = encodeMessagePayload(editedPayload);
      const encryptedPayload = selectedGroup?.groupSenderKey
        ? JSON.stringify(await encryptGroupMessage(editedBody, selectedGroup.groupSenderKey))
        : await mockEncryptMessage(editedBody);
      await nadaDb.messages.update(editingMessageId, {
        body: editedBody,
        editedAt,
        encryptedPayload
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === editingMessageId
            ? { ...message, body: editedBody, kind: "text", editedAt, encryptedPayload }
            : message
        )
      );
      setEditingMessageId(null);
      return;
    }

    if (!selectedGroup && !selectedContact) {
      return;
    }

    const activeGroup = selectedGroup;
    const activeContact = selectedContact;
    if (!activeGroup && !activeContact) {
      return;
    }

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const expiresAt =
      disappearingTimer > 0 ? timestamp + disappearingTimer : undefined;
    const mentions = extractMentions(trimmed, contacts);
    const payload = buildTextPayload({
      text: trimmed,
      ...(replySnapshot ? { replyTo: replySnapshot } : {})
    });
    const body = encodeMessagePayload(payload);
    const optimisticRecord: MessageRecord = {
      id,
      chatId: selectedChatId,
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash:
        activeGroup?.id ?? activeContact?.pubkeyHash ?? identity.pubkeyHash,
      direction: "outbound",
      kind: "text",
      body,
      encryptedPayload: PENDING_ENCRYPTED_PAYLOAD,
      status: "local",
      createdAt: timestamp,
      ...(expiresAt ? { expiresAt } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(replySnapshot ? { replyTo: replySnapshot } : {})
    };

    setMessages((current) => mergeMessageRecords(current, [optimisticRecord]));
    setReplyToId(null);
    if ("vibrate" in navigator) {
      navigator.vibrate(8);
    }

    if (activeGroup) {
      setChats((current) =>
        current.map((chat) =>
          chat.id === activeGroup.id ? { ...chat, updatedAt: timestamp } : chat
        )
      );
    }

    try {
      await nadaDb.messages.put(optimisticRecord);
    } catch {
      // The bubble is already on screen; the final save below gets another chance.
    }

    let ciphertext: string;
    try {
      ciphertext = activeGroup?.groupSenderKey
        ? JSON.stringify(
            await encryptGroupMessage(body, activeGroup.groupSenderKey)
          )
        : await mockEncryptMessage(body);
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticRecord.id
            ? { ...message, status: "failed" }
            : message
        )
      );
      showToast("Message is visible, but encryption failed.");
      return;
    }
    const statusFallback = activeGroup ? "local" : "queued";
    let sent = false;

    if (activeGroup) {
      const recipients = activeGroup.memberPubkeyHashes.filter(
        (member) => member !== identity.pubkeyHash
      );
      const baseEnvelope = {
        type: "group-message" as const,
        id,
        groupId: activeGroup.id,
        recipients,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "text" as const,
        ...(activeGroup.groupSenderKey ? { senderKeyPackage: activeGroup.groupSenderKey } : {}),
        ...(replyToId ? { replyToId } : {}),
        ...(replySnapshot ? { replyTo: replySnapshot } : {}),
        ...(mentions.length > 0 ? { mentions } : {}),
        ...(expiresAt ? { expiresAt } : {})
      };
      const groupEnvelope: GroupMessageEnvelope = NADA_DEV_PLAINTEXT_ENABLED
        ? {
            ...baseEnvelope,
            // ⚠️ MVP_ONLY — replace before production
            devPlaintext: body
          }
        : baseEnvelope;
      sent = sendGroupEnvelope(groupEnvelope);
    } else if (activeContact) {
      const baseEnvelope = {
        type: "message" as const,
        id,
        recipient: activeContact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "text" as const,
        ...(replySnapshot ? { replyTo: replySnapshot } : {})
      };
      const envelope: MessageEnvelope = NADA_DEV_PLAINTEXT_ENABLED
        ? {
            ...baseEnvelope,
            // ⚠️ MVP_ONLY — replace before production
            devPlaintext: body
          }
        : baseEnvelope;
      sent = sendEnvelope(envelope);
    }

    const recipientHash =
      activeGroup?.id ?? activeContact?.pubkeyHash ?? identity.pubkeyHash;
    const record: MessageRecord = {
      id,
      chatId: selectedChatId,
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: recipientHash,
      direction: "outbound",
      kind: "text",
      body,
      encryptedPayload: ciphertext,
      status: sent ? "sent" : statusFallback,
      createdAt: timestamp,
      ...(expiresAt ? { expiresAt } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(replySnapshot ? { replyTo: replySnapshot } : {})
    };

    setMessages((current) =>
      current.map((message) => (message.id === record.id ? record : message))
    );

    try {
      await nadaDb.messages.put(record);
      if (activeGroup) {
        await nadaDb.chats.update(activeGroup.id, { updatedAt: timestamp });
      }
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === record.id ? { ...message, status: "local" } : message
        )
      );
      showToast("Message saved on screen, but local storage failed.");
    }
  };

  const sendPollMessage = async (poll: PollData): Promise<void> => {
    if (!selectedChatId || (!selectedGroup && !selectedContact)) return;
    handleTypingStop();

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const payload = {
      version: 1 as const,
      type: "poll" as const,
      poll: poll
    };
    const body = encodeMessagePayload(payload);
    const ciphertext = selectedGroup?.groupSenderKey
      ? JSON.stringify(await encryptGroupMessage(body, selectedGroup.groupSenderKey))
      : await mockEncryptMessage(body);
    const statusFallback = selectedGroup ? "local" : "queued";
    let sent = false;

    if (selectedGroup) {
      const recipients = selectedGroup.memberPubkeyHashes.filter(m => m !== identity.pubkeyHash);
      const baseEnvelope = {
        type: "group-message" as const,
        id, groupId: selectedGroup.id, recipients, sender: identity.pubkeyHash,
        timestamp, ciphertext, messageKind: "poll" as const,
        ...(selectedGroup.groupSenderKey ? { senderKeyPackage: selectedGroup.groupSenderKey } : {})
      };
      const groupEnvelope: GroupMessageEnvelope = NADA_DEV_PLAINTEXT_ENABLED ? { ...baseEnvelope, devPlaintext: body } : baseEnvelope;
      sent = sendGroupEnvelope(groupEnvelope);
    } else if (selectedContact) {
      const baseEnvelope = {
        type: "message" as const, id, recipient: selectedContact.pubkeyHash, sender: identity.pubkeyHash,
        timestamp, ciphertext, messageKind: "poll" as const
      };
      const envelope: MessageEnvelope = NADA_DEV_PLAINTEXT_ENABLED ? { ...baseEnvelope, devPlaintext: body } : baseEnvelope;
      sent = sendEnvelope(envelope);
    }

    const recipientHash = selectedGroup?.id ?? selectedContact?.pubkeyHash ?? identity.pubkeyHash;
    const record: MessageRecord = {
      id, chatId: selectedChatId, senderPubkeyHash: identity.pubkeyHash, recipientPubkeyHash: recipientHash,
      direction: "outbound", kind: "poll", body, encryptedPayload: ciphertext,
      status: sent ? "sent" : statusFallback, createdAt: timestamp
    };

    await nadaDb.messages.put(record);
    if (selectedGroup) {
      await nadaDb.chats.update(selectedGroup.id, { updatedAt: timestamp });
      setChats(current => current.map(chat => chat.id === selectedGroup.id ? { ...chat, updatedAt: timestamp } : chat));
    }
    setMessages(current => [...current, record]);
  };

  const handlePostStatus = async (text: string, media?: MediaAttachment) => {
    if (!identity) return;
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const trimmedText = text.trim();
    const payload = media 
      ? buildMediaPayload({ media, type: "status", ...(trimmedText ? { text: trimmedText } : {}) })
      : buildTextPayload({ text });
    
    const body = encodeMessagePayload({ ...payload, type: "status" as const });
    const ciphertext = await mockEncryptMessage(body);
    
    const record: MessageRecord = {
      id,
      chatId: "status",
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: "broadcast",
      direction: "outbound",
      kind: "status",
      body,
      encryptedPayload: ciphertext,
      status: "sent",
      createdAt: timestamp
    };
    
    await nadaDb.messages.put(record);
    setAllStatuses(prev => [record, ...prev]);

    const relayBaseUrl = getRelayHttpBaseUrl();
    if (relayBaseUrl) {
      // The relay's status publish endpoint now requires an identity proof
      // bound to the status id, so anonymous callers can't impersonate a
      // sender. Sign and forward; suppress the publish on signing failure
      // rather than sending an unauthenticated request the relay will 401.
      void useIdentityStore
        .getState()
        .signProof("status-publish", id)
        .then((proof) => {
          if (!proof) return;
          return fetch(new URL("/api/v1/statuses", relayBaseUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              sender: identity.pubkeyHash,
              timestamp,
              ciphertext,
              ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: body } : {}),
              proof
            })
          });
        })
        .catch(() => {});
    }
    
    statusPeerHashes.forEach((recipientHash) => {
      sendEnvelope({
        type: "message",
        id,
        recipient: recipientHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "status",
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: body } : {})
      });
    });
    
    showToast("Status posted!");
  };

  const sendStatusComment = async (
    status: MessageRecord,
    text: string
  ): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const payload: StatusCommentPayload = {
      kind: "status-comment",
      statusId: status.id,
      statusOwnerPubkeyHash: status.senderPubkeyHash,
      text: trimmed,
      version: 1
    };
    const body = JSON.stringify(payload);
    const ciphertext = await mockEncryptMessage(body);
    const record: MessageRecord = {
      id,
      chatId: statusCommentChatId(status.id),
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: status.senderPubkeyHash,
      direction: "outbound",
      kind: "system",
      body,
      encryptedPayload: ciphertext,
      status: "sent",
      createdAt: timestamp
    };

    await nadaDb.messages.put(record);
    if (status.senderPubkeyHash !== identity.pubkeyHash) {
      sendEnvelope({
        type: "message",
        id,
        recipient: status.senderPubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "system",
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: body } : {})
      });
    }
    showToast("Comment added.");
  };

  const sendStatusReaction = async (
    status: MessageRecord,
    emoji: string
  ): Promise<MessageRecord | null> => {
    const trimmedEmoji = emoji.trim();
    if (!trimmedEmoji) return null;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const payload: StatusReactionPayload = {
      emoji: trimmedEmoji,
      kind: "status-reaction",
      statusId: status.id,
      statusOwnerPubkeyHash: status.senderPubkeyHash,
      version: 1
    };
    const body = JSON.stringify(payload);
    const ciphertext = await mockEncryptMessage(body);
    const record: MessageRecord = {
      id,
      chatId: statusCommentChatId(status.id),
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: status.senderPubkeyHash,
      direction: "outbound",
      kind: "system",
      body,
      encryptedPayload: ciphertext,
      status: "sent",
      createdAt: timestamp
    };

    await nadaDb.messages.put(record);
    if (status.senderPubkeyHash !== identity.pubkeyHash) {
      sendEnvelope({
        type: "message",
        id,
        recipient: status.senderPubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "system",
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: body } : {})
      });
    }
    return record;
  };

  const deleteStatus = async (status: MessageRecord): Promise<void> => {
    if (status.senderPubkeyHash !== identity.pubkeyHash) {
      showToast("Only your own status can be deleted.");
      return;
    }

    const payload: StatusDeletePayload = {
      kind: "status-delete",
      statusId: status.id,
      statusOwnerPubkeyHash: identity.pubkeyHash,
      version: 1
    };
    const body = JSON.stringify(payload);
    const ciphertext = await mockEncryptMessage(body);
    const timestamp = Date.now();

    await nadaDb.messages.delete(status.id);
    await nadaDb.messages.where("chatId").equals(statusCommentChatId(status.id)).delete();
    const remainingOwnStatuses = allStatuses.filter(
      (record) =>
        record.id !== status.id &&
        record.senderPubkeyHash === identity.pubkeyHash
    );
    setAllStatuses((current) => current.filter((record) => record.id !== status.id));
    if (remainingOwnStatuses.length === 0) {
      setSelectedStatusSenderHash((hash) =>
        hash === identity.pubkeyHash ? null : hash
      );
    }

    const relayBaseUrl = getRelayHttpBaseUrl();
    if (relayBaseUrl) {
      // Sign the delete with the same identity that owns the status.
      void useIdentityStore
        .getState()
        .signProof("status-delete", status.id)
        .then((proof) => {
          if (!proof) return;
          return fetch(new URL("/api/v1/statuses/delete", relayBaseUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: status.id,
              sender: identity.pubkeyHash,
              proof
            })
          });
        })
        .catch(() => {});
    }

    statusPeerHashes.forEach((recipientHash) => {
      sendEnvelope({
        type: "message",
        id: crypto.randomUUID(),
        recipient: recipientHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "system",
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: body } : {})
      });
    });
    showToast("Status deleted.");
  };

  const createCommunity = async (draft: CommunityDraft): Promise<void> => {
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (!title || !description) {
      showToast("Community name and description are required.");
      return;
    }

    const now = Date.now();
    const record: CommunityRecord = {
      admins: [identity.pubkeyHash],
      category: draft.category,
      channels: defaultCommunityChannels(draft.category),
      createdAt: now,
      description,
      id: crypto.randomUUID(),
      joined: true,
      memberCount: 1,
      moderators: [],
      posts: [],
      privacy: draft.privacy,
      title,
      topics: defaultCommunityTopics(draft.category),
      updatedAt: now
    };
    const next = [record, ...communities].sort((a, b) => b.updatedAt - a.updatedAt);
    setCommunities(next);
    await setGlobalSetting(COMMUNITIES_SETTING_KEY, JSON.stringify(next));
    showToast("Community created.");
  };

  const saveCommunities = useCallback(async (next: CommunityRecord[]) => {
    const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
    setCommunities(sorted);
    await setGlobalSetting(COMMUNITIES_SETTING_KEY, JSON.stringify(sorted));
  }, []);

  const updateCommunity = useCallback((
    communityId: string,
    updater: (community: CommunityRecord) => CommunityRecord
  ): void => {
    const next = communities.map((community) =>
      community.id === communityId ? updater(community) : community
    );
    void saveCommunities(next);
  }, [communities, saveCommunities]);

  const submitSafetyReport = useCallback(async ({
    category,
    notes,
    target
  }: {
    category: SafetyReport["category"];
    notes: string;
    target: ReportTarget;
  }): Promise<void> => {
    const report: SafetyReport = {
      category,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      notes: notes.trim(),
      targetId: target.id,
      targetType: target.type,
      title: target.title
    };
    const next = [report, ...safetyReports];
    setSafetyReports(next);
    await setGlobalSetting(REPORTS_SETTING_KEY, JSON.stringify(next));
    setPendingReportTarget(null);
    showNotification("Report saved", `${target.title} was added to your safety log.`, "safety");
  }, [safetyReports, showNotification]);

  const attachFile = async (file: File): Promise<boolean> => {
    if (!selectedChatId || (!selectedContact && !selectedGroup)) return false;

    const validationError = validateMediaFile(file);
    if (validationError) {
      showToast(validationError);
      return false;
    }

    setUploadStatus(`Preparing ${file.name}...`);
    const prepared = await prepareMediaFile(file);
    setUploadStatus(`Encrypting ${file.name}...`);
    const recipientHash =
      selectedGroup?.id ?? selectedContact?.pubkeyHash ?? identity.pubkeyHash;
    const media = await uploadEncryptedMedia({
      chatId: selectedChatId,
      file: prepared.file,
      recipientPubkeyHash: recipientHash,
      senderPubkeyHash: identity.pubkeyHash
    });

    if (!media) {
      setUploadStatus(null);
      showToast("Media upload failed. Check the relay and try again.");
      return false;
    }

    const mediaWithPreview: MediaAttachment = {
      ...media,
      mimeType: prepared.file.type || media.mimeType,
      originalName: prepared.originalFile.name,
      fileName: prepared.originalFile.name,
      size: prepared.originalFile.size,
      ...(prepared.width ? { width: prepared.width } : {}),
      ...(prepared.height ? { height: prepared.height } : {}),
      ...(prepared.duration ? { duration: prepared.duration } : {}),
      ...(prepared.thumbnailDataUrl
        ? { thumbnailDataUrl: prepared.thumbnailDataUrl }
        : {})
    };
    const messageKind = prepared.kind;
    const payload = buildMediaPayload({
      media: mediaWithPreview,
      type: messageKind,
      ...(replySnapshot ? { replyTo: replySnapshot } : {})
    });
    const body = encodeMessagePayload(payload);
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const expiresAt = disappearingTimer > 0 ? timestamp + disappearingTimer : undefined;

    const ciphertext = selectedGroup?.groupSenderKey
      ? JSON.stringify(await encryptGroupMessage(body, selectedGroup.groupSenderKey))
      : await mockEncryptMessage(body);

    let sent = false;
    if (selectedGroup) {
      const recipients = selectedGroup.memberPubkeyHashes.filter((m) => m !== identity.pubkeyHash);
      sent = sendGroupEnvelope({
        type: "group-message",
        id,
        groupId: selectedGroup.id,
        recipients,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind,
        ...(selectedGroup.groupSenderKey ? { senderKeyPackage: selectedGroup.groupSenderKey } : {}),
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: body } : {}),
        ...(replyToId ? { replyToId } : {}),
        ...(replySnapshot ? { replyTo: replySnapshot } : {}),
        ...(expiresAt ? { expiresAt } : {})
      });
    } else if (selectedContact) {
      sent = sendEnvelope({
        type: "message",
        id,
        recipient: selectedContact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind,
        ...(replySnapshot ? { replyTo: replySnapshot } : {}),
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: body } : {})
      });
    }

    const record: MessageRecord = {
      id,
      chatId: selectedChatId,
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: recipientHash,
      direction: "outbound",
      kind: messageKind,
      body,
      encryptedPayload: ciphertext,
      status: sent ? "sent" : "queued",
      createdAt: timestamp,
      ...(expiresAt ? { expiresAt } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(replySnapshot ? { replyTo: replySnapshot } : {})
    };

    await nadaDb.messages.put(record);
    if (selectedGroup) {
      await nadaDb.chats.update(selectedGroup.id, { updatedAt: timestamp });
      setChats((current) =>
        current.map((chat) =>
          chat.id === selectedGroup.id ? { ...chat, updatedAt: timestamp } : chat
        )
      );
    }
    setMessages((current) => [...current, record]);
    setReplyToId(null);
    setUploadStatus(null);
    showToast(`${previewForMessage(record)} sent.`);
    return true;
  };

  const createGroup = async (
    title: string,
    memberPubkeyHashes: string[]
  ): Promise<void> => {
    const now = Date.now();
    const groupId = crypto.randomUUID();
    const groupSenderKey = await createGroupSenderKey();
    const chat: ChatRecord = {
      id: groupId,
      type: "group",
      title,
      memberPubkeyHashes: Array.from(
        new Set([identity.pubkeyHash, ...memberPubkeyHashes])
      ),
      ownerPubkeyHash: identity.pubkeyHash,
      // ⚠️ MVP_ONLY — replace before production
      groupSenderKey,
      createdAt: now,
      updatedAt: now,
      disappearingTimer
    };

    await nadaDb.chats.put(chat);
    await nadaDb.groupKeys.put({
      groupId,
      senderKey: groupSenderKey,
      createdByPubkeyHash: identity.pubkeyHash,
      createdAt: now
    });
    setChats((current) => [chat, ...current]);
    setSelectedContactHash(null);
    setSelectedGroupId(chat.id);
    setPanel(null);
  };

  const sendVoiceNote = async (body: string): Promise<void> => {
    // body format: "data:audio/webm;base64,...|<durationSeconds>"
    if (!selectedChatId) return;
    if (!body.startsWith("data:audio")) return;

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const expiresAt = disappearingTimer > 0 ? timestamp + disappearingTimer : undefined;
    const parsedVoice = parseVoiceNoteBody(body);
    const mimeType =
      parsedVoice.src.match(/^data:([^;]+);/)?.[1] ?? "audio/webm";
    const media: MediaAttachment = {
      url: parsedVoice.src,
      fileName: `voice-note-${timestamp}.webm`,
      originalName: `voice-note-${timestamp}.webm`,
      mimeType,
      size: dataUrlSize(parsedVoice.src),
      duration: parsedVoice.durationSeconds
    };
    const payload = buildMediaPayload({
      media,
      type: "voice_note",
      ...(replySnapshot ? { replyTo: replySnapshot } : {})
    });
    const structuredBody = encodeMessagePayload(payload);

    // Encrypt the body the same way a text message is encrypted
    const ciphertext = selectedGroup?.groupSenderKey
      ? JSON.stringify(await encryptGroupMessage(structuredBody, selectedGroup.groupSenderKey))
      : await mockEncryptMessage(structuredBody);

    let sent = false;
    if (selectedGroup) {
      const recipients = selectedGroup.memberPubkeyHashes.filter(
        (member) => member !== identity.pubkeyHash
      );
      sent = sendGroupEnvelope({
        type: "group-message",
        id,
        groupId: selectedGroup.id,
        recipients,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "voice_note",
        ...(selectedGroup.groupSenderKey ? { senderKeyPackage: selectedGroup.groupSenderKey } : {}),
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: structuredBody } : {}),
        ...(replyToId ? { replyToId } : {}),
        ...(replySnapshot ? { replyTo: replySnapshot } : {}),
        ...(expiresAt ? { expiresAt } : {})
      });
    } else if (selectedContact) {
      sent = sendEnvelope({
        type: "message",
        id,
        recipient: selectedContact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "voice_note",
        ...(replySnapshot ? { replyTo: replySnapshot } : {}),
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: structuredBody } : {})
      });
    }

    if (!selectedGroup && !selectedContact) return;

    const recipientHash = selectedGroup?.id ?? selectedContact?.pubkeyHash ?? identity.pubkeyHash;
    const record: MessageRecord = {
      id,
      chatId: selectedChatId,
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: recipientHash,
      direction: "outbound",
      kind: "voice_note",
      body: structuredBody,
      encryptedPayload: ciphertext,
      status: sent ? "sent" : "queued",
      createdAt: timestamp,
      ...(expiresAt ? { expiresAt } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(replySnapshot ? { replyTo: replySnapshot } : {})
    };

    await nadaDb.messages.put(record);
    if (selectedGroup) {
      await nadaDb.chats.update(selectedGroup.id, { updatedAt: timestamp });
      setChats((current) =>
        current.map((chat) =>
          chat.id === selectedGroup.id ? { ...chat, updatedAt: timestamp } : chat
        )
      );
    }
    setMessages((current) => [...current, record]);
    setReplyToId(null);
  };

  /** Insert a system call-log message bubble into the current chat */

  const startCall = async (mode: CallMode): Promise<void> => {
    if (mode === "group") {
      if (!selectedGroup) return;
      callStore.setOutgoingCall({
        callId: selectedGroup.id,
        mode: "group",
        peerPubkeyHash: selectedGroup.id,
        peerName: selectedGroup.title,
        localSession: null as unknown as LocalCallSession
      });
      showNotification(selectedGroup.title, "Starting group call", selectedGroup.id);
      void insertCallLogMessage(selectedGroup.id, mode, "started");
      return;
    }

    if (!selectedContact) return;

    const callId = crypto.randomUUID();
    try {
      clearCallRingTimeout();
      const session = await createLocalCallSession(mode, callId);

      // Wire ICE candidate forwarding before creating offer
      session.peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
          sendCallSignal({
            type: "call-signal",
            id: crypto.randomUUID(),
            callId,
            recipient: selectedContact.pubkeyHash,
            sender: identity.pubkeyHash,
            timestamp: Date.now(),
            mode,
            signalType: "ice",
            payload: JSON.stringify(e.candidate.toJSON())
          });
        }
      };

      // Wire remote track receiver — called when callee's audio/video arrives
      session.peerConnection.ontrack = (e) => {
        const stream = e.streams[0];
        if (stream) {
          stream.getTracks().forEach((track) => {
            // Only add if not already present
            if (!session.remoteStream.getTracks().find((t) => t.id === track.id)) {
              session.remoteStream.addTrack(track);
            }
          });
        } else {
          // Fallback: track-only event (no stream)
          if (!session.remoteStream.getTracks().find((t) => t.id === e.track.id)) {
            session.remoteStream.addTrack(e.track);
          }
        }
        // Move to active — this is what makes the timer start and avatar disappear
        callStore.setPhase("active");
        if (!callStore.call?.startedAt) callStore.setStartedAt(Date.now());
      };

      // Create offer
      const offer = await session.peerConnection.createOffer();
      await session.peerConnection.setLocalDescription(offer);

      callStore.setOutgoingCall({
        callId,
        mode,
        peerPubkeyHash: selectedContact.pubkeyHash,
        peerName: selectedContact.localDisplayName,
        localSession: session
      });
      showNotification(
        selectedContact.localDisplayName,
        `Starting ${mode === "video" ? "video" : "voice"} call`,
        selectedChatId,
        { critical: true, tone: "call" }
      );
      startRingtone(selectedChatId);

      await nadaDb.calls.put({
        id: callId,
        chatId: selectedChatId,
        peerPubkeyHash: selectedContact.pubkeyHash,
        mode,
        status: "connecting",
        startedAt: Date.now()
      });

      void insertCallLogMessage(callId, mode, "started");

      sendCallSignal({
        type: "call-signal",
        id: crypto.randomUUID(),
        callId,
        recipient: selectedContact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp: Date.now(),
        mode,
        signalType: "offer",
        payload: JSON.stringify(offer)
      });
      scheduleCallRingTimeout({
        callId,
        mode,
        peerName: selectedContact.localDisplayName,
        peerPubkeyHash: selectedContact.pubkeyHash,
        rejectOnTimeout: false
      });
    } catch {
      callStore.failCall("Could not start media capture.");
    }
  };

  const endCall = (): void => {
    const callId = activeCall?.callId;
    const peerPubkeyHash = activeCall?.peerPubkeyHash;
    const mode = activeCall?.mode;
    const startedAt = activeCall?.startedAt;

    clearCallRingTimeout();
    stopRingtone();
    callStore.endCall();

    if (callId && mode) {
      const duration = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
      void nadaDb.calls.update(callId, {
        endedAt: Date.now(),
        status: "ended"
      });
      void insertCallLogMessage(callId, mode, "ended", duration);
      if (peerPubkeyHash) {
        sendCallSignal({
          type: "call-signal",
          id: crypto.randomUUID(),
          callId,
          recipient: peerPubkeyHash,
          sender: identity.pubkeyHash,
          timestamp: Date.now(),
          mode,
          signalType: "hangup",
          payload: "hangup"
        });
      }
    }
  };

  const rejectIncomingCall = (): void => {
    const call = useCallStore.getState().call;
    if (!call || call.phase !== "incoming-ringing") {
      callStore.endCall();
      return;
    }

    clearCallRingTimeout();
    stopRingtone();
    sendCallSignal({
      type: "call-signal",
      id: crypto.randomUUID(),
      callId: call.callId,
      recipient: call.peerPubkeyHash,
      sender: identity.pubkeyHash,
      timestamp: Date.now(),
      mode: call.mode,
      signalType: "reject",
      payload: "declined"
    });
    void nadaDb.calls.update(call.callId, {
      endedAt: Date.now(),
      status: "ended"
    });
    void insertCallLogMessage(call.callId, call.mode, "declined");
    callStore.endCall();
  };

  /** Delete for me only — soft-delete locally, message stays on remote device */
  const deleteMessageForMe = async (messageId: string): Promise<void> => {
    const deletedAt = Date.now();
    await nadaDb.messages.update(messageId, { deletedAt, status: "local" });
    setMessages((current) =>
      current.map((msg) =>
        msg.id === messageId ? { ...msg, deletedAt, status: "local" } : msg
      )
    );
  };

  /** Delete for everyone — marks deleted locally and notifies the peer to delete too */
  const deleteMessageForEveryone = async (messageId: string): Promise<void> => {
    const deletedAt = Date.now();
    await nadaDb.messages.update(messageId, {
      deletedAt,
      body: "",
      status: "local"
    });
    setMessages((current) =>
      current.map((msg) =>
        msg.id === messageId ? { ...msg, deletedAt, body: "", status: "local" } : msg
      )
    );
    // Notify peer via socket so their client can also delete
    const peer = selectedContact?.pubkeyHash ?? selectedGroup?.memberPubkeyHashes.find((h) => h !== identity.pubkeyHash);
    if (peer && selectedChatId) {
      sendDeletion({
        type: "deletion",
        id: crypto.randomUUID(),
        chatId: selectedChatId,
        messageId: messageId,
        recipient: peer,
        sender: identity.pubkeyHash,
        timestamp: Date.now()
      });
    }
  };

  /** Legacy alias kept so no prop types break */
  const unsendMessage = deleteMessageForEveryone;

  const forwardMessageToChat = async (targetChatId: string, messageId: string) => {
    const original = await nadaDb.messages.get(messageId);
    if (!original) return;
    
    // Determine target recipient or group
    const isTargetGroup = chats.some((c) => c.id === targetChatId);
    const targetGroup = isTargetGroup ? chats.find((c) => c.id === targetChatId) : undefined;
    const targetPeer = contacts.find((c) => directChatId(identity.pubkeyHash, c.pubkeyHash) === targetChatId);
    
    if (!isTargetGroup && !targetPeer) return;

    let bodyToForward = original.body;
    // Strip original reply contexts if present
    if (bodyToForward.startsWith("{")) {
      try {
        const parsed = JSON.parse(bodyToForward);
        if (parsed.replyTo) {
          delete parsed.replyTo;
          bodyToForward = JSON.stringify(parsed);
        }
      } catch { /* ignore parse error */ }
    }

    if (isTargetGroup && targetGroup) {
      if (!targetGroup.groupSenderKey) return;
      const envelopeId = crypto.randomUUID();
      const timestamp = Date.now();
      const messageKind = messageKindFromRecord(original);
      const ciphertext = JSON.stringify(
        await encryptGroupMessage(bodyToForward, targetGroup.groupSenderKey)
      );
      const payload: GroupMessageEnvelope = {
        type: "group-message",
        id: envelopeId,
        groupId: targetGroup.id,
        recipients: targetGroup.memberPubkeyHashes.filter((member) => member !== identity.pubkeyHash),
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind,
        senderKeyPackage: targetGroup.groupSenderKey,
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: bodyToForward } : {})
      };

      const record: MessageRecord = {
        id: envelopeId,
        chatId: targetGroup.id,
        senderPubkeyHash: identity.pubkeyHash,
        recipientPubkeyHash: targetGroup.id,
        body: bodyToForward,
        createdAt: timestamp,
        status: "sent",
        direction: "outbound",
        kind: messageKind,
        encryptedPayload: ciphertext
      };
      await nadaDb.messages.add(record);
      if (targetGroup.id === selectedChatId) {
        setMessages((current) => [...current, record]);
      }
      sendGroupEnvelope(payload);
    } else if (targetPeer) {
      const envelopeId = crypto.randomUUID();
      const timestamp = Date.now();
      const messageKind = messageKindFromRecord(original);
      const ciphertext = await mockEncryptMessage(bodyToForward);
      const payload: MessageEnvelope = {
        type: "message",
        id: envelopeId,
        sender: identity.pubkeyHash,
        recipient: targetPeer.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind,
        ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: bodyToForward } : {})
      };
      const record: MessageRecord = {
        id: envelopeId,
        chatId: targetChatId,
        senderPubkeyHash: identity.pubkeyHash,
        recipientPubkeyHash: targetPeer.pubkeyHash,
        body: bodyToForward,
        createdAt: timestamp,
        status: "queued",
        direction: "outbound",
        kind: messageKind,
        encryptedPayload: ciphertext
      };
      await nadaDb.messages.add(record);
      if (targetChatId === selectedChatId) {
        setMessages((current) => [...current, record]);
      }
      sendEnvelope(payload);
    }
  };

  const sendReactionToMessage = async (
    message: MessageRecord,
    emoji: string
  ): Promise<void> => {
    if (!selectedChatId) return;

    const existing = message.reactions ?? {};
    const senders = existing[emoji] ?? [];
    const alreadyReacted = senders.includes(identity.pubkeyHash);
    let updated: string[];
    if (alreadyReacted) {
      updated = senders.filter((s) => s !== identity.pubkeyHash);
    } else {
      updated = [...senders, identity.pubkeyHash];
    }
    const nextReactions = { ...existing, [emoji]: updated };
    if (updated.length === 0) delete nextReactions[emoji];

    await nadaDb.messages.update(message.id, { reactions: nextReactions });
    setMessages((current) =>
      current.map((m) =>
        m.id === message.id ? { ...m, reactions: nextReactions } : m
      )
    );

    if (selectedGroup) {
      selectedGroup.memberPubkeyHashes.forEach((h) => {
        if (h === identity.pubkeyHash) return;
        sendReaction({
          type: "reaction",
          id: crypto.randomUUID(),
          chatId: selectedChatId,
          messageId: message.id,
          recipient: h,
          sender: identity.pubkeyHash,
          emoji,
          removed: alreadyReacted,
          timestamp: Date.now()
        });
      });
    } else if (selectedContact) {
      sendReaction({
        type: "reaction",
        id: crypto.randomUUID(),
        chatId: selectedChatId,
        messageId: message.id,
        recipient: selectedContact.pubkeyHash,
        sender: identity.pubkeyHash,
        emoji,
        removed: alreadyReacted,
        timestamp: Date.now()
      });
    }
  };

  const pinMessage = async (message: MessageRecord): Promise<void> => {
    if (!selectedChatId) return;
    const alreadyPinned = chatPref.pinnedMessageId === message.id;
    await setChatPref(selectedChatId, {
      pinnedMessageId: alreadyPinned ? null : message.id,
      pinnedMessageBody: alreadyPinned ? null : previewForMessage(message).slice(0, 120)
    });
    setChatPrefState(await getChatPref(selectedChatId));
  };

  const confirmChatAction = async (): Promise<void> => {
    if (!pendingChatAction) return;

    const { action, chatId, contactHash, groupId } = pendingChatAction;
    if (action === "archive" || action === "unarchive") {
      await setChatPref(chatId, {
        archivedAt: action === "archive" ? Date.now() : 0
      });
      setArchivedChatIds((current) => {
        const next = new Set(current);
        if (action === "archive") {
          next.add(chatId);
        } else {
          next.delete(chatId);
        }
        return next;
      });
      if (selectedChatId === chatId && action === "archive") {
        setSelectedContactHash(null);
        setSelectedGroupId(null);
      }
      setPendingChatAction(null);
      showToast(action === "archive" ? "Chat archived." : "Chat unarchived.");
      return;
    }

    if (action === "delete-group") {
      const group = groupId ? chats.find((chat) => chat.id === groupId) : null;
      if (!group || group.ownerPubkeyHash !== identity.pubkeyHash) {
        setPendingChatAction(null);
        showToast("Only the group creator can delete this group.");
        return;
      }

      const timestamp = Date.now();
      const body = JSON.stringify({
        groupId: group.id,
        kind: "group-delete",
        ownerPubkeyHash: identity.pubkeyHash,
        version: 1
      } satisfies GroupDeletePayload);

      if (group.groupSenderKey) {
        const ciphertext = JSON.stringify(
          await encryptGroupMessage(body, group.groupSenderKey)
        );
        const recipients = group.memberPubkeyHashes.filter(
          (member) => member !== identity.pubkeyHash
        );
        sendGroupEnvelope({
          type: "group-message",
          id: crypto.randomUUID(),
          groupId: group.id,
          recipients,
          sender: identity.pubkeyHash,
          timestamp,
          ciphertext,
          messageKind: "system",
          ...(group.groupSenderKey ? { senderKeyPackage: group.groupSenderKey } : {}),
          ...(NADA_DEV_PLAINTEXT_ENABLED ? { devPlaintext: body } : {})
        });
      }

      await nadaDb.messages.where("chatId").equals(group.id).delete();
      await nadaDb.chatPrefs.delete(group.id);
      await nadaDb.groupKeys.delete(group.id);
      await nadaDb.chats.delete(group.id);
      setChats((current) => current.filter((chat) => chat.id !== group.id));
      setArchivedChatIds((current) => {
        const next = new Set(current);
        next.delete(group.id);
        return next;
      });
      setLastMessages((current) => {
        const next = { ...current };
        delete next[group.id];
        return next;
      });
      setUnreadCounts((current) => {
        const next = { ...current };
        delete next[group.id];
        return next;
      });
      if (selectedChatId === group.id) {
        setSelectedGroupId(null);
        setMessages([]);
      }
      setPendingChatAction(null);
      showToast("Group deleted.");
      return;
    }

    await nadaDb.messages.where("chatId").equals(chatId).delete();
    await nadaDb.chatPrefs.delete(chatId);
    if (groupId) {
      await nadaDb.groupKeys.delete(groupId);
      await nadaDb.chats.delete(groupId);
      setChats((current) => current.filter((chat) => chat.id !== groupId));
    }
    if (contactHash) {
      await nadaDb.contacts.delete(contactHash);
      setContacts((current) =>
        current.filter((contact) => contact.pubkeyHash !== contactHash)
      );
    }
    setArchivedChatIds((current) => {
      const next = new Set(current);
      next.delete(chatId);
      return next;
    });
    setLastMessages((current) => {
      const next = { ...current };
      delete next[chatId];
      return next;
    });
    setUnreadCounts((current) => {
      const next = { ...current };
      delete next[chatId];
      return next;
    });
    if (selectedChatId === chatId) {
      setSelectedContactHash(null);
      setSelectedGroupId(null);
      setMessages([]);
    }
    setPendingChatAction(null);
    showToast("Chat deleted locally.");
  };



  const copyGroupInvite = useCallback((): void => {
    if (!selectedGroup?.groupSenderKey || typeof window === "undefined") {
      return;
    }

    const payload: GroupInvitePayload = {
      version: 1,
      kind: "group",
      groupId: selectedGroup.id,
      title: selectedGroup.title,
      ownerPubkeyHash: selectedGroup.ownerPubkeyHash ?? identity.pubkeyHash,
      memberPubkeyHashes: selectedGroup.memberPubkeyHashes,
      // ⚠️ MVP_ONLY — replace before production
      senderKeyPackage: selectedGroup.groupSenderKey
    };

    void navigator.clipboard.writeText(
      buildGroupInviteUrl(window.location.origin, payload)
    );
  }, [identity.pubkeyHash, selectedGroup]);

  const registerPushNotifications = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }

    const vapidKey = process.env['NEXT_PUBLIC_VAPID_PUBLIC_KEY'];
    if (!vapidKey) return;

    // The relay now requires a signed identity proof on push/subscribe so an
    // attacker can't register their own endpoint against another user's
    // pubkeyHash and harvest that user's push payloads.
    const submitSubscription = async (
      sub: PushSubscriptionJSON | PushSubscription,
      relayUrl: string
    ): Promise<void> => {
      const proof = await useIdentityStore
        .getState()
        .signProof("push-subscribe", identity.pubkeyHash);
      if (!proof) return;
      const body = JSON.stringify({
        pubkeyHash: identity.pubkeyHash,
        subscription: typeof (sub as PushSubscription).toJSON === "function"
          ? (sub as PushSubscription).toJSON()
          : (sub as PushSubscriptionJSON),
        proof
      });
      await fetch(`${relayUrl}/api/v1/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
    };

    await navigator.serviceWorker.ready.then(async (registration) => {
      try {
        const relayUrl =
          process.env['NEXT_PUBLIC_RELAY_URL']
            ?.replace("ws://", "http://")
            .replace("wss://", "https://") || "";
        if (!relayUrl) return;

        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          await submitSubscription(existingSub, relayUrl).catch(() => {});
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
        const base64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray
        });

        await submitSubscription(subscription, relayUrl);
      } catch (err) {
        console.error("Failed to subscribe to push notifications", err);
      }
    });
  }, [identity.pubkeyHash]);

  useEffect(() => {
    void registerPushNotifications();
  }, [registerPushNotifications]);

  return (
    <div className="nada-app-frame flex h-dvh w-full items-center justify-center overflow-hidden pl-safe-area pr-safe-area">
      <section
        className="nada-desktop-shell flex h-full w-full max-w-[1440px] bg-nada-surface md:h-[calc(100dvh-1.5rem)] md:overflow-hidden md:rounded-[28px]"
      >
        <DesktopNavRail
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setPanel(null);
            setShowGhostModal(false);
            setShowMoodModal(false);
          }}
          totalUnreadCount={totalUnreadCount}
          onNewChat={() => setPanel("contacts")}
          onSettings={() => setPanel("settings")}
        />
        <aside
          className={cn(
            "nada-sidebar relative flex w-full flex-col overflow-hidden bg-nada-surface md:w-[340px] md:min-w-[320px] md:max-w-[370px] lg:w-[360px]",
            selectedContact || selectedGroup ? "hidden md:flex" : "flex"
          )}
        >
        <MobileChatsHome
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          unreadTotal={totalUnreadCount}
          onComposeClick={() => setPanel("contacts")}
          selfSeed={identity.pubkeyHash}
          ghost={ghostMode}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setPanel(null);
            setShowGhostModal(false);
            setShowMoodModal(false);
          }}
          syncStatus={
            relayStatus === "connected"
              ? "connected"
              : relayStatus === "missing-url"
                ? "offline"
                : "syncing"
          }
          headerProps={{
            activeTab: activeTab
          }}
        >
          {activeTab === "status" ? (
            <StatusView 
              identity={identity}
              contacts={contacts}
              statuses={visibleStatuses}
              onPostStatus={() => setPanel("status_create")}
              onViewStatus={(hash) => setSelectedStatusSenderHash(hash)}
            />
          ) : activeTab === "groups" ? (
            <GroupsHome
              chats={chats}
              contacts={contacts}
              groupItems={sidebarChatItems.filter((item) => item.isGroup && !item.isArchived)}
              onCreateGroup={() => setPanel("group")}
              onSelectGroup={(groupId) => {
                const chat = chats.find((group) => group.id === groupId);
                setSelectedContactHash(null);
                setSelectedGroupId(groupId);
                setDisappearingTimer(chat?.disappearingTimer ?? 0);
                setMessageSearchQuery("");
              }}
            />
          ) : activeTab === "communities" ? (
            <CommunitiesHome
              communities={communities}
              identity={identity}
              onCreateCommunity={() => setPanel("community_create")}
              onCopyInvite={(community) => {
                const invite = `${window.location.origin}/?community=${encodeURIComponent(community.id)}`;
                void navigator.clipboard?.writeText(invite);
                showToast("Community invite copied.");
              }}
              onDeleteCommunity={(communityId) => {
                const community = communities.find((item) => item.id === communityId);
                void saveCommunities(communities.filter((item) => item.id !== communityId));
                showToast(community ? `${community.title} deleted.` : "Community deleted.");
              }}
              onJoinCommunity={(communityId) => {
                updateCommunity(communityId, (community) => ({
                  ...community,
                  joined: true,
                  memberCount: community.joined ? community.memberCount : community.memberCount + 1,
                  updatedAt: Date.now()
                }));
                showToast("Community joined.");
              }}
              onLeaveCommunity={(communityId) => {
                updateCommunity(communityId, (community) => ({
                  ...community,
                  joined: false,
                  memberCount: Math.max(1, community.memberCount - (community.joined ? 1 : 0)),
                  updatedAt: Date.now()
                }));
                showToast("Community left.");
              }}
              onPostCommunity={(communityId, channelId, body) => {
                updateCommunity(communityId, (community) => ({
                  ...community,
                  posts: [
                    {
                      authorName: displayName.trim() || generateRandomUsername(identity.pubkeyHash),
                      body,
                      channelId,
                      createdAt: Date.now(),
                      id: crypto.randomUUID()
                    },
                    ...community.posts
                  ].slice(0, 120),
                  updatedAt: Date.now()
                }));
                showToast("Community post added.");
              }}
              onReportCommunity={(community) => {
                setPendingReportTarget({
                  id: community.id,
                  title: community.title,
                  type: "community"
                });
              }}
            />
          ) : activeTab === "settings" ? (
            <SettingsDashboardPreview
              displayName={displayName}
              ghostMode={ghostMode}
              identity={identity}
              mood={mood}
              onOpenBilling={() => setPanel("billing")}
              onOpenGhostModal={() => setShowGhostModal(true)}
              onOpenMigration={() => setPanel("migration")}
              onOpenMoodModal={() => setShowMoodModal(true)}
              onOpenSettings={() => setPanel("settings")}
              onOpenShare={() => setPanel("share")}
            />
          ) : (
          <div className="flex flex-col">
            {searchQuery.trim().length >= 2 ? (
              <GlobalSearchResults
                query={searchQuery}
                results={globalSearchResults}
                onSelect={(result) => {
                  void handleGlobalSearchSelect(result);
                }}
              />
            ) : null}
            {archivedCount > 0 ? (
              <ArchivedRow
                count={archivedCount}
                onClick={() => setShowArchivedChats((current) => !current)}
              />
            ) : null}
            {showArchivedChats ? (
              <div className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-nada-secondary/[.40]">
                Archived chats
              </div>
            ) : null}
            
            {contacts.length === 0 && chats.length === 0 ? (
              <EmptyChatListState onAdd={() => setPanel("contacts")} />
            ) : (
              <div className="flex flex-col">
                {sidebarChatItems
                  .filter((item) => {
                    if (item.isArchived !== showArchivedChats) return false;
                    if (activeTab === "communities" && !item.isGroup) return false;
                    if (activeFilter === "groups" && !item.isGroup) return false;
                    if (activeFilter === "unread" && item.unread === 0) return false;
                    return matchesSearch(
                      `${item.title} ${item.chatId} ${item.contactHash ?? ""}`,
                      searchQuery
                    );
                  })
                  .map((item) => {
                    const groupRecord = item.groupId
                      ? chats.find((group) => group.id === item.groupId)
                      : null;
                    const itemIsOwnedGroup =
                      Boolean(groupRecord?.ownerPubkeyHash === identity.pubkeyHash);
                    return (
                      <ChatListItem
                        key={item.chatId}
                        name={item.title}
                        preview={item.preview}
                        timestamp={item.timestamp}
                        unreadCount={item.unread}
                        initials={item.initials}
                        isSelected={item.isSelected}
                        isOnline={item.isOnline}
                        {...(item.avatar ? { avatar: item.avatar } : {})}
                        archiveLabel={item.isArchived ? "Unarchive" : "Archive"}
                        deleteLabel={
                          item.isGroup
                            ? itemIsOwnedGroup
                              ? "Delete group"
                              : "Leave"
                            : "Delete"
                        }
                        onArchive={() =>
                          setPendingChatAction({
                            action: item.isArchived ? "unarchive" : "archive",
                            chatId: item.chatId,
                            title: item.title,
                            ...(item.contactHash ? { contactHash: item.contactHash } : {}),
                            ...(item.groupId ? { groupId: item.groupId } : {})
                          })
                        }
                        onClick={() => {
                          if (item.isGroup) {
                            const chat = chats.find((group) => group.id === item.groupId);
                            setSelectedContactHash(null);
                            setSelectedGroupId(item.groupId ?? null);
                            setDisappearingTimer(chat?.disappearingTimer ?? 0);
                          } else {
                            setSelectedGroupId(null);
                            setSelectedContactHash(item.contactHash ?? null);
                          }
                          setMessageSearchQuery("");
                        }}
                        onDelete={() =>
                          setPendingChatAction({
                            action: item.isGroup && itemIsOwnedGroup ? "delete-group" : "delete",
                            chatId: item.chatId,
                            title: item.title,
                            ...(item.contactHash ? { contactHash: item.contactHash } : {}),
                            ...(item.groupId ? { groupId: item.groupId } : {})
                          })
                        }
                      />
                    );
                  })}
                {sidebarChatItems.filter((item) => item.isArchived === showArchivedChats).length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-nada-secondary/50">
                    {showArchivedChats ? "No archived chats." : "No chats here yet."}
                  </div>
                ) : null}
              </div>
            )}
            </div>
          )}
        </MobileChatsHome>
      </aside>

      <ChatPanel
        canAttachFile={Boolean(selectedContact || selectedGroup)}
        canCopyGroupInvite={Boolean(selectedGroup?.groupSenderKey)}
        canDeleteGroup={Boolean(selectedGroup?.ownerPubkeyHash === identity.pubkeyHash)}
        contact={selectedContact}
        disappearingTimer={disappearingTimer}
        editingMessage={editingMessage}
        isGroup={Boolean(selectedGroup)}
        messageSearchQuery={messageSearchQuery}
        messages={chatMessages}
        onBack={() => {
          setSelectedContactHash(null);
          setSelectedGroupId(null);
          setMessageSearchQuery("");
        }}
        onAttachFile={attachFile}
        onCancelEdit={() => {
          setEditingMessageId(null);
        }}
        onCancelReply={() => {
          setReplyToId(null);
        }}
        onCopyGroupInvite={copyGroupInvite}
        onDisappearingTimerChange={(value) => {
          setDisappearingTimer(value);
          if (selectedGroup) {
            void nadaDb.chats.update(selectedGroup.id, {
              disappearingTimer: value
            });
          }
        }}
        onEditMessage={(message) => {
          setEditingMessageId(message.id);
        }}
        onMessageSearchChange={setMessageSearchQuery}
        onReply={(message) => {
          setReplyToId(message.id);
        }}
        onRetryMessage={(message) => {
          void retryOutboundMessage(message);
        }}
        onSend={(text) => {
          void sendMessage(text);
        }}
        onSendVoiceNote={(body) => {
          void sendVoiceNote(body);
        }}
        onStartCall={(mode) => {
          void startCall(mode);
        }}
        onUnsend={(messageId) => {
          void unsendMessage(messageId);
        }}
        onDeleteForMe={(messageId) => {
          void deleteMessageForMe(messageId);
        }}
        onDeleteGroup={() => {
          if (!selectedGroup) return;
          setPendingChatAction({
            action: "delete-group",
            chatId: selectedGroup.id,
            groupId: selectedGroup.id,
            title: selectedGroup.title
          });
        }}
        replyMessage={replyMessage}
        subtitle={selectedSubtitle}
        title={selectedTitle}
        uploadStatus={uploadStatus}
        chatIsMuted={chatIsMuted}
        peerIsBlocked={peerIsBlocked}
        peerIsTyping={peerIsTyping}
        onViewProfile={() => { /* Handled internally by ChatPanel */ }}
        onMute={async (duration) => {
          if (!selectedChatId) return;
          const mutedUntil = duration === 0 ? 0 : duration === -1 ? null : Date.now() + duration;
          await setChatPref(selectedChatId, { mutedUntil });
          const nextPref = await getChatPref(selectedChatId);
          setChatPrefState(nextPref);
          setMutedChatIds((current) => {
            const next = new Set(current);
            if (isMuted(nextPref)) {
              next.add(selectedChatId);
            } else {
              next.delete(selectedChatId);
            }
            return next;
          });
        }}
        onClearChat={async () => {
          if (!selectedChatId) return;
          await setChatPref(selectedChatId, { clearedAt: Date.now() });
          setChatPrefState(await getChatPref(selectedChatId));
        }}
        onBlock={async () => {
          if (!selectedChatId || !selectedContact) return;
          const existing = chatPref.blockedPubkeyHashes;
          if (!existing.includes(selectedContact.pubkeyHash)) {
            await setChatPref(selectedChatId, {
              blockedPubkeyHashes: [...existing, selectedContact.pubkeyHash]
            });
            setChatPrefState(await getChatPref(selectedChatId));
          }
        }}
        contacts={contacts}
        onUnblock={async () => {
          if (!selectedChatId || !selectedContact) return;
          await setChatPref(selectedChatId, {
            blockedPubkeyHashes: chatPref.blockedPubkeyHashes.filter(
              (h) => h !== selectedContact.pubkeyHash
            )
          });
          setChatPrefState(await getChatPref(selectedChatId));
        }}
        onTyping={(isTyping: boolean) => {
          if (!selectedContact || !selectedChatId) return;
          sendTyping({
            type: "typing",
            chatId: selectedChatId,
            sender: identity.pubkeyHash,
            recipient: selectedContact.pubkeyHash,
            isTyping
          });
        }}
        onTypingStop={handleTypingStop}
        onSendPoll={sendPollMessage}
        onForward={(messageId) => setForwardMessageId(messageId)}
        onReact={(message, emoji) => {
          void sendReactionToMessage(message, emoji);
        }}
        onPin={(message) => {
          void pinMessage(message);
        }}
        onReportMessage={(message) => {
          setPendingReportTarget({
            id: message.id,
            title: previewForMessage(message).slice(0, 64) || "Message",
            type: "message"
          });
        }}
        onReportPeer={() => {
          if (!selectedContact) return;
          setPendingReportTarget({
            id: selectedContact.pubkeyHash,
            title: selectedContact.localDisplayName,
            type: "user"
          });
        }}
        pinnedMessageId={chatPref.pinnedMessageId ?? null}
        pinnedMessageBody={chatPref.pinnedMessageBody ?? null}
        wallpaperUrl={chatPref.wallpaperUrl ?? null}
        myPubkeyHash={identity.pubkeyHash}
        blurShieldActive={blurShieldActive}
        blurShieldRevealed={blurShieldRevealed}
        onToggleBlurShield={() => setBlurShieldActive((v) => !v)}
        onRevealBlurShield={() => setBlurShieldRevealed(true)}
        onSetWallpaper={async (url) => {
          if (!selectedChatId) return;
          await setChatPref(selectedChatId, url ? { wallpaperUrl: url } : {});
          setChatPrefState(await getChatPref(selectedChatId));
        }}
      />

      <AnimatePresence>
        {panel === "contacts" ? (
          <ContactSheet
            identity={identity}
            onClose={() => {
              setPanel(null);
            }}
            onNotify={showToast}
            onContactAdded={(contact) => {
              setContacts((current) => [contact, ...current]);
              setSelectedContactHash(contact.pubkeyHash);
              setMessageSearchQuery("");
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "billing" ? (
          <BillingSheet
            identity={identity}
            onClose={() => {
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "migration" ? (
          <MigrationSheet
            chats={chats}
            identity={identity}
            onImported={(records) => {
              setChats(records);
            }}
            onClose={() => {
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "share" ? (
          <ShareSheet
            displayName={displayName}
            identity={identity}
            onClose={() => {
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "group" ? (
          <GroupSheet
            contacts={contacts}
            onClose={() => {
              setPanel(null);
            }}
            onCreate={(title, members) => {
              void createGroup(title, members);
            }}
          />
        ) : null}
        {panel === "community_create" ? (
          <CommunityCreateSheet
            onClose={() => {
              setPanel(null);
            }}
            onCreate={(draft) => {
              void createCommunity(draft);
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "settings" ? (
          <SettingsSheet
            identity={identity}
            onOpenBilling={() => {
              setPanel("billing");
            }}
            onOpenMigration={() => {
              setPanel("migration");
            }}
            onOpenShare={() => {
              setPanel("share");
            }}
            onOpenGhostModal={() => {
              setPanel(null);
              setShowGhostModal(true);
            }}
            onOpenMoodModal={() => {
              setPanel(null);
              setShowMoodModal(true);
            }}
            ghostMode={ghostMode}
            mood={mood}
            onClose={() => {
              setPanel(null);
            }}
            displayName={displayName}
            onDisplayNameChange={async (name) => {
              try {
                setDisplayName(name);
                await nadaDb.settings.put({ key: "displayName", value: name, updatedAt: Date.now() });
                showToast("Display name updated.");
              } catch {
                showToast("Couldn't save display name. Please try again.");
              }
            }}
            notificationSettings={notificationSettings}
            onNotificationSettingsChange={(nextSettings) => {
              void saveNotificationSettings(nextSettings);
            }}
            onPreviewNotificationTone={(tone) => {
              playNotificationTone(tone);
            }}
          />
        ) : null}
        {panel === "status_create" ? (
          <StatusCreateSheet
            onClose={() => setPanel(null)}
            onPost={(text, media) => {
              void handlePostStatus(text, media);
              setPanel(null);
            }}
          />
        ) : null}
        {selectedStatusSenderHash ? (
          <StatusViewerSheet
            contacts={contacts}
            identity={identity}
            onComment={(status, text) => {
              void sendStatusComment(status, text);
            }}
            onDeleteStatus={(status) => {
              void deleteStatus(status);
            }}
            onReactStatus={(status, emoji) => sendStatusReaction(status, emoji)}
            senderName={
              selectedStatusSenderHash === identity.pubkeyHash 
                ? "My Status" 
                : contacts.find(c => c.pubkeyHash === selectedStatusSenderHash)?.localDisplayName || "Someone"
            }
            statuses={visibleStatuses
              .filter(s => s.senderPubkeyHash === selectedStatusSenderHash)
              .sort((a, b) => b.createdAt - a.createdAt)}
            onClose={() => setSelectedStatusSenderHash(null)}
          />
        ) : null}
        {pendingChatAction ? (
          <ConfirmChatActionDialog
            action={pendingChatAction.action}
            chatTitle={pendingChatAction.title}
            onCancel={() => setPendingChatAction(null)}
            onConfirm={() => {
              void confirmChatAction();
            }}
          />
        ) : null}
        {pendingReportTarget ? (
          <SafetyReportSheet
            onClose={() => setPendingReportTarget(null)}
            onSubmit={(category, notes) => {
              void submitSafetyReport({
                category,
                notes,
                target: pendingReportTarget
              });
            }}
            target={pendingReportTarget}
          />
        ) : null}
        {showOnboarding ? (
          <LaunchOnboardingSheet
            contactsCount={contacts.length}
            groupsCount={chats.length}
            hasPostedStatus={allStatuses.some((status) => status.senderPubkeyHash === identity.pubkeyHash)}
            onClose={() => {
              setShowOnboarding(false);
              void setGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY, "true");
            }}
            onEnableNotifications={() => {
              void registerPushNotifications();
            }}
            onOpenCommunity={() => {
              setShowOnboarding(false);
              void setGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY, "true");
              setActiveTab("communities");
            }}
          />
        ) : null}
      </AnimatePresence>
      <IncomingCallModal
        onAccept={async () => {
          const snap = callStore.call;
          if (!snap || !snap.pendingOfferSdp) return;

          try {
            clearCallRingTimeout();
            stopRingtone();
            const session = await createLocalCallSession(snap.mode, snap.callId);

            // Wire ICE forwarding on the callee side
            session.peerConnection.onicecandidate = (e) => {
              if (e.candidate) {
                sendCallSignal({
                  type: "call-signal",
                  id: crypto.randomUUID(),
                  callId: snap.callId,
                  recipient: snap.peerPubkeyHash,
                  sender: identity.pubkeyHash,
                  timestamp: Date.now(),
                  mode: snap.mode,
                  signalType: "ice",
                  payload: JSON.stringify(e.candidate.toJSON())
                });
              }
            };

            // Wire remote track receiver
            session.peerConnection.ontrack = (e) => {
              const stream = e.streams[0];
              if (stream) {
                stream.getTracks().forEach((track) => {
                  if (!session.remoteStream.getTracks().find((t) => t.id === track.id)) {
                    session.remoteStream.addTrack(track);
                  }
                });
              } else {
                if (!session.remoteStream.getTracks().find((t) => t.id === e.track.id)) {
                  session.remoteStream.addTrack(e.track);
                }
              }
              callStore.setPhase("active");
              if (!callStore.call?.startedAt) callStore.setStartedAt(Date.now());
            };

            // Set remote description from the offer
            const offerSdp = JSON.parse(snap.pendingOfferSdp) as RTCSessionDescriptionInit;
            await session.peerConnection.setRemoteDescription(
              new RTCSessionDescription(offerSdp)
            );

            // Flush queued ICE candidates
            const pending = snap.pendingIceCandidates;
            pending.forEach(c =>
              void session.peerConnection.addIceCandidate(new RTCIceCandidate(c))
            );
            callStore.clearPendingIce();

            // Create and send answer
            const answer = await session.peerConnection.createAnswer();
            await session.peerConnection.setLocalDescription(answer);

            callStore.attachLocalSession(session);
            void nadaDb.calls.update(snap.callId, {
              status: "active"
            });

            sendCallSignal({
              type: "call-signal",
              id: crypto.randomUUID(),
              callId: snap.callId,
              recipient: snap.peerPubkeyHash,
              sender: identity.pubkeyHash,
              timestamp: Date.now(),
              mode: snap.mode,
              signalType: "answer",
              payload: JSON.stringify(answer)
            });
          } catch {
            callStore.failCall("Could not access camera/microphone.");
          }
        }}
        onReject={rejectIncomingCall}
      />
      <VoiceCallOverlay onEnd={endCall} />
      <VideoCallOverlay onEnd={endCall} />
      <GroupCallOverlay />

      {/* Dashboard-level toast */}
      <AnimatePresence>
        {dashboardToast && (
          <motion.div
            className="fixed bottom-24 left-1/2 z-[950] -translate-x-1/2 rounded-xl bg-nada-surface border border-nada-border/10 px-5 py-3 text-sm text-nada-primary shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {dashboardToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ghost Mode Modal */}

      <AnimatePresence>
        {showGhostModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowGhostModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-nada-muted text-nada-secondary">
                  <Ghost size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-nada-primary">Ghost Mode</h3>
                  <p className="text-xs text-nada-secondary">Hide typing & online status</p>
                </div>
              </div>
              <p className="text-sm text-nada-secondary mb-5 leading-relaxed">
                While Ghost Mode is active, your contacts won&apos;t see when you&apos;re typing and your activity won&apos;t be broadcast. Your messages still arrive normally.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm text-nada-secondary bg-nada-muted hover:bg-nada-border/40 transition-colors"
                  onClick={() => setShowGhostModal(false)}
                >Cancel</button>
                <button
                  className={cn(
                    "flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                    ghostMode
                      ? "bg-nada-muted text-nada-secondary hover:bg-nada-border/40"
                      : "bg-nada-accent text-white hover:bg-nada-accent/90"
                  )}
                  onClick={async () => {
                    const next = !ghostMode;
                    setGhostMode(next);
                    setSocketGhostMode(next);
                    await setGlobalSetting("ghostMode", String(next));
                    setShowGhostModal(false);
                    showToast(next ? "Ghost mode enabled." : "Ghost mode disabled.");
                  }}
                >
                  {ghostMode ? "Disable Ghost Mode" : "Enable Ghost Mode"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-App Notification Toast */}
      <AnimatePresence>
        {inAppNotification && (
          <motion.div
            className="fixed top-4 left-1/2 z-[1000] -translate-x-1/2 cursor-pointer rounded-2xl bg-nada-surface border border-nada-border/10 p-4 shadow-2xl flex items-center gap-4 w-[90%] max-w-sm"
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            onClick={() => {
              setInAppNotification(null);
              if (inAppNotification.chatId === "status") {
                setSelectedContactHash(null);
                setSelectedGroupId(null);
                setPanel(null);
                setActiveTab("status");
                return;
              }
              const isGrp = chats.some(c => c.id === inAppNotification.chatId);
              if (isGrp) {
                setSelectedContactHash(null);
                setSelectedGroupId(inAppNotification.chatId);
              } else {
                const peer = contacts.find((c) => directChatId(identity.pubkeyHash, c.pubkeyHash) === inAppNotification.chatId);
                if (peer) {
                  setSelectedGroupId(null);
                  setSelectedContactHash(peer.pubkeyHash);
                }
              }
            }}
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-nada-accent/20 text-nada-accent">
              <Bell size={20} />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-semibold text-nada-primary truncate text-sm">{inAppNotification.title}</span>
              <span className="text-xs text-nada-secondary truncate">{inAppNotification.body}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forward Sheet Modal */}
      <AnimatePresence>
        {forwardMessageId && (
          <motion.div
            className="fixed inset-0 z-[950] flex items-end justify-center sm:items-center p-0 sm:p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setForwardMessageId(null)} />
            <motion.div
              className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-nada-surface border border-nada-border/10 shadow-2xl flex flex-col max-h-[80vh]"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between border-b border-nada-border/10 p-4">
                <h3 className="text-lg font-semibold text-nada-primary">Forward to...</h3>
                <button className="p-1 text-nada-secondary hover:text-nada-primary" onClick={() => setForwardMessageId(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="overflow-y-auto p-2">
                {chats.map((chat) => (
                   <button
                     key={chat.id}
                     className="flex w-full items-center gap-3 rounded-xl p-3 hover:bg-nada-muted transition-colors text-left"
                     onClick={() => {
                        void forwardMessageToChat(chat.id, forwardMessageId);
                        setForwardMessageId(null);
                        showToast("Message forwarded");
                     }}
                   >
                     <GroupOrb seeds={[chat.id, chat.title]} size="md" />
                     <span className="font-semibold text-nada-primary">{chat.title}</span>
                   </button>
                ))}
                {contacts.map((contact) => (
                   <button
                     key={contact.id}
                     className="flex w-full items-center gap-3 rounded-xl p-3 hover:bg-nada-muted transition-colors text-left"
                     onClick={() => {
                        const cid = directChatId(identity.pubkeyHash, contact.pubkeyHash);
                        void forwardMessageToChat(cid, forwardMessageId);
                        setForwardMessageId(null);
                        showToast("Message forwarded");
                     }}
                   >
                     <IdentityOrb seed={contact.pubkeyHash || contact.localDisplayName} size="md" label={contact.localDisplayName} />
                     <span className="font-semibold text-nada-primary">{contact.localDisplayName}</span>
                   </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mood Picker Modal */}
      <AnimatePresence>
        {showMoodModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMoodModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-base font-semibold text-nada-primary mb-4">Set Mood</h3>
              <div className="grid grid-cols-2 gap-2">
                {(["Available", "Busy", "Studying", "Chilling", "Do Not Disturb", "Invisible"] as const).map((m) => (
                  <button
                    key={m}
                    className={cn(
                      "rounded-xl px-4 py-3 text-sm font-medium text-left transition-colors",
                      mood === m
                        ? "bg-nada-accent/15 text-nada-accent border border-nada-accent/30"
                        : "bg-nada-muted text-nada-primary hover:bg-nada-border/40"
                    )}
                    onClick={async () => {
                      setMood(m);
                      await setGlobalSetting("mood", m);
                      setShowMoodModal(false);
                    }}
                  >
                    {m === "Available" ? "🟢 " :
                     m === "Busy" ? "🔴 " :
                     m === "Studying" ? "📚 " :
                     m === "Chilling" ? "😎 " :
                     m === "Do Not Disturb" ? "🌙 " :
                     "👻 "}
                    {m}
                  </button>
                ))}
              </div>
              <button
                className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm text-nada-secondary hover:bg-nada-muted transition-colors"
                onClick={() => setShowMoodModal(false)}
              >Cancel</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </section>
    </div>
  );
}

function GlobalSearchResults({
  onSelect,
  query,
  results
}: {
  onSelect: (result: GlobalSearchResult) => void;
  query: string;
  results: GlobalSearchResult[];
}): JSX.Element {
  return (
    <section className="mx-4 mb-3 rounded-2xl border border-nada-border/10 bg-nada-surface-elevated/45 p-2">
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <span className="text-[10.5px] font-bold uppercase text-nada-text-muted">
          Search results
        </span>
        <span className="text-[10px] font-semibold text-nada-secondary/45">
          {results.length}
        </span>
      </div>
      {results.length === 0 ? (
        <p className="px-2 pb-2 text-[12px] text-nada-secondary/55">
          No matches for &quot;{query.trim()}&quot; yet.
        </p>
      ) : (
        <div className="grid gap-1">
          {results.map((result) => (
            <button
              className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.05]"
              key={result.id}
              onClick={() => onSelect(result)}
              type="button"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
                {result.targetType === "community" ? (
                  <Users size={15} />
                ) : result.targetType === "status" ? (
                  <CircleDashed size={15} />
                ) : result.targetType === "message" ? (
                  <MessageCircle size={15} />
                ) : result.targetType === "group" ? (
                  <Users size={15} />
                ) : (
                  <Search size={15} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-nada-primary">
                  {result.label}
                </span>
                <span className="block truncate text-[11.5px] text-nada-text-muted">
                  {result.meta}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}



function ChatPanel({
  canAttachFile,
  canCopyGroupInvite,
  canDeleteGroup,
  contact,
  disappearingTimer,
  editingMessage,
  isGroup,
  messageSearchQuery,
  messages,
  onBack,
  onAttachFile,
  onCancelEdit,
  onCancelReply,
  onCopyGroupInvite,
  onDeleteGroup,
  onDisappearingTimerChange,
  onEditMessage,
  onMessageSearchChange,
  onReply,
  onRetryMessage,
  onSend,
  onSendVoiceNote,
  onStartCall,
  onUnsend,
  onDeleteForMe,
  replyMessage,
  subtitle,
  title,
  uploadStatus,
  chatIsMuted,
  peerIsBlocked,
  peerIsTyping,
  onViewProfile,
  onMute,
  onClearChat,
  onBlock,
  onUnblock,
  onTyping,
  onTypingStop,
  onReact,
  onPin,
  onReportMessage,
  onReportPeer,
  contacts,
  pinnedMessageId,
  pinnedMessageBody,
  myPubkeyHash,
  blurShieldActive,
  blurShieldRevealed,
  onToggleBlurShield,
  onRevealBlurShield,
  wallpaperUrl,
  onSetWallpaper,
  onSendPoll,
  onForward
}: {
  canAttachFile: boolean;
  canCopyGroupInvite: boolean;
  canDeleteGroup: boolean;
  contact: ContactRecord | null;
  disappearingTimer: number;
  editingMessage: MessageRecord | null;
  isGroup: boolean;
  messageSearchQuery: string;
  messages: MessageRecord[];
  onBack: () => void;
  onAttachFile: (file: File) => Promise<boolean>;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onCopyGroupInvite: () => void;
  onDeleteGroup: () => void;
  onDisappearingTimerChange: (value: number) => void;
  onEditMessage: (message: MessageRecord) => void;
  onMessageSearchChange: (value: string) => void;
  onReply: (message: MessageRecord) => void;
  onRetryMessage: (message: MessageRecord) => void;
  onSend: (text: string) => void;
  onSendVoiceNote: (body: string) => void;
  onStartCall: (mode: CallMode) => void;
  onUnsend: (messageId: string) => void;
  onDeleteForMe: (messageId: string) => void;
  replyMessage: MessageRecord | null;
  subtitle: string;
  title: string;
  uploadStatus: string | null;
  chatIsMuted: boolean;
  peerIsBlocked: boolean;
  peerIsTyping: boolean;
  onViewProfile: () => void;
  onMute: (duration: number) => void;
  onClearChat: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onForward: (messageId: string) => void;
  onTyping: (isTyping: boolean) => void;
  onReact: (message: MessageRecord, emoji: string) => void;
  onPin: (message: MessageRecord) => void;
  onReportMessage: (message: MessageRecord) => void;
  onReportPeer: () => void;
  pinnedMessageId: string | null;
  pinnedMessageBody: string | null;
  wallpaperUrl: string | null;
  myPubkeyHash: string;
  blurShieldActive: boolean;
  blurShieldRevealed: boolean;
  onToggleBlurShield: () => void;
  onRevealBlurShield: () => void;
  onSetWallpaper: (url: string | null) => void;
  onSendPoll: (poll: PollData) => void;
  onTypingStop: () => void;
  contacts: ContactRecord[];
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [messageMenu, setMessageMenu] = useState<MessageContextMenuState | null>(null);
  const [showWallpaperPrompt, setShowWallpaperPrompt] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showVerifyKeyModal, setShowVerifyKeyModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteSheetMessageId, setDeleteSheetMessageId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [activeVoiceNoteId, setActiveVoiceNoteId] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [voiceAutoplayRequest, setVoiceAutoplayRequest] = useState<{
    messageId: string;
    token: number;
  } | null>(null);

  // Sync local input with the message being edited.
  const editingMessageId = editingMessage?.id ?? null;
  const editingMessageBody = editingMessage ? textFromMessage(editingMessage) : "";
  useEffect(() => {
    if (editingMessageId) {
      setMessageText(editingMessageBody);
    } else {
      setMessageText("");
    }
  }, [editingMessageId, editingMessageBody]);

  const submitMessage = useCallback((): void => {
    const trimmed = messageText.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setMessageText("");
  }, [messageText, onSend]);

  const voiceNoteMessageIds = useMemo(
    () =>
      messages
        .filter(
          (message) =>
            !message.deletedAt &&
            (messageKindFromRecord(message) === "voice_note" ||
              isVoiceNoteMessage(message.body))
        )
        .map((message) => message.id),
    [messages]
  );

  const handleCancelEdit = useCallback((): void => {
    setMessageText("");
    onCancelEdit();
  }, [onCancelEdit]);

  useEffect(() => {
    const anyOpen =
      showWallpaperPrompt ||
      showPollModal ||
      showMuteModal ||
      showClearModal ||
      showBlockModal ||
      showProfilePanel ||
      showVerifyKeyModal ||
      deleteSheetMessageId !== null ||
      messageMenu !== null;
    if (!anyOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showWallpaperPrompt) setShowWallpaperPrompt(false);
      else if (showPollModal) setShowPollModal(false);
      else if (showMuteModal) setShowMuteModal(false);
      else if (showClearModal) setShowClearModal(false);
      else if (showBlockModal) setShowBlockModal(false);
      else if (showProfilePanel) setShowProfilePanel(false);
      else if (showVerifyKeyModal) setShowVerifyKeyModal(false);
      else if (deleteSheetMessageId !== null) setDeleteSheetMessageId(null);
      else if (messageMenu !== null) setMessageMenu(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [
    showWallpaperPrompt,
    showPollModal,
    showMuteModal,
    showClearModal,
    showBlockModal,
    showProfilePanel,
    showVerifyKeyModal,
    deleteSheetMessageId,
    messageMenu
  ]);
  const [chatSearchActive, setChatSearchActive] = useState(false);
  const [chatSearchIdx, setChatSearchIdx] = useState(0);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentAccept, setAttachmentAccept] = useState("*/*");
  const [attachmentCapture, setAttachmentCapture] = useState<"environment" | undefined>();
  const [attachmentDraft, setAttachmentDraft] = useState<PreparedMediaFile | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentSending, setAttachmentSending] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{
    name: string;
    url: string;
    mimeType: string;
  } | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [ribbonFraction, setRibbonFraction] = useState(1);
  const [ribbonLabel, setRibbonLabel] = useState<string>("");
  const [ribbonActive, setRibbonActive] = useState(false);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<number | null>(null);
  const recordingAudioContext = useRef<AudioContext | null>(null);
  const [recordingAnalyser, setRecordingAnalyser] = useState<AnalyserNode | null>(null);
  // Use a ref for duration so onstop captures the live value, not a stale closure
  const recordingSecondsRef = useRef(0);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTyping = useRef(false);
  const lastTypingEmitAt = useRef(0);


  const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👎"];



  const activeMessageMenu = messageMenu?.messageId ?? null;
  const messageIndexById = useMemo(() => {
    return new Map(messages.map((message, index) => [message.id, index]));
  }, [messages]);

  const contextMenuMessage = useMemo(() => {
    if (!messageMenu) return null;
    return messages.find((message) => message.id === messageMenu.messageId) ?? null;
  }, [messageMenu, messages]);

  const setMessageRef = useCallback((messageId: string, el: HTMLDivElement | null): void => {
    if (el) {
      messageRefs.current[messageId] = el;
    } else {
      delete messageRefs.current[messageId];
    }
  }, []);

  const highlightMessage = useCallback((messageId: string): void => {
    const el = messageRefs.current[messageId];
    if (!el) return;

    el.animate(
      [
        { backgroundColor: "rgb(var(--nada-accent) / 0.24)" },
        { backgroundColor: "transparent" }
      ],
      { duration: 1600, easing: "ease-out" }
    );
  }, []);

  const scrollToMessage = useCallback((messageId: string): void => {
    const index = messageIndexById.get(messageId);
    if (index === undefined) return;

    const renderedMessage = messageRefs.current[messageId];
    if (renderedMessage) {
      renderedMessage.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightMessage(messageId);
      return;
    }

    virtuosoRef.current?.scrollToIndex({
      index,
      align: "center",
      behavior: "smooth"
    });
    window.setTimeout(() => highlightMessage(messageId), 420);
  }, [highlightMessage, messageIndexById]);

  const handleVoicePlaybackStart = useCallback((messageId: string): void => {
    setActiveVoiceNoteId(messageId);
  }, []);

  const handleVoicePlaybackEnd = useCallback((messageId: string): void => {
    const currentIndex = voiceNoteMessageIds.indexOf(messageId);
    const nextMessageId =
      currentIndex >= 0 ? voiceNoteMessageIds[currentIndex + 1] : undefined;

    if (!nextMessageId) {
      setActiveVoiceNoteId(null);
      return;
    }

    scrollToMessage(nextMessageId);
    setActiveVoiceNoteId(nextMessageId);
    window.setTimeout(() => {
      setVoiceAutoplayRequest({
        messageId: nextMessageId,
        token: Date.now()
      });
    }, 220);
  }, [scrollToMessage, voiceNoteMessageIds]);

  const closeMessageContextMenu = useCallback((): void => {
    setMessageMenu(null);
  }, []);

  const openMessageContextMenu = useCallback((
    message: MessageRecord,
    point: { x: number; y: number }
  ): void => {
    if (message.deletedAt) return;

    const menuWidth = 232;
    const menuHeight = message.direction === "outbound" ? 356 : 312;
    const padding = 12;
    const x = Math.min(
      Math.max(point.x, padding),
      Math.max(padding, window.innerWidth - menuWidth - padding)
    );
    const y = Math.min(
      Math.max(point.y, padding),
      Math.max(padding, window.innerHeight - menuHeight - padding)
    );

    setMessageMenu({ messageId: message.id, x, y });
  }, []);

  const copyMessageToClipboard = (message: MessageRecord): void => {
    const copyText = previewForMessage(message);
    if (!navigator.clipboard) {
      showToast("Clipboard is not available.");
      return;
    }

    void navigator.clipboard.writeText(copyText).then(
      () => showToast("Message copied."),
      () => showToast("Copy failed.")
    );
  };

  // Show toast helper
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Search match indices
  const searchMatchIds = useMemo(() => {
    if (!messageSearchQuery.trim()) return [];
    return messages
      .filter((m) =>
        !m.deletedAt &&
        previewForMessage(m).toLowerCase().includes(messageSearchQuery.toLowerCase())
      )
      .map((m) => m.id);
  }, [messages, messageSearchQuery]);

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  // Auto-scroll to the latest message when count changes (virtualizer handles
  // pin-to-bottom, but explicitly request a smooth scroll so the user always
  // sees their just-sent message).
  useEffect(() => {
    if (messages.length === 0) return;
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      align: "end",
      behavior: "smooth"
    });
  }, [messages.length]);

  // Handle chat search scrolling
  useEffect(() => {
    if (chatSearchActive && searchMatchIds.length > 0) {
      const matchId = searchMatchIds[chatSearchIdx];
      if (matchId) {
        scrollToMessage(matchId);
      }
    }
  }, [chatSearchIdx, chatSearchActive, scrollToMessage, searchMatchIds]);

  useEffect(() => {
    if (!messageMenu) return;
    const close = (): void => {
      setMessageMenu(null);
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [messageMenu]);

  useEffect(() => {
    return () => {
      // Cleanup any active recordings when the chat panel unmounts
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (recordingTimer.current) window.clearInterval(recordingTimer.current);
      void recordingAudioContext.current?.close();
      if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
        mediaRecorder.current.stream?.getTracks().forEach((t) => t.stop());
        mediaRecorder.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (attachmentDraft?.previewUrl) {
        URL.revokeObjectURL(attachmentDraft.previewUrl);
      }
    };
  }, [attachmentDraft]);

  useEffect(() => {
    return () => {
      if (wasTyping.current) {
        wasTyping.current = false;
        onTypingStop();
      }
      if (typingTimeout.current) {
        window.clearTimeout(typingTimeout.current);
      }
    };
  }, [contact?.pubkeyHash, isGroup, onTypingStop]);

  const startRecording = async () => {
    if (isRecording) return; // prevent double-start
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextClass) {
        const audioContext = new AudioContextClass();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        recordingAudioContext.current = audioContext;
        setRecordingAnalyser(analyser);
      }

      // Detect supported MIME type — Safari needs audio/mp4
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4"
      ].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunks.current = [];
      recordingSecondsRef.current = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      recorder.onstop = () => {
        // Stop all mic tracks
        stream.getTracks().forEach((t) => t.stop());
        void recordingAudioContext.current?.close();
        recordingAudioContext.current = null;
        setRecordingAnalyser(null);

        const chunks = audioChunks.current;
        if (chunks.length === 0) {
          showToast("No audio was captured. Please try again.");
          return;
        }

        // Use the actual recorded MIME type from the recorder
        const actualMime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: actualMime });

        if (blob.size === 0) {
          showToast("Recording failed. Please try again.");
          return;
        }

        // Use the ref value — NOT the stale state variable
        const duration = recordingSecondsRef.current;

        if (duration < 1) {
          // Silently discard ultra-short recordings (usually accidental clicks)
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          // Pass directly to parent — do NOT go through messageText setState
          onSendVoiceNote(`${base64data}|${duration}`);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.current = recorder;
      // Use timeslice so ondataavailable fires frequently
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingSecondsRef.current = 0;

      recordingTimer.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch { /* ignore recording error */
      showToast("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      if (recordingTimer.current) window.clearInterval(recordingTimer.current);
      void recordingAudioContext.current?.close();
      recordingAudioContext.current = null;
      setRecordingAnalyser(null);
      setIsRecording(false);
      // stop() triggers onstop async — chunks are finalized there
      mediaRecorder.current.stop();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder.current) {
      if (recordingTimer.current) window.clearInterval(recordingTimer.current);
      // Clear ondataavailable so onstop won't send
      mediaRecorder.current.ondataavailable = null;
      mediaRecorder.current.onstop = () => {
        mediaRecorder.current?.stream.getTracks().forEach((t) => t.stop());
        void recordingAudioContext.current?.close();
        recordingAudioContext.current = null;
        setRecordingAnalyser(null);
      };
      mediaRecorder.current.stop();
      audioChunks.current = [];
      setIsRecording(false);
    }
  };

  const openAttachmentPicker = (
    accept: string,
    capture?: "environment"
  ): void => {
    setAttachmentAccept(accept);
    setAttachmentCapture(capture);
    setAttachmentMenuOpen(false);
    window.setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  const prepareAttachmentDraft = async (file: File): Promise<void> => {
    const validationError = validateMediaFile(file);
    if (validationError) {
      setAttachmentError(validationError);
      showToast(validationError);
      return;
    }

    try {
      setAttachmentError(null);
      const prepared = await prepareMediaFile(file);
      setAttachmentDraft((current) => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return prepared;
      });
    } catch {
      setAttachmentError("Could not prepare this attachment.");
      showToast("Could not prepare this attachment.");
    }
  };

  const sendAttachmentDraft = async (): Promise<void> => {
    if (!attachmentDraft || attachmentSending) return;
    setAttachmentSending(true);
    setAttachmentError(null);
    onTypingStop();
    const ok = await onAttachFile(attachmentDraft.file);
    setAttachmentSending(false);
    if (ok) {
      if (attachmentDraft.previewUrl) URL.revokeObjectURL(attachmentDraft.previewUrl);
      setAttachmentDraft(null);
      setAttachmentError(null);
    } else {
      setAttachmentError("Upload failed. You can retry or cancel.");
    }
  };

  const cancelAttachmentDraft = (): void => {
    setAttachmentDraft((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setAttachmentError(null);
    setAttachmentSending(false);
  };

  if (!contact && !isGroup) {
    return (
      <section className="nada-empty-state relative hidden flex-1 flex-col items-center justify-center overflow-hidden md:flex nada-chat-bg">
        {/* Aurora ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px] animate-aurora"
            style={{ background: "radial-gradient(circle, rgba(30,215,130,0.55) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10 flex max-w-md flex-col items-center px-8 text-center animate-fade-in">
          {/* Logo */}
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-[24px] blur-2xl opacity-60 animate-logo-glow nada-logo-aura" />
            <div className="relative grid h-[80px] w-[80px] place-items-center overflow-hidden rounded-[24px] nada-logo-aura">
              <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
            </div>
          </div>

          <p className="text-[10px] font-bold uppercase text-nada-accent/85">
            Say less. Reveal nothing.
          </p>
          <h2 className="mt-3 text-[28px] font-bold text-nada-primary">
            Nothing to reveal.
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-nada-secondary/75">
            Start a private conversation without a name, phone number, or trace.
          </p>

          {/* Decorative chips */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {["No phone", "No email", "Local keys", "Encrypted", "Anonymous by default"].map((label) => (
              <span key={label} className="nada-privacy-chip">{label}</span>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative flex min-h-dvh flex-1 flex-col overflow-hidden"
      style={{
        background: wallpaperUrl ? `url(${wallpaperUrl}) center/cover no-repeat` : "rgb(var(--n-base))"
      }}
    >
      {!wallpaperUrl && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 32%, rgba(124,58,237,0.08) 0%, transparent 55%), radial-gradient(circle at 82% 78%, rgba(37,99,235,0.06) 0%, transparent 55%), radial-gradient(circle at 50% 110%, rgba(16,217,138,0.05) 0%, transparent 50%)"
          }}
        />
      )}
      {wallpaperUrl && <div className="absolute inset-0 bg-black/45 z-0 pointer-events-none" />}
      
      {/* Chat Header */}
      <header
        className="nada-chat-header z-header relative flex shrink-0 items-center gap-3 md:px-5"
        style={{
          paddingLeft: "max(env(safe-area-inset-left), 12px)",
          paddingRight: "max(env(safe-area-inset-right), 12px)"
        }}
      >
        <IconButton className="md:hidden" label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        {/* Identity orb — shared-element seed matches the chat list */}
        <motion.div layoutId={`orb-${title}`} className="relative shrink-0">
          <IdentityOrb seed={title} size="lg" label={title} className="!h-[48px] !w-[48px]" />
        </motion.div>
        <div className="min-w-0 flex-1 py-2">
          <h2 className="truncate text-[16px] font-bold text-nada-primary">{title}</h2>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="nada-security-pill py-1 text-[10.5px]">
              {isGroup ? "Invite-only encrypted room" : "End-to-end encrypted"}
            </span>
            <span className="truncate text-[11.5px] font-medium text-nada-text-muted">
              {subtitle || "Unverified key"}
            </span>
          </div>
        </div>
        {isGroup ? (
          <>
            <IconButton
              label="Group Call"
              onClick={() => {
                onStartCall("group");
              }}
            >
              <Video size={16} />
            </IconButton>
            <IconButton
              disabled={!canCopyGroupInvite}
              label="Copy group invite"
              onClick={onCopyGroupInvite}
            >
              <Copy size={16} />
            </IconButton>
            <div className="relative">
              <IconButton
                label="Group options"
                onClick={() => {
                  setShowOptions(!showOptions);
                }}
              >
                <MoreVertical size={16} />
              </IconButton>
              {showOptions && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowOptions(false);
                    }}
                  />
                  <div
                    className="absolute right-0 top-full z-50 mt-2 w-60 origin-top-right rounded-2xl border border-nada-border/24 py-1.5 animate-scale-in"
                    style={{
                      background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.95), rgb(var(--nada-surface) / 0.95))",
                      backdropFilter: "blur(28px) saturate(150%)",
                      boxShadow: "0 20px 56px rgba(0,0,0,0.55), 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgb(var(--nada-border) / 0.10)"
                    }}
                  >
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setChatSearchActive(true);
                      }}
                    >
                      <Search size={14} className="text-nada-accent/70" />
                      Search in group
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowWallpaperPrompt(true);
                      }}
                    >
                      <Image size={14} className="text-nada-accent/70" />
                      Set group wallpaper
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        onToggleBlurShield();
                        if (!blurShieldActive) {
                          showToast("Privacy shield enabled. Tap messages to reveal.");
                        }
                      }}
                    >
                      {blurShieldActive ? <Eye size={14} className="text-nada-accent" /> : <EyeOff size={14} className="text-nada-secondary/[.50]" />}
                      {blurShieldActive ? "Disable privacy shield" : "Enable privacy shield"}
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-danger hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowClearModal(true);
                      }}
                    >
                      <Trash2 size={14} className="text-nada-danger/70" />
                      Clear group chat
                    </button>
                    {canDeleteGroup ? (
                      <>
                        <div className="my-1 border-t border-nada-border/[.08]" />
                        <button
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-nada-danger hover:bg-red-500/10 transition-colors"
                          onClick={() => {
                            setShowOptions(false);
                            onDeleteGroup();
                          }}
                        >
                          <Trash2 size={14} className="text-nada-danger" />
                          Delete group
                        </button>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <IconButton
              label="Voice call"
              onClick={() => {
                onStartCall("voice");
              }}
            >
              <Phone size={16} />
            </IconButton>
            <IconButton
              label="Video call"
              onClick={() => {
                onStartCall("video");
              }}
            >
              <Video size={16} />
            </IconButton>
            <div className="relative">
              <IconButton
                label="More options"
                onClick={() => {
                  setShowOptions(!showOptions);
                }}
              >
                <MoreVertical size={16} />
              </IconButton>
              {showOptions && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowOptions(false);
                    }}
                  />
                  <div
                    className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right rounded-2xl border border-nada-border/24 py-1.5 animate-scale-in"
                    style={{
                      background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.95), rgb(var(--nada-surface) / 0.95))",
                      backdropFilter: "blur(28px) saturate(150%)",
                      boxShadow: "0 20px 56px rgba(0,0,0,0.55), 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgb(var(--nada-border) / 0.10)"
                    }}
                  >
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowProfilePanel(true);
                        onViewProfile();
                      }}
                    >
                      <User size={14} className="text-nada-accent/70" />
                      View profile
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setChatSearchActive(true);
                      }}
                    >
                      <Search size={14} className="text-nada-accent/70" />
                      Search in chat
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        if (chatIsMuted) {
                          onMute(0);
                          showToast("Notifications unmuted.");
                        } else {
                          setShowMuteModal(true);
                        }
                      }}
                    >
                      {chatIsMuted ? <BellOff size={14} className="text-nada-accent/70" /> : <Bell size={14} className="text-nada-accent/70" />}
                      {chatIsMuted ? "Unmute notifications" : "Mute notifications"}
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowWallpaperPrompt(true);
                      }}
                    >
                      <Image size={14} className="text-nada-accent/70" />
                      Set Chat Wallpaper
                    </button>
                    <div className="my-1 border-t border-nada-border/[.08]" />
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        onToggleBlurShield();
                        if (!blurShieldActive) {
                          showToast("Privacy shield enabled. Tap messages to reveal.");
                        }
                      }}
                    >
                      {blurShieldActive ? <Eye size={14} className="text-nada-accent" /> : <EyeOff size={14} className="text-nada-secondary/[.50]" />}
                      {blurShieldActive ? "Disable privacy shield" : "Enable privacy shield"}
                    </button>
                    {!isGroup && (
                      <button
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                        onClick={() => {
                          setShowOptions(false);
                          setShowVerifyKeyModal(true);
                        }}
                      >
                        <ShieldAlert size={14} className="text-nada-gold/80" />
                        Verify key
                      </button>
                    )}
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        onReportPeer();
                      }}
                    >
                      <Flag size={14} className="text-nada-danger/70" />
                      Report user
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-danger hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowClearModal(true);
                      }}
                    >
                      <Trash2 size={14} className="text-nada-danger/70" />
                      Clear chat
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-danger hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        if (peerIsBlocked) {
                          onUnblock();
                          showToast("User unblocked.");
                        } else {
                          setShowBlockModal(true);
                        }
                      }}
                    >
                      <ShieldOff size={14} className="text-nada-danger/70" />
                      {peerIsBlocked ? "Unblock user" : "Block user"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </header>

      {/* Typing indicator — inline bubble style */}
      {peerIsTyping && !peerIsBlocked && (
        <div className="flex items-center gap-2.5 px-4 py-2 animate-fade-in border-b border-nada-border/8"
          style={{ background: "rgb(var(--nada-surface) / 0.5)" }}
        >
          <div
            className="flex items-center gap-1 rounded-2xl rounded-bl-[4px] px-3 py-2"
            style={{
              background: "rgb(var(--nada-surface-elevated) / 0.9)",
              border: "1px solid rgb(var(--nada-border) / 0.15)"
            }}
          >
            <span className="nada-typing-dot" />
            <span className="nada-typing-dot" />
            <span className="nada-typing-dot" />
          </div>
          <span className="text-[11.5px] text-nada-secondary/50">{title} is typing…</span>
        </div>
      )}

      {/* Blocked banner */}
      {peerIsBlocked && (
        <div className="flex items-center justify-between border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          <span className="flex items-center gap-2">
            <ShieldOff size={14} />
            You have blocked this user.
          </span>
          <button
            className="rounded-lg bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30 transition-colors"
            onClick={() => { onUnblock(); showToast("User unblocked."); }}
            type="button"
          >
            Unblock
          </button>
        </div>
      )}

      {/* Pinned message banner */}
      {pinnedMessageId && pinnedMessageBody && (
        <button
          className="nada-pinned-banner flex w-full items-center gap-2.5 px-4 py-2 text-left animate-fade-in"
          onClick={() => {
            scrollToMessage(pinnedMessageId);
          }}
          type="button"
        >
          <Pin size={13} className="shrink-0 text-nada-accent" />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-nada-accent">Pinned</span>
            <span className="block truncate text-xs text-nada-secondary">{pinnedMessageBody}</span>
          </span>
        </button>
      )}

      {/* Vanish mode banner */}
      {disappearingTimer > 0 && (
        <div className="nada-vanish-banner flex items-center gap-2 px-4 py-1.5 text-xs animate-fade-in">
          <span className="nada-vanish-dot" />
          Vanish mode: messages disappear after {
            disappearingTimer >= 86400000 ? "1 day" :
            disappearingTimer >= 3600000 ? "1 hour" :
            disappearingTimer >= 60000 ? "1 min" : "custom"
          }
        </div>
      )}


      {/* Chat search bar */}
      {chatSearchActive && (
        <div className="z-10 flex items-center gap-2 border-b border-nada-border/30 bg-nada-surface px-4 py-2 animate-fade-in">
          <Search size={14} className="text-nada-secondary" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm text-nada-primary outline-none placeholder:text-nada-secondary/[.60]"
            onChange={(e) => {
              onMessageSearchChange(e.target.value);
              setChatSearchIdx(0);
            }}
            placeholder="Search messages…"
            value={messageSearchQuery}
          />
          {searchMatchIds.length > 0 && (
            <span className="text-xs text-nada-secondary tabular-nums">
              {chatSearchIdx + 1}/{searchMatchIds.length}
            </span>
          )}
          <button
            className="rounded-md p-1 text-nada-secondary hover:bg-nada-muted"
            onClick={() => setChatSearchIdx((i) => Math.max(0, i - 1))}
            type="button"
            disabled={chatSearchIdx <= 0}
          >
            <ChevronUp size={16} />
          </button>
          <button
            className="rounded-md p-1 text-nada-secondary hover:bg-nada-muted"
            onClick={() => setChatSearchIdx((i) => Math.min(searchMatchIds.length - 1, i + 1))}
            type="button"
            disabled={chatSearchIdx >= searchMatchIds.length - 1}
          >
            <ChevronDown size={16} />
          </button>
          <button
            className="rounded-md p-1.5 text-nada-secondary hover:bg-nada-muted"
            onClick={() => {
              setChatSearchActive(false);
              onMessageSearchChange("");
              setChatSearchIdx(0);
            }}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="absolute left-1/2 top-20 z-[100] -translate-x-1/2 rounded-2xl border border-nada-border/30 px-4 py-2.5 text-[13.5px] font-medium text-nada-primary shadow-2xl backdrop-blur-xl"
            style={{
              background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.95), rgb(var(--nada-surface) / 0.95))",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgb(var(--nada-border) / 0.10)"
            }}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute modal */}
      <AnimatePresence>
        {showMuteModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMuteModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-4">Mute notifications</h3>
              <div className="space-y-2">
                {[
                  { label: "8 hours", value: 8 * 60 * 60 * 1000 },
                  { label: "1 week", value: 7 * 24 * 60 * 60 * 1000 },
                  { label: "Always", value: -1 }
                ].map((opt) => (
                  <button
                    key={opt.label}
                    className="w-full rounded-xl px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                    onClick={() => {
                      onMute(opt.value);
                      setShowMuteModal(false);
                      showToast("Notifications muted.");
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm text-nada-secondary hover:bg-nada-muted transition-colors"
                onClick={() => setShowMuteModal(false)}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear chat confirmation modal */}
      <AnimatePresence>
        {showClearModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowClearModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-2">Clear chat</h3>
              <p className="text-sm text-nada-secondary mb-5">
                This will clear all messages from your view. The other user will still see the messages. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm text-nada-secondary bg-nada-muted hover:bg-nada-border/40 transition-colors"
                  onClick={() => setShowClearModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-400 transition-colors"
                  onClick={() => {
                    onClearChat();
                    setShowClearModal(false);
                    showToast("Chat cleared.");
                  }}
                >
                  Clear chat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verify key modal */}
      <AnimatePresence>
        {showVerifyKeyModal && contact && !isGroup && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowVerifyKeyModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <div className="mb-4 flex items-center gap-2">
                <ShieldAlert size={18} className="text-nada-gold/80" />
                <h3 className="text-lg font-semibold text-nada-primary">Verify safety numbers</h3>
              </div>
              <p className="mb-4 text-sm text-nada-secondary">
                Compare these fingerprints with {title} over another channel (in person, voice call). If they match, this conversation is end-to-end secured.
              </p>
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-nada-secondary/70">{title}</p>
                <code className="block break-all rounded-xl border border-nada-border/10 bg-black/40 px-3 py-2.5 font-mono text-[12.5px] text-nada-primary">
                  {contact.pubkeyHash.match(/.{1,5}/g)?.join(" ") ?? contact.pubkeyHash}
                </code>
              </div>
              <div className="mb-5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-nada-secondary/70">You</p>
                <code className="block break-all rounded-xl border border-nada-border/10 bg-black/40 px-3 py-2.5 font-mono text-[12.5px] text-nada-primary">
                  {myPubkeyHash.match(/.{1,5}/g)?.join(" ") ?? myPubkeyHash}
                </code>
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm text-nada-secondary bg-nada-muted hover:bg-nada-border/40 transition-colors"
                  onClick={() => setShowVerifyKeyModal(false)}
                >
                  Close
                </button>
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-nada-bg bg-nada-accent hover:bg-nada-accent/90 transition-colors"
                  onClick={() => {
                    const text = `${title}: ${contact.pubkeyHash}\nYou: ${myPubkeyHash}`;
                    if (navigator.clipboard?.writeText) {
                      void navigator.clipboard.writeText(text).then(
                        () => showToast("Safety numbers copied."),
                        () => showToast("Copy failed.")
                      );
                    } else {
                      showToast("Clipboard is not available.");
                    }
                  }}
                >
                  Copy both
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block user confirmation modal */}
      <AnimatePresence>
        {showBlockModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowBlockModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-2">Block user</h3>
              <p className="text-sm text-nada-secondary mb-5">
                Blocked users cannot send you messages, call you, or send voice notes. You can unblock them at any time.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm text-nada-secondary bg-nada-muted hover:bg-nada-border/40 transition-colors"
                  onClick={() => setShowBlockModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-400 transition-colors"
                  onClick={() => {
                    onBlock();
                    setShowBlockModal(false);
                    showToast("User blocked.");
                  }}
                >
                  Block
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp-style Delete Bottom Sheet */}
      <AnimatePresence>
        {deleteSheetMessageId && (() => {
          const targetMsg = messages.find((m) => m.id === deleteSheetMessageId);
          const isOwn = targetMsg?.direction === "outbound";
          return (
            <motion.div
              className="fixed inset-0 z-[870] flex items-end justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteSheetMessageId(null)} />
              <motion.div
                className="relative z-10 w-full max-w-lg rounded-t-2xl bg-nada-surface border-t border-nada-border/10 p-2 pb-safe shadow-2xl"
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 350 }}
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-nada-border/60" />
                <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-nada-secondary">Delete message</p>
                {isOwn && (
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium text-nada-danger hover:bg-nada-muted transition-colors"
                    onClick={() => {
                      onUnsend(deleteSheetMessageId);
                      setDeleteSheetMessageId(null);
                      showToast("Message deleted for everyone.");
                    }}
                  >
                    <Trash2 size={18} className="text-nada-danger/80" />
                    Delete for everyone
                  </button>
                )}
                <button
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                  onClick={() => {
                    onDeleteForMe(deleteSheetMessageId);
                    setDeleteSheetMessageId(null);
                    showToast("Message deleted for you.");
                  }}
                >
                  <Trash2 size={18} className="text-nada-secondary" />
                  Delete for me
                </button>
                <button
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm text-nada-secondary hover:bg-nada-muted transition-colors"
                  onClick={() => setDeleteSheetMessageId(null)}
                >
                  <X size={18} />
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Wallpaper Prompt */}
      <AnimatePresence>
        {showWallpaperPrompt && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowWallpaperPrompt(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-4">Set Chat Wallpaper</h3>
              <p className="text-xs text-nada-secondary mb-4">Enter an image URL for this chat&apos;s background.</p>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const url = fd.get("url") as string;
                if (url) {
                  onSetWallpaper(url);
                } else {
                  onSetWallpaper(null);
                }
                setShowWallpaperPrompt(false);
                showToast(url ? "Wallpaper updated." : "Wallpaper removed.");
              }}>
                <input
                  name="url"
                  placeholder="https://example.com/image.jpg"
                  defaultValue={wallpaperUrl ?? ""}
                  className="w-full rounded-xl border border-nada-border/10 bg-black/40 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/50 focus:border-nada-accent focus:outline-none mb-4"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { onSetWallpaper(null); setShowWallpaperPrompt(false); showToast("Wallpaper removed."); }} className="flex-1 rounded-xl bg-nada-muted py-2 text-sm text-nada-secondary hover:text-nada-primary transition-colors">Clear</button>
                  <button type="submit" className="flex-1 rounded-xl bg-nada-accent py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90">Save</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Poll Creation Modal */}
      <AnimatePresence>
        {showPollModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPollModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl flex flex-col max-h-[80vh]"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-4 flex items-center gap-2">
                <BarChart2 size={18} className="text-nada-accent" /> Create Poll
              </h3>
              <form 
                className="flex flex-col gap-3 min-h-0 flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const question = fd.get("question") as string;
                  const multipleAnswers = fd.get("multipleAnswers") === "true";
                  
                  const options: PollOption[] = [];
                  let i = 0;
                  while (fd.has(`opt${i}`)) {
                    const text = (fd.get(`opt${i}`) as string).trim();
                    if (text) {
                      options.push({ id: String(i), text, voterPubkeyHashes: [] });
                    }
                    i++;
                  }
                  
                  if (!question.trim()) { showToast("Question is required."); return; }
                  if (options.length < 2) { showToast("At least 2 options required."); return; }
                  if (options.length > 10) { showToast("Maximum 10 options allowed."); return; }
                  
                  onSendPoll({ question: question.trim(), options, multipleAnswers });
                  setShowPollModal(false);
                }}
              >
                <input
                  name="question"
                  placeholder="Ask a question..."
                  className="w-full rounded-xl border border-nada-border/10 bg-black/40 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/50 focus:border-nada-accent focus:outline-none font-medium"
                  autoFocus
                />
                
                <div className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1 py-2">
                  {[0,1,2,3,4,5,6,7,8,9].map((i) => (
                    <input
                      key={i}
                      name={`opt${i}`}
                      placeholder={`Option ${i + 1}${i >= 2 ? ' (optional)' : ''}`}
                      className="w-full rounded-xl border border-nada-border/10 bg-black/20 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/30 focus:border-nada-accent focus:outline-none"
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-2 px-1">
                  <input type="checkbox" id="multipleAnswers" name="multipleAnswers" value="true" className="rounded bg-black/40 border-nada-border/10 text-nada-accent focus:ring-nada-accent focus:ring-offset-nada-surface" />
                  <label htmlFor="multipleAnswers" className="text-xs text-nada-secondary cursor-pointer select-none">Allow multiple answers</label>
                </div>

                <div className="flex gap-2 mt-4 shrink-0">
                  <button type="button" onClick={() => setShowPollModal(false)} className="flex-1 rounded-xl bg-nada-muted py-2.5 text-sm font-medium text-nada-secondary hover:text-nada-primary transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 rounded-xl bg-nada-accent py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 flex items-center justify-center gap-2 shadow-gold-glow">
                    <Send size={14} /> Send
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile panel */}
      <AnimatePresence>
        {showProfilePanel && contact && (
          <motion.div
            className="fixed inset-0 z-[850] flex justify-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowProfilePanel(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm h-full bg-nada-surface border-l border-nada-border/10 overflow-y-auto"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-nada-primary">Profile</h3>
                  <button
                    className="rounded-full p-2 text-nada-secondary hover:bg-nada-muted transition-colors"
                    onClick={() => setShowProfilePanel(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="flex flex-col items-center gap-4 mb-8">
                  <div className="grid h-24 w-24 place-items-center rounded-full bg-nada-accent shadow-lg">
                    <Avatar label={contact.localDisplayName} size="lg" />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-semibold text-nada-primary">{contact.localDisplayName}</p>
                    <p className="mt-1 text-xs text-nada-secondary font-mono">{contact.pubkeyHash.slice(0, 24)}…</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-nada-muted px-3 py-1 text-xs text-nada-secondary">
                      {contact.trustStatus === "trusted" ? "✓ Verified" : contact.trustStatus === "blocked" ? "⚠ Blocked" : "Unverified"}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                    onClick={() => setShowProfilePanel(false)}
                  >
                    <MessageCircle size={16} className="text-nada-secondary" /> Message
                  </button>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                    onClick={() => {
                      if (chatIsMuted) { onMute(0); showToast("Notifications unmuted."); }
                      else { setShowProfilePanel(false); setShowMuteModal(true); }
                    }}
                  >
                    {chatIsMuted ? <BellOff size={16} className="text-nada-secondary" /> : <Bell size={16} className="text-nada-secondary" />}
                    {chatIsMuted ? "Unmute" : "Mute"}
                  </button>
                  <div className="my-2 border-t border-nada-border/30" />
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-nada-danger hover:bg-nada-muted transition-colors"
                    onClick={() => { setShowProfilePanel(false); setShowClearModal(true); }}
                  >
                    <Trash2 size={16} /> Clear chat
                  </button>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-nada-danger hover:bg-nada-muted transition-colors"
                    onClick={() => {
                      if (peerIsBlocked) { onUnblock(); showToast("User unblocked."); }
                      else { setShowProfilePanel(false); setShowBlockModal(true); }
                    }}
                  >
                    <ShieldOff size={16} /> {peerIsBlocked ? "Unblock" : "Block"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact sub-toolbar: timer + search */}
      <div
        className="flex items-center gap-2 border-b border-nada-border/8 px-4 py-1.5"
        style={{ background: "rgb(var(--nada-surface) / 0.4)", backdropFilter: "blur(8px)" }}
      >
        <Clock size={11} className="text-nada-secondary/35 shrink-0" />
        <select
          className="rounded-lg border border-nada-border/15 px-2 py-1 text-[11px] text-nada-secondary/70 outline-none cursor-pointer transition-colors hover:border-nada-accent/30"
          style={{ background: "rgb(var(--nada-surface-elevated) / 0.6)" }}
          onChange={(event) => { onDisappearingTimerChange(Number(event.target.value)); }}
          value={disappearingTimer}
        >
          <option value={0}>Keep messages</option>
          <option value={60000}>1 min</option>
          <option value={3600000}>1 hour</option>
          <option value={86400000}>1 day</option>
        </select>
        <div className="ml-auto">
          <label
            className="flex h-7 items-center gap-1.5 rounded-lg border border-nada-border/15 px-2.5 cursor-text transition-colors focus-within:border-nada-accent/35"
            style={{ background: "rgb(var(--nada-surface-elevated) / 0.6)" }}
          >
            <Search size={11} className="text-nada-secondary/40" />
            <input
              className="w-24 bg-transparent text-[11px] text-nada-primary outline-none placeholder:text-nada-secondary/35"
              onChange={(event) => { onMessageSearchChange(event.target.value); }}
              placeholder="Search..."
              value={messageSearchQuery}
            />
          </label>
        </div>
      </div>
      {uploadStatus ? (
        <div
          className="border-b border-nada-accent/15 px-4 py-2 text-[11.5px] font-medium text-nada-accent flex items-center gap-2"
          style={{ background: "rgb(var(--nada-accent) / 0.06)" }}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-nada-accent animate-pulse" />
          {uploadStatus}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1" style={{ background: "transparent" }}>
        {blurShieldActive && !blurShieldRevealed && (
          <div className="nada-blur-shield" onClick={onRevealBlurShield}>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-nada-surface/80 text-nada-secondary">
                <EyeOff size={22} />
              </div>
            </div>
          </div>
        )}
        {/* ── Time Ribbon — leading-edge spine + scroll-tracking gradient node ── */}
        {messages.length > 3 && (
          <div className="n-ribbon">
            <motion.div
              className="absolute -left-[3.5px] flex items-center gap-2"
              style={{ top: `calc(${Math.min(100, Math.max(0, ribbonFraction * 100))}% - 4px)` }}
              animate={{ top: `calc(${Math.min(100, Math.max(0, ribbonFraction * 100))}% - 4px)` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.9}
              onDragStart={() => setRibbonActive(true)}
              onDrag={(_e, info) => {
                const track = (info.point.y);
                const host = (_e.target as HTMLElement)?.closest(".n-ribbon") as HTMLElement | null;
                if (!host) return;
                const rect = host.getBoundingClientRect();
                const frac = Math.min(1, Math.max(0, (track - rect.top) / rect.height));
                const idx = Math.round(frac * (messages.length - 1));
                const msg = messages[idx];
                if (msg) setRibbonLabel(new Date(msg.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
                virtuosoRef.current?.scrollToIndex({ index: idx, align: "center" });
              }}
              onDragEnd={() => setRibbonActive(false)}
            >
              <span className="n-ribbon-node" />
              <AnimatePresence>
                {ribbonActive && ribbonLabel && (
                  <motion.span
                    className="n-ribbon-label"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                  >
                    {ribbonLabel}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
        <Virtuoso
          key={messages[0]?.chatId ?? contact?.pubkeyHash ?? title}
          ref={virtuosoRef}
          alignToBottom
          atBottomStateChange={(atBottom) => {
            setIsAtBottom(atBottom);
            if (atBottom) setRibbonFraction(1);
          }}
          atBottomThreshold={120}
          className="nada-message-virtuoso"
          computeItemKey={(_index, message) => message.id}
          components={{
            Header: () => <div className="h-3" />,
            Footer: () => <div className="h-32" />
          }}
          data={messages}
          followOutput="smooth"
          rangeChanged={(range) => {
            if (ribbonActive) return;
            const denom = Math.max(1, messages.length - 1);
            setRibbonFraction(Math.min(1, Math.max(0, range.endIndex / denom)));
          }}
          increaseViewportBy={{ top: 700, bottom: 900 }}
          initialTopMostItemIndex={Math.max(0, messages.length - 1)}
          itemContent={(index, message) => {
          const prevMessage = messages[index - 1];
          const showDateSep = !prevMessage || new Date(message.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString();
          const isMenuOpen = activeMessageMenu === message.id;

          const reactions = message.reactions ?? {};
          const hasReactions = Object.keys(reactions).length > 0;
          const isPinned = pinnedMessageId === message.id;
          const isVanishing = Boolean(message.expiresAt && disappearingTimer > 0);

          // ── Call log bubble (centred system event, like WhatsApp) ─────────────
          if (message.kind === "call") {
            let callLog: { mode?: string; status?: string; duration?: number } = {};
            try { callLog = JSON.parse(message.body); } catch { /* ignore */ }
            const isVideo = callLog.mode === "video" || callLog.mode === "group";
            const dur = callLog.duration ?? 0;
            const durLabel = dur > 0
              ? dur >= 3600
                ? `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`
                : dur >= 60
                  ? `${Math.floor(dur / 60)}m ${dur % 60}s`
                  : `${dur}s`
              : "";
            const label = callLog.status === "ended"
              ? `${isVideo ? "Video" : "Voice"} call${durLabel ? ` · ${durLabel}` : ""}`
              : callLog.status === "missed"
                ? `Missed ${isVideo ? "video" : "voice"} call`
                : callLog.status === "declined"
                  ? `${isVideo ? "Video" : "Voice"} call declined`
                  : `${isVideo ? "Video" : "Voice"} call started`;
            const isMissed = callLog.status === "missed" || callLog.status === "declined";
            return (
              <div key={message.id} ref={(el) => setMessageRef(message.id, el)} className="px-3">
                {showDateSep && (
                  <div className="flex justify-center py-3">
                    <span className="nada-date-pill">
                      {new Date(message.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  </div>
                )}
                <div className="flex justify-center py-2">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11.5px] font-medium",
                      isMissed
                        ? "border-nada-danger/20 text-nada-danger"
                        : "border-nada-border/12 text-nada-secondary/60"
                    )}
                    style={{ background: isMissed ? "rgb(252 165 165 / 0.07)" : "rgb(var(--nada-surface-elevated) / 0.5)" }}
                  >
                    {isVideo
                      ? <Video size={12} />
                      : <Phone size={12} />}
                    {label}
                  </div>
                </div>
              </div>
            );
          }
          // ─────────────────────────────────────────────────────────────────────

          const prevMsgSameSender = prevMessage && prevMessage.senderPubkeyHash === message.senderPubkeyHash && !showDateSep;
          const nextMessage = messages[index + 1];
          const nextMsgSameSender = nextMessage && nextMessage.senderPubkeyHash === message.senderPubkeyHash && (new Date(nextMessage.createdAt).toDateString() === new Date(message.createdAt).toDateString());

          const isFirstInCluster = !prevMsgSameSender;
          const isLastInCluster = !nextMsgSameSender;
          const shouldAnimateIn = index >= Math.max(0, messages.length - 3);

          return (
            <div
              key={message.id}
              ref={(el) => setMessageRef(message.id, el)}
              className={cn("pl-1 pr-3 md:px-2", isFirstInCluster ? "mt-3" : "mt-1")}
            >
              {/* Date separator */}
              {showDateSep && (
                <div className="flex justify-center py-3">
                  <span className="nada-date-pill">
                    {new Date(message.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </div>
              )}
              <motion.div
                className={cn(
                  "group relative flex touch-pan-y px-1 py-0.5",
                  message.direction === "outbound" ? "justify-end" : "justify-start"
                )}
                drag="x"
                dragConstraints={
                  message.direction === "outbound"
                    ? { left: -96, right: 0 }
                    : { left: 0, right: 96 }
                }
                dragDirectionLock
                dragElastic={0.25}
                dragSnapToOrigin={true}
                dragTransition={{ bounceStiffness: 600, bounceDamping: 15 }}
                onDragEnd={(_event, info) => {
                  if (Math.abs(info.offset.x) > 64) {
                    onReply(message);
                    if ("vibrate" in navigator) navigator.vibrate(10);
                  }
                }}
                initial={shouldAnimateIn ? { opacity: 0, y: 8, scale: 0.98 } : false}
                animate={shouldAnimateIn ? { opacity: 1, y: 0, scale: 1 } : false}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMessageContextMenu(message, { x: e.clientX, y: e.clientY });
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse") return;
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
                  const point = { x: e.clientX, y: e.clientY };
                  longPressTimer.current = setTimeout(() => {
                    openMessageContextMenu(message, point);
                    if ("vibrate" in navigator) navigator.vibrate(10);
                  }, 500);
                }}
                onPointerCancel={() => {
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
                }}
                onPointerUp={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                onPointerLeave={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-nada-accent/15 text-nada-accent opacity-0 transition-opacity group-active:opacity-100",
                    message.direction === "outbound" ? "right-2" : "left-2"
                  )}
                >
                  <Reply size={16} />
                </div>
                <div
                  className={cn(
                    "relative max-w-[min(75%,520px)] text-[14.5px]",
                    message.direction === "outbound"
                      ? cn("nada-bubble-sent", isLastInCluster && "has-tail")
                      : cn("nada-bubble-received", isLastInCluster && "has-tail"),
                    isPinned && "ring-1 ring-nada-accent/40",
                    isMenuOpen && "ring-1 ring-nada-accent/25"
                  )}
                >
                  {message.replyToId ? (
                    <button
                      type="button"
                      className="nada-reply-quote mb-2 flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-opacity hover:opacity-90"
                      onClick={() => {
                        if (message.replyToId) scrollToMessage(message.replyToId);
                      }}
                    >
                      {(() => {
                        const original = messages.find((m) => m.id === message.replyToId);
                        const snapshot = message.replyTo;
                        const senderName = original
                          ? original.senderPubkeyHash === myPubkeyHash
                            ? "You"
                            : contacts.find(c => c.pubkeyHash === original.senderPubkeyHash)?.localDisplayName || "Someone"
                          : snapshot?.senderName ?? "Someone";
                        const previewText = original
                          ? previewForMessage(original)
                          : snapshot?.textPreview ?? snapshot?.fileName ?? "Message unavailable.";

                        return (
                          <>
                            <span className="nada-reply-sender text-[10.5px] font-semibold leading-tight">
                              {senderName}
                            </span>
                            <span className="nada-reply-preview truncate text-[12px] leading-tight">
                              {previewText.length > 48 ? `${previewText.slice(0, 48)}...` : previewText}
                            </span>
                          </>
                        );
                      })()}
                    </button>
                  ) : null}
                  <MessageContent
                    activeVoiceNoteId={activeVoiceNoteId}
                    message={message}
                    outbound={message.direction === "outbound"}
                    onOpenMedia={setMediaViewer}
                    onReact={onReact}
                    onVoicePlaybackEnd={handleVoicePlaybackEnd}
                    onVoicePlaybackStart={handleVoicePlaybackStart}
                    voiceAutoplayToken={
                      voiceAutoplayRequest?.messageId === message.id
                        ? voiceAutoplayRequest.token
                        : 0
                    }
                  />
                  {message.mentions?.length ? (
                    <p className="mt-0.5 text-[11px] opacity-60">
                      @{message.mentions.length} mention{message.mentions.length === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  <div
                    className={cn(
                      "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                      message.direction === "outbound"
                        ? "text-white/70"
                        : "text-nada-secondary/55"
                    )}
                  >
                    {message.editedAt ? <span className="italic">edited ·</span> : null}
                    {isVanishing && <Flame size={10} className="opacity-60" />}
                    <span className="tabular-nums">{formatTime(message.createdAt)}</span>
                    {message.direction === "outbound"
                      ? (() => {
                          if (message.status === "failed") {
                            return (
                              <button
                                aria-label="Retry sending message"
                                className="ml-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-red-300 hover:text-red-200"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRetryMessage(message);
                                }}
                                type="button"
                              >
                                Retry
                              </button>
                            );
                          }
                          const glyphMeta = deliveryStatusGlyph(message.status);
                          const glyphClass = cn(
                            "ml-0.5 inline-flex shrink-0",
                            glyphMeta.tone === "read"
                              ? "text-sky-300"
                              : "text-white"
                          );
                          if (glyphMeta.glyph === "clock") {
                            return (
                              <Clock
                                aria-label={glyphMeta.label}
                                className={glyphClass}
                                size={12}
                                strokeWidth={2.4}
                              />
                            );
                          }
                          if (glyphMeta.glyph === "check") {
                            return (
                              <Check
                                aria-label={glyphMeta.label}
                                className={glyphClass}
                                size={13}
                                strokeWidth={2.6}
                              />
                            );
                          }
                          return (
                            <CheckCheck
                              aria-label={glyphMeta.label}
                              className={glyphClass}
                              size={14}
                              strokeWidth={2.6}
                            />
                          );
                        })()
                      : null}
                  </div>

                </div>

                {/* Reaction chips */}
                {hasReactions && (
                  <div className={cn(
                    "absolute bottom-0 flex flex-wrap gap-1",
                    message.direction === "outbound" ? "right-3 translate-y-4" : "left-3 translate-y-4"
                  )}>
                    {Object.entries(reactions).map(([emoji, senders]) => (
                      <button
                        key={emoji}
                        type="button"
                        className={cn(
                          "nada-reaction-chip",
                          senders.includes(myPubkeyHash) && "nada-reaction-mine"
                        )}
                        onClick={() => onReact(message, emoji)}
                      >
                        {emoji}
                        {senders.length > 1 && (
                          <span className="text-[10px] font-medium opacity-70">{senders.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
              {hasReactions && <div className="h-5" />}
            </div>
          );
          }}
        />

        <AnimatePresence>
          {!isAtBottom && (
            <motion.button
              key="nada-scroll-fab"
              aria-label="Scroll to latest messages"
              type="button"
              onClick={() => {
                virtuosoRef.current?.scrollToIndex({
                  index: Math.max(0, messages.length - 1),
                  align: "end",
                  behavior: "smooth"
                });
              }}
              className="nada-scroll-fab absolute bottom-4 right-4 z-20 grid h-11 w-11 place-items-center rounded-full"
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              <ArrowDown size={18} strokeWidth={2.4} className="text-nada-primary" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {contextMenuMessage && messageMenu ? (
          <>
            <motion.button
              aria-label="Close message menu"
              className="fixed inset-0 z-[60] cursor-default bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMessageContextMenu}
              type="button"
            />
            <motion.div
              className="nada-message-context-menu fixed z-[70] w-[232px] overflow-hidden rounded-2xl p-1.5"
              style={{ left: messageMenu.x, top: messageMenu.y }}
              initial={{ opacity: 0, scale: 0.94, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="mb-1 flex items-center justify-between rounded-full border border-nada-border/10 bg-white/[0.04] px-1.5 py-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    aria-label={`React with ${emoji}`}
                    className="grid h-7 w-7 place-items-center rounded-full text-[14px] transition hover:bg-white/10 hover:scale-110"
                    onClick={() => {
                      onReact(contextMenuMessage, emoji);
                      closeMessageContextMenu();
                    }}
                    type="button"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="my-1 h-px bg-white/8" />
              <MessageContextAction
                icon={<Reply size={15} />}
                label="Reply"
                onClick={() => {
                  onReply(contextMenuMessage);
                  closeMessageContextMenu();
                }}
              />
              <MessageContextAction
                icon={<Copy size={15} />}
                label="Copy"
                onClick={() => {
                  copyMessageToClipboard(contextMenuMessage);
                  closeMessageContextMenu();
                }}
              />
              <MessageContextAction
                icon={<Share2 size={15} />}
                label="Forward"
                onClick={() => {
                  onForward(contextMenuMessage.id);
                  closeMessageContextMenu();
                }}
              />
              <MessageContextAction
                active={pinnedMessageId === contextMenuMessage.id}
                icon={<Pin size={15} />}
                label={pinnedMessageId === contextMenuMessage.id ? "Unpin" : "Pin"}
                onClick={() => {
                  onPin(contextMenuMessage);
                  closeMessageContextMenu();
                }}
              />
              {contextMenuMessage.direction === "outbound" &&
              messageKindFromRecord(contextMenuMessage) === "text" ? (
                <MessageContextAction
                  icon={<Edit3 size={15} />}
                  label="Edit"
                  onClick={() => {
                    onEditMessage(contextMenuMessage);
                    closeMessageContextMenu();
                  }}
                />
              ) : null}
              <MessageContextAction
                icon={<Flag size={15} />}
                label="Report"
                onClick={() => {
                  onReportMessage(contextMenuMessage);
                  closeMessageContextMenu();
                }}
              />
              <div className="my-1 h-px bg-white/10" />
              <MessageContextAction
                danger
                icon={<Trash2 size={15} />}
                label="Delete"
                onClick={() => {
                  setDeleteSheetMessageId(contextMenuMessage.id);
                  closeMessageContextMenu();
                }}
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <form
        className={cn(
          "nada-input-bar relative sticky bottom-0 z-header px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6",
          peerIsBlocked && "pointer-events-none opacity-40"
        )}
        onSubmit={(event) => {
          event.preventDefault();
          submitMessage();
        }}
      >
        {/* Message reply preview */}

        {replyMessage ? (
          <div
            className="mb-2 flex items-center justify-between rounded-[14px] px-3 py-2.5 border-l-2 border-nada-accent"
            style={{ background: "rgb(var(--nada-accent) / 0.08)", backdropFilter: "blur(8px)" }}
          >
            <div className="flex flex-col min-w-0 pl-2">
              <span className="text-[10px] font-semibold text-nada-accent uppercase tracking-wider">
                Replying to {replyMessage.senderPubkeyHash === myPubkeyHash ? "yourself" :
                  contact?.pubkeyHash === replyMessage.senderPubkeyHash ? contact?.localDisplayName : "someone"}
              </span>
              <span className="truncate text-xs text-white/60 mt-0.5">
                {previewForMessage(replyMessage)}
              </span>
            </div>
            <button className="ml-2 shrink-0 p-1 text-nada-secondary/[.60] hover:text-white transition-colors rounded-lg" onClick={onCancelReply} type="button">
              <X size={14} />
            </button>
          </div>
        ) : null}
        {editingMessage ? (
          <div
            className="mb-2 flex items-center justify-between rounded-[14px] px-3 py-2.5 text-xs text-nada-accent"
            style={{ background: "rgb(var(--nada-accent) / 0.08)" }}
          >
            <span className="font-medium">Editing message</span>
            <button className="ml-2 shrink-0 rounded-lg p-1 hover:bg-nada-accent/10 transition-colors" onClick={handleCancelEdit} type="button">
              <X size={14} />
            </button>
          </div>
        ) : null}
        {attachmentDraft ? (
          <AttachmentPreview
            draft={attachmentDraft}
            error={attachmentError}
            isSending={attachmentSending}
            onCancel={cancelAttachmentDraft}
            onSend={() => {
              void sendAttachmentDraft();
            }}
          />
        ) : null}
        <div className="nada-message-lane flex items-center gap-2 px-4 md:px-6">
          {!isRecording ? (
            <>
              <input
                accept={attachmentAccept}
                capture={attachmentCapture}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void prepareAttachmentDraft(file);
                  }
                  event.target.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
              <button
                aria-label="Attach file"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-nada-border/10 text-nada-secondary/70 transition-all duration-150 hover:border-nada-accent/35 hover:text-nada-accent hover:scale-105 active:scale-90"
                style={{
                  background: "rgb(var(--nada-surface-elevated) / 0.7)",
                  backdropFilter: "blur(12px)"
                }}
                disabled={!canAttachFile || peerIsBlocked}
                onClick={() => { setAttachmentMenuOpen((current) => !current); }}
                type="button"
              >
                <Plus size={19} strokeWidth={2.2} />
              </button>
              {attachmentMenuOpen ? (
                <AttachmentMenu
                  onPickAudio={() => openAttachmentPicker("audio/*")}
                  onPickCamera={() => openAttachmentPicker("image/*", "environment")}
                  onPickDocument={() =>
                    openAttachmentPicker(
                      ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/pdf,application/zip,text/*"
                    )
                  }
                  onPickImage={() => openAttachmentPicker("image/*")}
                  onPickVideo={() => openAttachmentPicker("video/*")}
                  {...(isGroup && {
                    onPickPoll: () => {
                      setAttachmentMenuOpen(false);
                      setShowPollModal(true);
                    }
                  })}
                />
              ) : null}
              <input
                className="nada-composer-input h-12 min-w-0 flex-1 px-4 text-[14.5px] text-nada-primary outline-none transition-all duration-200 placeholder:text-nada-secondary/45 disabled:opacity-40"
                disabled={peerIsBlocked}
                onChange={(event) => {
                  const val = event.target.value;
                  setMessageText(val);

                  if (val.trim() === "") {
                    wasTyping.current = false;
                    if (typingTimeout.current) clearTimeout(typingTimeout.current);
                    onTypingStop();
                    return;
                  }

                  if (!wasTyping.current) {
                    wasTyping.current = true;
                    onTyping(true);
                    lastTypingEmitAt.current = Date.now();
                  } else if (Date.now() - lastTypingEmitAt.current > 2500) {
                    onTyping(true);
                    lastTypingEmitAt.current = Date.now();
                  }
                  if (typingTimeout.current) clearTimeout(typingTimeout.current);
                  typingTimeout.current = setTimeout(() => {
                    wasTyping.current = false;
                    onTyping(false);
                  }, 2000);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                placeholder="Type a message..."
                value={messageText}
              />
              {messageText.trim() ? (
                <button
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-all duration-200 hover:scale-105 active:scale-90 nada-logo-aura"
                  type="submit"
                  aria-label="Send message"
                >
                  <Send size={16} strokeWidth={2.4} />
                </button>
              ) : (
                <button
                  aria-label="Voice note"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-all duration-200 hover:scale-105 active:scale-90 nada-logo-aura"
                  onPointerDown={startRecording}
                  type="button"
                >
                  <Mic size={17} strokeWidth={2.2} />
                </button>
              )}
            </>
          ) : (
            <div className="flex-1">
              <VoiceRecorderBar 
                seconds={recordingSeconds} 
                onStop={stopRecording} 
                onCancel={cancelRecording} 
                analyser={recordingAnalyser}
              />
            </div>
          )}
        </div>
      </form>
      <AnimatePresence>
        {mediaViewer ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[960] flex flex-col bg-black/90 p-4 backdrop-blur-xl"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <div className="mb-3 flex items-center justify-between gap-3 text-white">
              <p className="min-w-0 truncate text-sm font-semibold">{mediaViewer.name}</p>
              <div className="flex gap-2">
                <a
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
                  download={mediaViewer.name}
                  href={mediaViewer.url}
                >
                  <Download size={18} />
                </a>
                <button
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
                  onClick={() => setMediaViewer(null)}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 place-items-center">
              {mediaViewer.mimeType.startsWith("image/") ? (
                <img
                  alt={mediaViewer.name}
                  className="max-h-full max-w-full rounded-2xl object-contain"
                  src={mediaViewer.url}
                />
              ) : mediaViewer.mimeType.startsWith("video/") ? (
                <video
                  className="max-h-full max-w-full rounded-2xl"
                  controls
                  src={mediaViewer.url}
                />
              ) : (
                <a
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black"
                  download={mediaViewer.name}
                  href={mediaViewer.url}
                >
                  Open file
                </a>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function MessageContextAction({
  active = false,
  danger = false,
  icon,
  label,
  onClick
}: {
  active?: boolean;
  danger?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] font-semibold transition",
        danger
          ? "text-nada-danger hover:bg-red-500/10"
          : active
            ? "bg-nada-accent/[0.12] text-nada-accent"
            : "text-nada-primary/85 hover:bg-white/[0.08] hover:text-white"
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cn(
        "grid h-7 w-7 place-items-center rounded-lg",
        danger ? "bg-red-500/10" : "bg-white/[0.07]"
      )}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function MessageContent({
  activeVoiceNoteId,
  message,
  outbound,
  onOpenMedia,
  onReact,
  onVoicePlaybackEnd,
  onVoicePlaybackStart,
  voiceAutoplayToken = 0
}: {
  activeVoiceNoteId?: string | null;
  message: MessageRecord;
  outbound: boolean;
  onOpenMedia: (viewer: { name: string; url: string; mimeType: string }) => void;
  onReact?: (message: MessageRecord, emoji: string) => void;
  onVoicePlaybackEnd?: (messageId: string) => void;
  onVoicePlaybackStart?: (messageId: string) => void;
  voiceAutoplayToken?: number;
}): JSX.Element {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const media = useMemo(() => mediaFromMessage(message), [message]);
  const payload = useMemo(() => decodeMessagePayload(message.body), [message.body]);
  const kind = useMemo(() => messageKindFromRecord(message), [message]);
  const mediaUrl = media?.url ?? "";
  const mediaKeyBase64 = media?.keyBase64 ?? "";
  const mediaNonceBase64 = media?.nonceBase64 ?? "";

  useEffect(() => {
    let active = true;
    setLoadError(null);
    setResolvedUrl(null);

    if (!media) {
      return () => {
        active = false;
      };
    }

    if (media.url.startsWith("data:") || media.url.startsWith("blob:")) {
      setResolvedUrl(media.url);
      return () => {
        active = false;
      };
    }

    if (kind === "image" || kind === "video" || kind === "audio" || kind === "voice_note") {
      void openDecryptedMedia(media)
        .then((url) => {
          if (active) setResolvedUrl(url);
        })
        .catch(() => {
          if (active) setLoadError("Media unavailable");
        });
    }

    return () => {
      active = false;
    };
  }, [kind, media, mediaKeyBase64, mediaNonceBase64, mediaUrl]);

  if (message.deletedAt) {
    return (
      <p className="whitespace-pre-wrap break-words text-[15px] italic leading-relaxed opacity-50">
        Message deleted
      </p>
    );
  }

  if (kind === "poll" && payload?.poll) {
    const poll = payload.poll;
    // Calculate total votes across all options
    const votesByOption: Record<string, number> = {};
    let totalVotes = 0;
    for (const opt of poll.options) {
      // Reactions on polls use option id as emoji
      const voterCount = message.reactions?.[opt.id]?.length ?? 0;
      votesByOption[opt.id] = voterCount;
      totalVotes += voterCount;
    }

    return (
      <div className="flex flex-col gap-2 min-w-[240px]">
        <h4 className="font-semibold text-[15px] mb-2">{poll.question}</h4>
        <div className="flex flex-col gap-1.5">
          {poll.options.map((opt) => {
            const votes = votesByOption[opt.id] || 0;
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            return (
              <button
                key={opt.id}
                type="button"
                className="relative overflow-hidden rounded-xl border border-nada-border/20 bg-black/20 text-left transition hover:bg-black/40"
                onClick={() => onReact?.(message, opt.id)}
              >
                <div 
                  className="absolute inset-y-0 left-0 bg-nada-accent/20 transition-all duration-500" 
                  style={{ width: `${percentage}%` }}
                />
                <div className="relative flex items-center justify-between px-3 py-2">
                  <span className="text-sm z-10">{opt.text}</span>
                  {totalVotes > 0 && (
                    <span className="text-[10px] opacity-70 z-10">{percentage}%</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] opacity-50 text-right mt-1">
          {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
        </p>
      </div>
    );
  }

  if (media) {
    const displayUrl = resolvedUrl ?? media.thumbnailDataUrl ?? media.thumbnailUrl ?? null;
    if (kind === "voice_note" || kind === "audio") {
      const voicePlaybackProps =
        kind === "voice_note"
          ? {
              activePlaybackId: activeVoiceNoteId ?? null,
              autoPlayToken: voiceAutoplayToken,
              playbackId: message.id,
              ...(onVoicePlaybackEnd ? { onPlaybackEnd: onVoicePlaybackEnd } : {}),
              ...(onVoicePlaybackStart ? { onPlaybackStart: onVoicePlaybackStart } : {})
            }
          : {};
      return resolvedUrl ? (
        <VoiceNoteBubble
          durationSeconds={Math.round(media.duration ?? 0)}
          outbound={outbound}
          src={resolvedUrl}
          {...voicePlaybackProps}
        />
      ) : (
        <MediaLoadingState error={loadError} label={kind === "voice_note" ? "Voice note" : media.fileName} />
      );
    }

    if (kind === "image") {
      return (
        <button
          className="flex max-w-[280px] flex-col gap-1 text-left"
          disabled={!displayUrl}
          onClick={() => {
            if (resolvedUrl) {
              onOpenMedia({
                name: media.originalName,
                url: resolvedUrl,
                mimeType: media.mimeType
              });
            }
          }}
          type="button"
        >
          {displayUrl ? (
            <img
              alt={media.originalName}
              className="max-h-72 rounded-xl bg-black/10 object-contain"
              loading="lazy"
              src={displayUrl}
            />
          ) : (
            <MediaLoadingState error={loadError} label="Photo" />
          )}
          <span className="text-[10px] opacity-70">{media.originalName}</span>
        </button>
      );
    }

    if (kind === "video") {
      return displayUrl ? (
        <video className="max-h-72 rounded-xl" controls src={displayUrl} />
      ) : (
        <MediaLoadingState error={loadError} label="Video" />
      );
    }

    return (
      <div className="flex min-w-[220px] items-center gap-3 rounded-xl bg-black/5 p-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-nada-accent/20 text-nada-accent">
          <FileText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{media.originalName}</span>
          <span className="text-[10px] opacity-70">
            {formatBytes(media.size)} - {media.mimeType}
          </span>
        </div>
        <button
          className="p-1 text-nada-secondary hover:text-nada-primary"
          onClick={() => {
            void openDecryptedMedia(media)
              .then((url) => {
                onOpenMedia({
                  name: media.originalName,
                  url,
                  mimeType: media.mimeType
                });
              })
              .catch(() => setLoadError("File unavailable"));
          }}
          title="Open file"
          type="button"
        >
          <Download size={16} />
        </button>
      </div>
    );
  }

  if (isVoiceNoteMessage(message.body)) {
    const voice = parseVoiceNoteBody(message.body);
    return (
      <VoiceNoteBubble
        activePlaybackId={activeVoiceNoteId ?? null}
        autoPlayToken={voiceAutoplayToken}
        durationSeconds={voice.durationSeconds}
        outbound={outbound}
        playbackId={message.id}
        src={voice.src}
        {...(onVoicePlaybackEnd ? { onPlaybackEnd: onVoicePlaybackEnd } : {})}
        {...(onVoicePlaybackStart ? { onPlaybackStart: onVoicePlaybackStart } : {})}
      />
    );
  }

  if (isInlineImageMessage(message.body)) {
    const legacy = parseInlineFileMessage(message.body);
    return legacy ? (
      <button
        className="flex flex-col gap-1 text-left"
        onClick={() =>
          onOpenMedia({
            name: legacy.filename,
            url: legacy.dataUrl,
            mimeType: legacy.mimeType
          })
        }
        type="button"
      >
        <img
          alt={legacy.filename}
          className="max-h-64 rounded-lg bg-black/5 object-contain"
          loading="lazy"
          src={legacy.dataUrl}
        />
        <span className="text-[10px] opacity-70">{legacy.filename}</span>
      </button>
    ) : (
      <MediaLoadingState error="Image unavailable" label="Photo" />
    );
  }

  if (isInlineFileMessage(message.body)) {
    const legacy = parseInlineFileMessage(message.body);
    return legacy ? (
      <div className="flex items-center gap-3 rounded-lg bg-black/5 p-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-nada-accent/20 text-nada-accent">
          <Download size={18} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{legacy.filename}</span>
          <span className="text-[10px] opacity-70">{formatBytes(legacy.sizeBytes)}</span>
        </div>
        <a
          className="p-1 text-nada-secondary hover:text-nada-primary"
          download={legacy.filename}
          href={legacy.dataUrl}
          title="Download file"
        >
          <Download size={16} />
        </a>
      </div>
    ) : (
      <MediaLoadingState error="File unavailable" label="Document" />
    );
  }

  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      <MessageTextWithLinks text={payload?.text ?? textFromMessage(message)} />
    </div>
  );
}

function MessageTextWithLinks({ text }: { text: string }): JSX.Element {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <span key={i} className="inline-flex flex-col gap-1">
              <a
                href={part}
                target="_blank"
                rel="noreferrer"
                className="text-nada-accent hover:underline break-all"
              >
                {part}
              </a>
              {/* WhatsApp-style Link Preview Card */}
              <a
                href={part}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex flex-col overflow-hidden rounded-xl bg-black/20 ring-1 ring-nada-border/20 transition hover:bg-black/30 w-[240px]"
              >
                <div className="flex h-[120px] w-full items-center justify-center bg-nada-muted text-nada-secondary/[.40]">
                   <FileText size={32} />
                </div>
                <div className="p-2.5">
                   <h4 className="truncate text-xs font-semibold text-nada-primary">
                     {new URL(part).hostname}
                   </h4>
                   <p className="truncate text-[10px] text-nada-secondary">
                     Tap to open link
                   </p>
                </div>
              </a>
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function MediaLoadingState({
  error,
  label
}: {
  error: string | null;
  label: string;
}): JSX.Element {
  return (
    <div className="flex min-w-[180px] items-center gap-2 rounded-xl bg-black/5 p-3 text-xs opacity-80">
      {error ? <ShieldAlert size={15} /> : <Loader2 className="animate-spin" size={15} />}
      <span>{error ?? `Loading ${label.toLowerCase()}...`}</span>
    </div>
  );
}

function AttachmentMenu({
  onPickAudio,
  onPickCamera,
  onPickDocument,
  onPickImage,
  onPickVideo,
  onPickPoll
}: {
  onPickAudio: () => void;
  onPickCamera: () => void;
  onPickDocument: () => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onPickPoll?: () => void;
}): JSX.Element {
  const options: Array<{
    action?: () => void;
    comingSoon?: boolean;
    icon: typeof Image;
    label: string;
  }> = [
    { label: "Photo", icon: Image, action: onPickImage },
    { label: "Camera", icon: Camera, action: onPickCamera },
    { label: "Document", icon: FileText, action: onPickDocument },
    { label: "Video", icon: Video, action: onPickVideo },
    { label: "Audio", icon: Music, action: onPickAudio },
    { label: "Burn-after-view photo", icon: Flame, comingSoon: true },
    ...(onPickPoll ? [{ label: "Poll", icon: FileText, action: onPickPoll }] : [])
  ];

  return (
    <div
      className="nada-floating-menu absolute bottom-16 left-3 z-40 grid w-[260px] gap-1 rounded-[22px] p-2 animate-scale-in"
    >
      {options.map((option) => (
        <button
          className={cn(
            "flex items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-[13.5px] font-semibold text-nada-primary transition-colors hover:bg-nada-accent/12",
            option.comingSoon && "cursor-not-allowed opacity-55 hover:bg-transparent"
          )}
          disabled={option.comingSoon}
          key={option.label}
          onClick={option.action}
          type="button"
        >
          <span className={cn(
            "grid h-9 w-9 place-items-center rounded-xl ring-1",
            option.comingSoon
              ? "bg-nada-danger/10 text-nada-danger ring-nada-danger/10"
              : "bg-nada-accent/14 text-nada-accent ring-nada-accent/10"
          )}>
            <option.icon size={17} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">{option.label}</span>
          {option.comingSoon ? (
            <span className="rounded-full bg-nada-surface/70 px-2 py-0.5 text-[10px] text-nada-text-muted">
              Soon
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function AttachmentPreview({
  draft,
  error,
  isSending,
  onCancel,
  onSend
}: {
  draft: PreparedMediaFile;
  error: string | null;
  isSending: boolean;
  onCancel: () => void;
  onSend: () => void;
}): JSX.Element {
  const name = draft.originalFile.name;
  return (
    <div
      className="mb-2 rounded-2xl border border-nada-border/24 p-3"
      style={{
        background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.85), rgb(var(--nada-surface) / 0.85))",
        backdropFilter: "blur(16px)",
        boxShadow: "inset 0 1px 0 rgb(var(--nada-border) / 0.08), 0 4px 16px rgba(0,0,0,0.30)"
      }}
    >
      <div className="flex gap-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-nada-border/22 bg-nada-bg/50">
          {draft.kind === "image" && draft.previewUrl ? (
            <img alt="" className="h-full w-full object-cover" src={draft.previewUrl} />
          ) : draft.kind === "video" && draft.previewUrl ? (
            <video className="h-full w-full object-cover" muted src={draft.previewUrl} />
          ) : draft.kind === "audio" ? (
            <Music className="text-nada-accent" size={24} />
          ) : (
            <FileText className="text-nada-accent" size={24} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-nada-primary">{name}</p>
          <p className="mt-1 text-[11.5px] text-nada-secondary/70">
            {draft.file.type || "application/octet-stream"} · {formatBytes(draft.originalFile.size)}
          </p>
          {draft.width && draft.height ? (
            <p className="mt-1 text-[11.5px] text-nada-secondary/70">
              {draft.width} × {draft.height}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-[11.5px] text-nada-danger">{error}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-nada-secondary transition-colors hover:bg-nada-surface-elevated/50 hover:text-nada-primary"
          disabled={isSending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="nada-btn-gold inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white transition active:scale-95 disabled:opacity-60"
          disabled={isSending}
          onClick={onSend}
          type="button"
        >
          {isSending ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
          {isSending ? "Sending" : "Send"}
        </button>
      </div>
    </div>
  );
}

function ContactSheet({
  identity,
  onClose,
  onContactAdded,
  onNotify
}: {
  identity: IdentityRecord;
  onClose: () => void;
  onContactAdded: (contact: ContactRecord) => void;
  onNotify?: (msg: string) => void;
}): JSX.Element {
  const [inviteUrl, setInviteUrl] = useState("");
  const [pasteValue, setPasteValue] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const ownInvite = useMemo<InvitePayload>(
    () => ({
      version: 1,
      pubkeyHash: identity.pubkeyHash,
      publicKey: identity.pubkey
    }),
    [identity.pubkey, identity.pubkeyHash]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextInviteUrl = buildInviteUrl(window.location.origin, ownInvite);
    setInviteUrl((current) =>
      current === nextInviteUrl ? current : nextInviteUrl
    );
  }, [ownInvite]);

  const addContact = async (): Promise<void> => {
    setFeedback(null);
    const payload = parseInviteInput(pasteValue);
    if (!payload) {
      setFeedback({ kind: "error", text: "That invite link doesn't look right. Paste the full URL." });
      return;
    }
    if (payload.pubkeyHash === identity.pubkeyHash) {
      setFeedback({ kind: "error", text: "That's your own invite link." });
      return;
    }

    try {
      const contact = await upsertContact(payload);
      onNotify?.(`Added ${contact.localDisplayName}.`);
      onContactAdded(contact);
    } catch {
      setFeedback({ kind: "error", text: "Couldn't save contact. Please try again." });
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Add Contact</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div
        className="mt-5 rounded-2xl border border-nada-accent/30 p-1.5"
        style={{
          background:
            "linear-gradient(135deg, rgb(var(--nada-accent) / 0.18), rgb(var(--nada-surface-elevated)))"
        }}
      >
        <div className="grid place-items-center rounded-xl bg-white p-5">
          {inviteUrl ? (
            <QRCodeSVG
              bgColor="#FFFFFF"
              fgColor="#0A0B12"
              level="M"
              size={184}
              value={inviteUrl}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          className="nada-input h-10 min-w-0 flex-1 px-3 text-xs"
          readOnly
          value={inviteUrl}
        />
        <IconButton
          label="Copy invite"
          onClick={() => {
            if (inviteUrl) {
              void navigator.clipboard.writeText(inviteUrl);
              onNotify?.("Invite link copied.");
            }
          }}
        >
          <Copy size={16} />
        </IconButton>
      </div>

      <div className="mt-6 border-t border-nada-border/10 pt-5">
        <div className="flex items-center gap-2 text-xs text-nada-secondary">
          <QrCode size={14} />
          Paste an invite link to add a contact
        </div>
        <textarea
          className="nada-input mt-3 min-h-24 w-full resize-none p-3 text-sm"
          onChange={(event) => {
            setPasteValue(event.target.value);
            if (feedback) setFeedback(null);
          }}
          placeholder="Paste invite link..."
          value={pasteValue}
        />
        {feedback ? (
          <p
            role={feedback.kind === "error" ? "alert" : "status"}
            className={cn(
              "mt-2 text-xs",
              feedback.kind === "error" ? "text-red-400" : "text-emerald-400"
            )}
          >
            {feedback.text}
          </p>
        ) : null}
        <Button className="mt-3 w-full" onClick={() => void addContact()}>
          Save contact
        </Button>
      </div>
    </Sheet>
  );
}

function GroupSheet({
  contacts,
  onClose,
  onCreate
}: {
  contacts: ContactRecord[];
  onClose: () => void;
  onCreate: (title: string, memberPubkeyHashes: string[]) => void;
}): JSX.Element {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [title, setTitle] = useState("");

  const canCreate = title.trim().length > 0 && selectedMembers.length > 0;

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">New Group</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <input
        className="nada-input mt-5 h-11 w-full px-4 text-sm"
        maxLength={80}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        placeholder="Group name"
        value={title}
      />

      <div className="mt-4 space-y-1.5">
        {contacts.map((contact) => {
          const checked = selectedMembers.includes(contact.pubkeyHash);
          return (
            <label
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-nada-muted"
              key={contact.pubkeyHash}
            >
              <input
                checked={checked}
                className="h-4 w-4 rounded accent-sky-500"
                onChange={(event) => {
                  setSelectedMembers((current) =>
                    event.target.checked
                      ? [...current, contact.pubkeyHash]
                      : current.filter((member) => member !== contact.pubkeyHash)
                  );
                }}
                type="checkbox"
              />
              <Avatar label={contact.localDisplayName} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-nada-primary">
                  {contact.localDisplayName}
                </span>
                <span className="block truncate text-xs text-nada-secondary">
                  {contact.pubkeyHash.slice(0, 20)}...
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-nada-muted p-3 text-xs text-nada-secondary leading-relaxed">
        Group sender keys are a Phase 3 scaffold. Real production groups need
        audited Signal Sender Keys or MLS before launch.
      </div>

      <Button
        className="mt-5 w-full"
        disabled={!canCreate}
        onClick={() => {
          onCreate(title.trim(), selectedMembers);
        }}
      >
        Create group
      </Button>
    </Sheet>
  );
}


const BILLING_PLANS: Array<{
  description: string;
  features: string[];
  label: string;
  plan: PaidBillingPlan;
}> = [
  {
    description: "Launch-ready limits for heavier private messaging.",
    features: ["Larger files", "Longer voice notes", "Premium themes", "More communities"],
    label: "Pro",
    plan: "pro"
  },
  {
    description: "Advanced anonymous growth tools for creators.",
    features: ["Verified anonymous profile", "Community catalog", "Bot API", "ZK analytics"],
    label: "Business",
    plan: "business"
  },
  {
    description: "Private infrastructure for teams and operators.",
    features: ["Self-hosted relay", "SLA", "Admin controls", "Compliance notes"],
    label: "Enterprise",
    plan: "enterprise"
  }
];

function BillingSheet({
  identity,
  onClose
}: {
  identity: IdentityRecord;
  onClose: () => void;
}): JSX.Element {
  const [referralCode, setReferralCode] = useState("");
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState("Checking plan...");

  useEffect(() => {
    let active = true;

    void fetchSubscriptionStatus(identity.pubkeyHash).then((snapshot) => {
      if (!active) {
        return;
      }

      setStatus(snapshot);
      setStatusMessage(snapshot ? `${snapshot.plan} / ${snapshot.status}` : "Relay billing is not configured.");
    });

    return () => {
      active = false;
    };
  }, [identity.pubkeyHash]);

  const checkout = async (plan: PaidBillingPlan): Promise<void> => {
    if (typeof window === "undefined") {
      return;
    }

    setStatusMessage("Opening Stripe Checkout...");
    const trimmedReferralCode = referralCode.trim();
    const response = await startCheckout({
      cancelUrl: window.location.href,
      plan,
      pubkeyHash: identity.pubkeyHash,
      successUrl: window.location.href,
      ...(trimmedReferralCode ? { referralCode: trimmedReferralCode } : {})
    });
    if (response?.checkoutUrl) {
      window.location.assign(response.checkoutUrl);
      return;
    }

    setStatusMessage(response?.message ?? "Checkout is not available.");
  };

  const redeem = async (): Promise<void> => {
    const trimmed = referralCode.trim();
    if (!trimmed) {
      return;
    }

    const response = await redeemReferral({
      pubkeyHash: identity.pubkeyHash,
      referralCode: trimmed
    });
    setStatusMessage(response?.message ?? "Referral could not be redeemed.");
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Plans</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 rounded-xl bg-nada-muted p-4 text-sm text-nada-secondary">
        <div className="mb-2 flex items-center gap-2 font-medium text-nada-primary">
          <CreditCard size={16} />
          {statusMessage}
        </div>
        Paid plans are linked to your public-key hash and Stripe customer ID,
        never message content.
      </div>

      <div className="mt-4 grid gap-2.5">
        {BILLING_PLANS.map((plan) => (
          <div className="nada-surface-elevated rounded-xl p-4" key={plan.plan}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-nada-primary">{plan.label}</h3>
                <p className="mt-1 text-xs text-nada-secondary">{plan.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {plan.features.map((feature) => (
                    <span className="nada-privacy-chip" key={feature}>{feature}</span>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => {
                  void checkout(plan.plan);
                }}
                size="sm"
              >
                Choose
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-nada-border/10 pt-5">
        <div className="flex items-center gap-2 text-xs text-nada-secondary">
          <Gift size={14} />
          Referral
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="nada-input h-10 min-w-0 flex-1 px-3 text-sm"
            onChange={(event) => {
              setReferralCode(event.target.value);
            }}
            placeholder="Referral code"
            value={referralCode}
          />
          <Button onClick={() => void redeem()} variant="secondary" size="sm">
            Redeem
          </Button>
        </div>
      </div>

      {status?.capabilityToken ? (
        <div className="mt-4 rounded-xl bg-nada-muted p-3 text-xs text-nada-secondary">
          Capability token issued locally for this pubkey hash.
        </div>
      ) : null}
    </Sheet>
  );
}

function MigrationSheet({
  chats,
  identity,
  onClose,
  onImported
}: {
  chats: ChatRecord[];
  identity: IdentityRecord;
  onClose: () => void;
  onImported: (chats: ChatRecord[]) => void;
}): JSX.Element {
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState("Export group migration data locally.");

  const exportGroups = (): void => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = buildGroupMigrationPayload({
      groups: chats,
      identity,
      origin: window.location.origin
    });
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setStatus(`${payload.groups.length} groups copied for migration.`);
  };

  const importGroups = async (): Promise<void> => {
    const payload = parseGroupMigrationPayload(importText);
    if (!payload) {
      setStatus("Migration payload is invalid.");
      return;
    }

    for (const group of payload.groups) {
      if (!group.inviteUrl) {
        continue;
      }

      const invite = parseGroupInviteInput(group.inviteUrl);
      if (invite) {
        await upsertGroupFromInvite(identity, invite);
      }
    }

    const records = await nadaDb.chats.orderBy("updatedAt").reverse().toArray();
    onImported(records.filter((record) => record.type === "group"));
    setStatus(`${payload.groups.length} group entries processed locally.`);
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Group Migration</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 rounded-xl bg-nada-muted p-3 text-sm text-nada-secondary">
        {status}
      </div>

      <div className="mt-4 grid gap-2.5">
        <Button onClick={exportGroups} variant="secondary">
          <Download size={16} />
          Export groups
        </Button>
        <textarea
          className="nada-input min-h-36 resize-none p-3 text-sm"
          onChange={(event) => {
            setImportText(event.target.value);
          }}
          placeholder="Paste group migration JSON"
          value={importText}
        />
        <Button onClick={() => void importGroups()} variant="secondary">
          <Upload size={16} />
          Import groups
        </Button>
      </div>
    </Sheet>
  );
}

function ShareSheet({
  displayName,
  identity,
  onClose
}: {
  displayName: string;
  identity: IdentityRecord;
  onClose: () => void;
}): JSX.Element {
  const [inviteUrl, setInviteUrl] = useState("");
  const [status, setStatus] = useState("Share without uploading contacts.");
  const ownInvite = useMemo<InvitePayload>(
    () => ({
      version: 1,
      pubkeyHash: identity.pubkeyHash,
      publicKey: identity.pubkey
    }),
    [identity.pubkey, identity.pubkeyHash]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextInviteUrl = buildInviteUrl(window.location.origin, ownInvite);
    setInviteUrl((current) =>
      current === nextInviteUrl ? current : nextInviteUrl
    );
  }, [ownInvite]);

  const share = async (): Promise<void> => {
    if (!inviteUrl) {
      return;
    }

    const payload = buildShareCardPayload({
      version: 1,
      pubkeyHash: identity.pubkeyHash,
      displayName,
      inviteUrl
    });
    const usedNativeShare = await shareInviteCard(payload);
    setStatus(usedNativeShare ? "Native share sheet opened." : "Invite text copied.");
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Share NADA</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-nada-accent/10 via-nada-surface to-nada-muted p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nada-secondary">
          NADA
        </p>
        <h3 className="mt-3 text-lg font-semibold text-nada-primary">{displayName}</h3>
        <p className="mt-1.5 text-sm text-nada-secondary">
          Anonymous messaging. No phone number. No email.
        </p>
        <p className="mt-4 break-all text-xs text-nada-secondary/70 font-mono">
          {identity.pubkeyHash}
        </p>
      </div>

      <p className="mt-4 text-xs text-nada-secondary">{status}</p>
      <Button className="mt-4 w-full" onClick={() => void share()}>
        <Share2 size={16} />
        Share invite card
      </Button>
    </Sheet>
  );
}

function SettingsSheet({
  identity,
  onOpenBilling,
  onOpenMigration,
  onOpenShare,
  onOpenGhostModal,
  onOpenMoodModal,
  ghostMode,
  mood,
  onClose,
  displayName,
  onDisplayNameChange,
  notificationSettings,
  onNotificationSettingsChange,
  onPreviewNotificationTone
}: {
  identity: IdentityRecord;
  onOpenBilling: () => void;
  onOpenMigration: () => void;
  onOpenShare: () => void;
  onOpenGhostModal: () => void;
  onOpenMoodModal: () => void;
  ghostMode: boolean;
  mood: string;
  onClose: () => void;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  notificationSettings: NotificationSettings;
  onNotificationSettingsChange: (settings: NotificationSettings) => void;
  onPreviewNotificationTone: (tone: NotificationTone) => void;
}): JSX.Element {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(displayName);

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-nada-primary" style={{ letterSpacing: "-0.3px" }}>Settings</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      {/* Appearance — Obsidian Gold theme card */}
      <div
        className="mt-5 rounded-2xl border border-nada-border/[.08] p-4"
        style={{ background: "linear-gradient(135deg, rgb(var(--nada-surface-elevated)), rgb(var(--nada-surface-3)))" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))" }}>
            <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-sm font-semibold text-nada-primary">Obsidian Gold</p>
            <p className="text-xs text-nada-secondary/[.60]">Dark mode · Premium theme</p>
          </div>
          <div className="ml-auto flex gap-1.5">
            <div className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--nada-bg))", border: "1px solid rgb(var(--nada-border) / 0.1)" }} />
            <div className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--nada-accent))" }} />
            <div className="h-4 w-4 rounded-full" style={{ background: "rgb(var(--nada-gold-dark))" }} />
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">Profile</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <div className="flex items-center justify-between border-b border-nada-border/[.08] px-4 py-3.5">
            <div className="flex flex-1 flex-col">
              <span className="text-xs text-nada-secondary/[.60]">Display Name</span>
              {isEditingName ? (
                <input
                  autoFocus
                  className="mt-1 w-full rounded-md border-b border-nada-accent/60 bg-transparent text-sm font-semibold text-nada-primary outline-none focus:border-nada-accent"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => {
                    setIsEditingName(false);
                    if (tempName.trim() && tempName !== displayName) {
                      onDisplayNameChange(tempName.trim());
                    } else if (!tempName.trim()) {
                      setTempName(displayName);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      setTempName(displayName);
                      setIsEditingName(false);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTempName(displayName);
                    setIsEditingName(true);
                  }}
                  className="mt-0.5 cursor-text text-left text-sm font-semibold text-nada-primary hover:text-nada-accent transition-colors"
                >
                  {displayName}
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label={isEditingName ? "Save display name" : "Edit display name"}
              onClick={() => {
                if (isEditingName) {
                  setIsEditingName(false);
                  if (tempName.trim() && tempName !== displayName) {
                    onDisplayNameChange(tempName.trim());
                  }
                } else {
                  setTempName(displayName);
                  setIsEditingName(true);
                }
              }}
              className="ml-2 p-2 text-nada-accent/70 hover:text-nada-accent transition-colors"
            >
              <Edit3 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">Account</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <div className="flex items-center justify-between border-b border-nada-border/[.08] px-4 py-3">
            <span className="text-xs text-nada-secondary/[.60]">Pubkey hash</span>
            <span className="max-w-[140px] truncate font-mono text-xs text-nada-secondary/[.80]">{identity.pubkeyHash.slice(0, 20)}…</span>
          </div>
          <div className="flex items-center justify-between border-b border-nada-border/[.08] px-4 py-3">
            <span className="text-xs text-nada-secondary/[.60]">Seed backup</span>
            <span className="text-xs text-nada-secondary/[.80]">{identity.seedBackupStatus}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-nada-secondary/[.60]">Plan</span>
            <span className="text-xs text-nada-accent font-semibold">Free</span>
          </div>
        </div>
      </div>

      {/* Privacy section */}
      <div className="mt-5">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">Privacy</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <button
            className="flex w-full items-center justify-between border-b border-nada-border/[.08] px-4 py-3.5 text-left hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenGhostModal}
          >
            <div className="flex items-center gap-3">
              <Ghost size={15} className="text-nada-accent/70" />
              <div>
                <p className="text-sm font-medium text-nada-primary">Ghost Mode</p>
                <p className="text-xs text-nada-secondary/[.50]">Hide typing &amp; online status</p>
              </div>
            </div>
            <span className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-bold",
              ghostMode ? "bg-nada-accent/15 text-nada-accent" : "bg-nada-surface-elevated text-nada-secondary/[.50]"
            )}>
              {ghostMode ? "ON" : "OFF"}
            </span>
          </button>
          <button
            className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenMoodModal}
          >
            <div className="flex items-center gap-3">
              <Flame size={15} className="text-nada-accent/70" />
              <div>
                <p className="text-sm font-medium text-nada-primary">Mood Status</p>
                <p className="text-xs text-nada-secondary/[.50]">Visible to yourself</p>
              </div>
            </div>
            <span className="rounded-full bg-nada-surface-elevated px-2.5 py-0.5 text-[10px] font-medium text-nada-secondary/[.60]">
              {mood}
            </span>
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">
          Notifications
        </p>
        <div className="rounded-2xl border border-nada-border/[.08] p-4" style={{ background: "rgb(var(--nada-surface))" }}>
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-nada-accent/12 text-nada-accent">
              <Bell size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-nada-primary">Push notification settings</p>
              <p className="mt-0.5 text-xs text-nada-secondary/[.55]">
                Tune alerts without exposing message content.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-nada-secondary/[.72]">Message tone</span>
                <button
                  className="rounded-full bg-white/[.06] px-3 py-1 text-[11px] font-semibold text-nada-accent transition hover:bg-white/[.09]"
                  onClick={() => onPreviewNotificationTone("message")}
                  type="button"
                >
                  Preview
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_SOUND_CHOICES.map((choice) => (
                  <button
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                      notificationSettings.notificationTone === choice
                        ? "border-nada-accent/45 bg-nada-accent/15 text-nada-primary"
                        : "border-white/10 bg-white/[.04] text-nada-secondary/[.72] hover:bg-white/[.07]"
                    )}
                    key={choice}
                    onClick={() =>
                      onNotificationSettingsChange({
                        ...notificationSettings,
                        notificationTone: choice
                      })
                    }
                    type="button"
                  >
                    {notificationToneLabel(choice)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-nada-secondary/[.72]">Call ringtone</span>
                <button
                  className="rounded-full bg-white/[.06] px-3 py-1 text-[11px] font-semibold text-nada-accent transition hover:bg-white/[.09]"
                  onClick={() => onPreviewNotificationTone("call")}
                  type="button"
                >
                  Preview
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_RINGTONE_CHOICES.map((choice) => (
                  <button
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                      notificationSettings.ringtone === choice
                        ? "border-nada-accent/45 bg-nada-accent/15 text-nada-primary"
                        : "border-white/10 bg-white/[.04] text-nada-secondary/[.72] hover:bg-white/[.07]"
                    )}
                    key={choice}
                    onClick={() =>
                      onNotificationSettingsChange({
                        ...notificationSettings,
                        ringtone: choice
                      })
                    }
                    type="button"
                  >
                    {notificationRingtoneLabel(choice)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3 py-3 text-left transition",
                  notificationSettings.vibration
                    ? "border-nada-accent/35 bg-nada-accent/12"
                    : "border-white/10 bg-white/[.04]"
                )}
                onClick={() =>
                  onNotificationSettingsChange({
                    ...notificationSettings,
                    vibration: !notificationSettings.vibration
                  })
                }
                type="button"
              >
                <span>
                  <span className="block text-xs font-semibold text-nada-primary">Vibration</span>
                  <span className="mt-0.5 block text-[11px] text-nada-secondary/[.52]">
                    {notificationSettings.vibration ? "On" : "Off"}
                  </span>
                </span>
                <span className={cn(
                  "h-5 w-9 rounded-full p-0.5 transition",
                  notificationSettings.vibration ? "bg-nada-accent" : "bg-white/12"
                )}>
                  <span className={cn(
                    "block h-4 w-4 rounded-full bg-white transition",
                    notificationSettings.vibration && "translate-x-4"
                  )} />
                </span>
              </button>
              <button
                className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-left transition hover:bg-white/[.07]"
                onClick={() =>
                  onNotificationSettingsChange({
                    ...notificationSettings,
                    previewPrivacy:
                      notificationSettings.previewPrivacy === "private" ? "full" : "private"
                  })
                }
                type="button"
              >
                <span className="flex items-center gap-2 text-xs font-semibold text-nada-primary">
                  {notificationSettings.previewPrivacy === "private" ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                  Preview privacy
                </span>
                <span className="mt-1 block text-[11px] text-nada-secondary/[.52]">
                  {notificationSettings.previewPrivacy === "private"
                    ? "Hide sender and message text"
                    : "Show notification previews"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <SettingsSheetSection
        items={[
          { icon: <Image size={15} />, label: "Theme", value: "Obsidian Gold", description: "Premium dark glass mode" },
          { icon: <Image size={15} />, label: "Chat wallpaper", value: "Per-chat", description: "Set from the chat menu" },
          { icon: <MessageCircle size={15} />, label: "Bubble style", value: "Soft glass", description: "Readable, compact, private" },
          { icon: <Flame size={15} />, label: "Accent color", value: "Purple + gold", description: "Primary actions and identity glow" }
        ]}
        title="Appearance"
      />

      <SettingsSheetSection
        items={[
          { icon: <Download size={15} />, label: "Media auto-download", value: "Manual", description: "Avoids unwanted traces" },
          { icon: <Trash2 size={15} />, label: "Clear cache", value: "Coming soon", description: "Remove local media previews" },
          { icon: <ShieldAlert size={15} />, label: "Encrypted local storage", value: "Active", description: "Messages stay on this device" }
        ]}
        title="Storage"
      />

      <SettingsSheetSection
        items={[
          { icon: <ShieldAlert size={15} />, label: "Verify contact key", value: "Manual", description: "Compare fingerprints with a contact" },
          { icon: <Upload size={15} />, label: "Export encrypted backup", value: "Coming soon", description: "Backup without plaintext export" },
          { icon: <QrCode size={15} />, label: "Recovery phrase", value: identity.seedBackupStatus, description: "Protect access to local identity" },
          { icon: <WifiOff size={15} />, label: "Active sessions", value: "This device", description: "No cloud account sessions" }
        ]}
        title="Security"
      />

      {/* Actions */}
      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">More</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <button
            className="flex w-full items-center gap-3 border-b border-nada-border/[.08] px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenBilling}
          >
            <CreditCard size={15} className="text-nada-accent/70" />
            Plans &amp; Billing
            <ChevronDown size={14} className="ml-auto rotate-[-90deg] text-nada-secondary/[.30]" />
          </button>
          <button
            className="flex w-full items-center gap-3 border-b border-nada-border/[.08] px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenShare}
          >
            <Share2 size={15} className="text-nada-accent/70" />
            Share invite card
            <ChevronDown size={14} className="ml-auto rotate-[-90deg] text-nada-secondary/[.30]" />
          </button>
          <button
            className="flex w-full items-center gap-3 px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
            onClick={onOpenMigration}
          >
            <Download size={15} className="text-nada-accent/70" />
            Group migration
            <ChevronDown size={14} className="ml-auto rotate-[-90deg] text-nada-secondary/[.30]" />
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-nada-border/[.08] p-4 text-sm text-nada-secondary/[.60]" style={{ background: "rgb(var(--nada-surface))" }}>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-nada-primary/80">
          <ShieldAlert size={15} className="text-nada-accent/60" />
          IP anonymity notice
        </div>
        A browser PWA cannot control network routing. Use Tor Browser, Orbot,
        VPN, or a future mixnet relay for IP-level anonymity.
      </div>

      <SettingsSheetSection
        items={[
          { icon: <Settings size={15} />, label: "App version", value: "Launch build", description: "NADA privacy-first messenger" },
          { icon: <ShieldAlert size={15} />, label: "Privacy principles", value: "Local-first", description: "No phone, no email, no identity graph" },
          { icon: <FileText size={15} />, label: "Terms/security notes", value: "Review", description: "Security docs and limitations" }
        ]}
        title="About NADA"
      />
    </Sheet>
  );
}

function SettingsSheetSection({
  items,
  title
}: {
  items: Array<{
    description: string;
    icon: ReactNode;
    label: string;
    value: string;
  }>;
  title: string;
}): JSX.Element {
  return (
    <div className="mt-5">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase text-nada-text-muted">{title}</p>
      <div className="overflow-hidden rounded-2xl border border-nada-border/[.08] bg-nada-surface/80">
        {items.map((item, index) => (
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-3.5",
              index < items.length - 1 && "border-b border-nada-border/[.07]"
            )}
            key={`${title}-${item.label}`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-nada-accent/12 text-nada-accent">
              {item.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-nada-primary">{item.label}</span>
              <span className="block truncate text-[11.5px] text-nada-text-muted">{item.description}</span>
            </span>
            <span className="shrink-0 rounded-full bg-nada-surface-elevated px-2.5 py-0.5 text-[10px] font-bold text-nada-secondary/[.65]">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


function Sheet({
  children,
  onClose
}: {
  children: ReactNode;
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="nada-overlay fixed inset-0 z-overlay overflow-hidden p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pl-[calc(env(safe-area-inset-left)+0.75rem)] md:p-3"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="nada-sheet mx-auto flex h-full w-full max-w-none flex-col overflow-y-auto rounded-2xl p-4 sm:max-w-md sm:p-5 md:ml-auto"
        exit={{ y: 32, opacity: 0 }}
        initial={{ y: 32, opacity: 0 }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        transition={{ type: "spring", damping: 22, stiffness: 420 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function SafetyReportSheet({
  onClose,
  onSubmit,
  target
}: {
  onClose: () => void;
  onSubmit: (category: SafetyReport["category"], notes: string) => void;
  target: ReportTarget;
}): JSX.Element {
  const [category, setCategory] = useState<SafetyReport["category"]>("spam");
  const [notes, setNotes] = useState("");

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase text-nada-danger/80">Safety report</p>
          <h2 className="text-lg font-semibold text-nada-primary">Report {target.type}</h2>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="mt-5 rounded-2xl border border-red-500/15 bg-red-500/[0.07] p-4">
        <p className="text-sm font-bold text-nada-primary">{target.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-nada-secondary/65">
          Reports are stored in your local safety log so you can block, review, and escalate patterns without mixing them into DMs.
        </p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {([
          ["spam", "Spam"],
          ["harassment", "Harassment"],
          ["impersonation", "Impersonation"],
          ["illegal", "Illegal"],
          ["other", "Other"]
        ] as Array<[SafetyReport["category"], string]>).map(([value, label]) => (
          <button
            className={cn(
              "rounded-2xl border px-3 py-3 text-sm font-semibold transition",
              category === value
                ? "border-red-400/45 bg-red-500/12 text-red-200"
                : "border-nada-border/10 bg-nada-surface-elevated/45 text-nada-secondary/75"
            )}
            key={value}
            onClick={() => setCategory(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <label className="mt-5 block">
        <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Notes</span>
        <textarea
          className="nada-input-dark min-h-[112px] w-full resize-none px-4 py-3 text-sm"
          maxLength={360}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add context for yourself..."
          value={notes}
        />
      </label>
      <div className="mt-5 flex gap-3">
        <button
          className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white"
          onClick={() => onSubmit(category, notes)}
          type="button"
        >
          Save report
        </button>
      </div>
    </Sheet>
  );
}

function LaunchOnboardingSheet({
  contactsCount,
  groupsCount,
  hasPostedStatus,
  onClose,
  onEnableNotifications,
  onOpenCommunity
}: {
  contactsCount: number;
  groupsCount: number;
  hasPostedStatus: boolean;
  onClose: () => void;
  onEnableNotifications: () => void;
  onOpenCommunity: () => void;
}): JSX.Element {
  const steps = [
    { done: contactsCount > 0, label: "Add an anonymous contact", meta: "Start a direct encrypted lane." },
    { done: groupsCount > 0, label: "Create a private group", meta: "Invite-only rooms for trusted people." },
    { done: hasPostedStatus, label: "Post a status", meta: "Share a vanishing thought." },
    { done: false, label: "Enable notifications", meta: "Never miss calls or launch messages." }
  ];

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="nada-overlay fixed inset-0 z-overlay grid place-items-end p-3 sm:place-items-center"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-nada-border/12 bg-nada-surface p-5 shadow-2xl"
        exit={{ y: 24, opacity: 0, scale: 0.98 }}
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-nada-accent">Launch setup</p>
            <h2 className="mt-1 text-xl font-bold text-nada-primary">Make NADA feel alive.</h2>
            <p className="mt-2 text-sm leading-relaxed text-nada-text-muted">
              A short setup pass for the anonymous flows people expect on day one.
            </p>
          </div>
          <IconButton label="Close onboarding" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-5 grid gap-2">
          {steps.map((step) => (
            <div className="nada-settings-card flex items-center gap-3" key={step.label}>
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-2xl font-mono text-[10px] font-bold",
                  step.done ? "bg-n-success/14 text-n-success" : "bg-nada-accent/12 text-nada-accent"
                )}
              >
                {step.done ? "OK" : "GO"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-nada-primary">{step.label}</span>
                <span className="block text-xs text-nada-text-muted">{step.meta}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
          <button
            className="rounded-2xl bg-nada-accent px-4 py-3 text-sm font-bold text-white shadow-accent-glow"
            onClick={onEnableNotifications}
            type="button"
          >
            Enable alerts
          </button>
        </div>
        <button
          className="mt-3 w-full rounded-2xl border border-nada-accent/20 bg-nada-accent/[0.08] px-4 py-3 text-sm font-bold text-nada-accent transition-colors hover:bg-nada-accent/[0.14]"
          onClick={onOpenCommunity}
          type="button"
        >
          Explore communities
        </button>
      </motion.div>
    </motion.div>
  );
}

function ConfirmChatActionDialog({
  action,
  chatTitle,
  onCancel,
  onConfirm
}: {
  action: PendingChatAction["action"];
  chatTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const isDelete = action === "delete" || action === "delete-group";
  const copy =
    action === "archive"
      ? "Archive this chat? It will move out of your main chat list."
      : action === "unarchive"
        ? "Unarchive this chat? It will return to your main chat list."
        : action === "delete-group"
          ? "Delete this group? Only the creator can do this. Members will receive a delete notice when they sync."
          : "Delete this chat locally? Messages in this conversation will be removed from this device.";
  const confirmLabel =
    action === "archive"
      ? "Archive"
      : action === "unarchive"
        ? "Unarchive"
        : action === "delete-group"
          ? "Delete group"
          : "Delete";
  const title = action === "delete-group" ? "Delete group" : `${confirmLabel} chat`;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="nada-overlay fixed inset-0 z-overlay grid place-items-center p-4"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-3xl border border-nada-border/10 bg-nada-surface p-5 shadow-2xl"
        exit={{ y: 16, opacity: 0, scale: 0.98 }}
        initial={{ y: 16, opacity: 0, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            className={cn(
              "grid h-11 w-11 place-items-center rounded-2xl",
              isDelete ? "bg-red-500/12 text-red-300" : "bg-nada-accent/12 text-nada-accent"
            )}
          >
            {isDelete ? <Trash2 size={20} /> : <Archive size={20} />}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-nada-primary">
              {title}
            </h3>
            <p className="truncate text-xs text-nada-secondary/55">{chatTitle}</p>
          </div>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-nada-secondary/75">
          {copy}
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={cn(
              "flex-1 rounded-2xl px-4 py-3 text-sm font-bold",
              isDelete ? "bg-red-500 text-white" : "bg-nada-accent text-black"
            )}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SettingsDashboardPreview({
  displayName,
  ghostMode,
  identity,
  mood,
  onOpenBilling,
  onOpenGhostModal,
  onOpenMigration,
  onOpenMoodModal,
  onOpenSettings,
  onOpenShare
}: {
  displayName: string;
  ghostMode: boolean;
  identity: IdentityRecord;
  mood: string;
  onOpenBilling: () => void;
  onOpenGhostModal: () => void;
  onOpenMigration: () => void;
  onOpenMoodModal: () => void;
  onOpenSettings: () => void;
  onOpenShare: () => void;
}): JSX.Element {
  return (
    <div className="nada-settings-dashboard animate-fade-in">
      <div className="nada-premium-card overflow-hidden p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-2xl nada-logo-aura">
            <img src="/logo.png" alt="NADA" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-nada-primary">{displayName}</p>
            <p className="truncate font-mono text-[11px] text-nada-text-muted">
              {identity.pubkeyHash.slice(0, 18)}...
            </p>
          </div>
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl border border-nada-border/10 bg-nada-surface-elevated/60 text-nada-accent transition hover:border-nada-accent/35"
            onClick={onOpenSettings}
            type="button"
          >
            <Edit3 size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {["No name", "No number", "Local keys", "Encrypted"].map((label) => (
            <span className="nada-privacy-chip" key={label}>{label}</span>
          ))}
        </div>
      </div>

      <SettingsPreviewSection title="Privacy">
        <SettingsPreviewButton
          icon={<Ghost size={17} />}
          label="Ghost Mode"
          value={ghostMode ? "On" : "Off"}
          description="Hide typing and online traces."
          onClick={onOpenGhostModal}
        />
        <SettingsPreviewButton
          icon={<ShieldAlert size={17} />}
          label="Privacy Shield"
          value="Ready"
          description="Blur sensitive chat content on demand."
          onClick={onOpenSettings}
        />
        <SettingsPreviewButton
          icon={<Flame size={17} />}
          label="Mood Status"
          value={mood}
          description="Visible only inside your anonymous profile."
          onClick={onOpenMoodModal}
        />
      </SettingsPreviewSection>

      <SettingsPreviewSection title="Identity">
        <SettingsPreviewButton
          icon={<QrCode size={17} />}
          label="Share invite card"
          value="Private"
          description="Send an invite without exposing contacts."
          onClick={onOpenShare}
        />
        <SettingsPreviewButton
          icon={<Download size={17} />}
          label="Group migration"
          value="Local"
          description="Export invite-only rooms safely."
          onClick={onOpenMigration}
        />
      </SettingsPreviewSection>

      <SettingsPreviewSection title="Product">
        <SettingsPreviewButton
          icon={<CreditCard size={17} />}
          label="Plans & Billing"
          value="Free"
          description="Paid plans never touch message content."
          onClick={onOpenBilling}
        />
        <SettingsPreviewButton
          icon={<Settings size={17} />}
          label="Full settings"
          value="Open"
          description="Security, appearance, storage, and about."
          onClick={onOpenSettings}
        />
      </SettingsPreviewSection>

      <div className="rounded-2xl border border-nada-accent/15 bg-nada-accent/[0.08] p-4 text-[12.5px] leading-relaxed text-nada-secondary/78">
        <div className="mb-1 flex items-center gap-2 font-bold text-nada-accent">
          <ShieldAlert size={15} />
          IP anonymity notice
        </div>
        A browser PWA cannot control network routing. Use Tor Browser, Orbot, VPN, or a future mixnet relay for IP-level anonymity.
      </div>
    </div>
  );
}

function SettingsPreviewSection({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}): JSX.Element {
  return (
    <section>
      <p className="mb-2 px-1 text-[11px] font-bold uppercase text-nada-text-muted">{title}</p>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function SettingsPreviewButton({
  description,
  icon,
  label,
  onClick,
  value
}: {
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  value: string;
}): JSX.Element {
  return (
    <button
      className="nada-settings-card flex w-full items-center gap-3 text-left"
      onClick={onClick}
      type="button"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-nada-primary">{label}</span>
        <span className="block truncate text-[12px] text-nada-text-muted">{description}</span>
      </span>
      <span className="shrink-0 rounded-full bg-nada-surface/70 px-2.5 py-1 text-[10.5px] font-bold text-nada-secondary/70">
        {value}
      </span>
    </button>
  );
}

const COMMUNITY_CATEGORY_OPTIONS = [
  "Tech",
  "Sports",
  "Music",
  "Gaming",
  "Business",
  "Education",
  "Lifestyle",
  "Local"
] as const;

function CommunitiesHome({
  communities,
  identity,
  onCopyInvite,
  onCreateCommunity,
  onDeleteCommunity,
  onJoinCommunity,
  onLeaveCommunity,
  onPostCommunity,
  onReportCommunity
}: {
  communities: CommunityRecord[];
  identity: IdentityRecord;
  onCopyInvite: (community: CommunityRecord) => void;
  onCreateCommunity: () => void;
  onDeleteCommunity: (communityId: string) => void;
  onJoinCommunity: (communityId: string) => void;
  onLeaveCommunity: (communityId: string) => void;
  onPostCommunity: (communityId: string, channelId: string, body: string) => void;
  onReportCommunity: (community: CommunityRecord) => void;
}): JSX.Element {
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(communities[0]?.id ?? null);
  const [selectedChannelId, setSelectedChannelId] = useState("general");
  const [postDraft, setPostDraft] = useState("");
  const [pendingCommunityAction, setPendingCommunityAction] = useState<{
    action: "delete" | "leave";
    community: CommunityRecord;
  } | null>(null);
  const featured = [
    ["Tech Node", "Build, ship, and share anonymous product notes", "Tech"],
    ["Match Room", "Sports talk without handles or real names", "Sports"],
    ["Study Circle", "Quiet learning rooms for private progress", "Education"]
  ];
  const selectedCommunity =
    communities.find((community) => community.id === selectedCommunityId) ?? communities[0] ?? null;
  const selectedCommunityIsAdmin = Boolean(
    selectedCommunity?.admins.includes(identity.pubkeyHash)
  );
  const visiblePosts = selectedCommunity
    ? selectedCommunity.posts.filter((post) => post.channelId === selectedChannelId)
    : [];

  useEffect(() => {
    if (!selectedCommunity && communities[0]) {
      setSelectedCommunityId(communities[0].id);
    }
  }, [communities, selectedCommunity]);

  useEffect(() => {
    if (!selectedCommunity) return;
    const firstChannel = selectedCommunity.channels[0]?.id ?? "general";
    if (!selectedCommunity.channels.some((channel) => channel.id === selectedChannelId)) {
      setSelectedChannelId(firstChannel);
    }
  }, [selectedChannelId, selectedCommunity]);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      <div className="nada-premium-card mb-5 p-5">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-nada-accent/14 text-nada-accent">
          <MessageCircle size={24} />
        </div>
        <p className="text-[11px] font-bold uppercase text-nada-accent">Communities</p>
        <h2 className="mt-1 text-[20px] font-bold text-nada-primary">Public interests. Private identity.</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-nada-text-muted">
          Create interest spaces like tech, sports, music, or local circles while keeping NADA identity separate from real life.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="nada-privacy-chip">Topic-based</span>
          <span className="nada-privacy-chip">Anonymous profile</span>
          <span className="nada-privacy-chip">Local-first</span>
        </div>
        <button
          className="nada-btn-gold mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[13px] font-bold"
          onClick={onCreateCommunity}
          type="button"
        >
          <Plus size={16} />
          Add community
        </button>
      </div>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase text-nada-text-muted">My Communities</p>
          <span className="rounded-full bg-nada-surface-elevated/70 px-2 py-1 text-[10px] font-bold text-nada-secondary/60">
            {communities.length}
          </span>
        </div>
        {communities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-nada-border/10 bg-nada-surface-elevated/35 px-4 py-8 text-center">
            <Users className="mx-auto mb-3 h-7 w-7 text-nada-secondary/35" />
            <p className="text-[14px] font-bold text-nada-primary">No communities yet</p>
            <p className="mt-1 text-[12.5px] text-nada-text-muted">
              Add a tech, sports, music, or local community to begin.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {communities.map((community) => (
              <button
                className={cn(
                  "nada-settings-card flex items-center gap-3 text-left",
                  selectedCommunity?.id === community.id && "ring-1 ring-nada-accent/25"
                )}
                key={community.id}
                onClick={() => {
                  setSelectedCommunityId(community.id);
                  setSelectedChannelId(community.channels[0]?.id ?? "general");
                }}
                type="button"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
                  <Users size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-nada-primary">{community.title}</span>
                  <span className="block truncate text-[12px] text-nada-text-muted">{community.description}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-nada-surface/70 px-2 py-0.5 text-[10px] font-bold text-nada-accent">
                      {community.category}
                    </span>
                    <span className="rounded-full bg-nada-surface/70 px-2 py-0.5 text-[10px] font-bold text-nada-secondary/60">
                      {community.privacy === "invite-only" ? "Invite-only" : "Open"}
                    </span>
                  </span>
                </span>
                <span className="text-right text-[11px] font-semibold text-nada-secondary/55">
                  {community.memberCount} member{community.memberCount === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedCommunity ? (
        <section className="mb-5 rounded-3xl border border-nada-border/10 bg-nada-surface-elevated/35 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-nada-accent">
                {selectedCommunity.category} community
              </p>
              <h3 className="truncate text-lg font-bold text-nada-primary">{selectedCommunity.title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-nada-text-muted">
                {selectedCommunity.description}
              </p>
            </div>
            <button
              className="grid h-10 w-10 place-items-center rounded-2xl bg-nada-muted text-nada-secondary"
              onClick={() => onReportCommunity(selectedCommunity)}
              type="button"
            >
              <Flag size={16} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedCommunity.topics.map((topic) => (
              <span className="nada-privacy-chip" key={topic}>{topic}</span>
            ))}
            {selectedCommunity.admins.includes(identity.pubkeyHash) ? (
              <span className="nada-privacy-chip border-nada-accent/20 bg-nada-accent/[0.08] text-nada-accent">
                Admin
              </span>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-2xl border border-nada-border/10 bg-nada-surface px-3 py-2.5 text-sm font-bold text-nada-primary"
              onClick={() => onCopyInvite(selectedCommunity)}
              type="button"
            >
              Copy invite
            </button>
            <button
              className={cn(
                "flex-1 rounded-2xl px-3 py-2.5 text-sm font-bold",
                selectedCommunity.joined
                  ? "bg-nada-muted text-nada-secondary"
                  : "bg-nada-accent text-white"
              )}
              onClick={() => {
                if (selectedCommunity.joined) {
                  setPendingCommunityAction({
                    action: "leave",
                    community: selectedCommunity
                  });
                }
                else onJoinCommunity(selectedCommunity.id);
              }}
              type="button"
            >
              {selectedCommunity.joined ? "Leave" : "Join"}
            </button>
          </div>
          {selectedCommunityIsAdmin ? (
            <button
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 text-sm font-bold text-red-200 transition hover:bg-red-500/15"
              onClick={() => {
                setPendingCommunityAction({
                  action: "delete",
                  community: selectedCommunity
                });
              }}
              type="button"
            >
              <Trash2 size={16} />
              Delete community
            </button>
          ) : null}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {selectedCommunity.channels.map((channel) => (
              <button
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition",
                  selectedChannelId === channel.id
                    ? "bg-nada-accent text-black"
                    : "bg-nada-surface text-nada-secondary/70"
                )}
                key={channel.id}
                onClick={() => setSelectedChannelId(channel.id)}
                type="button"
              >
                {channel.title}
              </button>
            ))}
          </div>
          {selectedCommunity.joined ? (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const body = postDraft.trim();
                if (!body) return;
                onPostCommunity(selectedCommunity.id, selectedChannelId, body);
                setPostDraft("");
              }}
            >
              <input
                className="nada-input-dark h-11 min-w-0 flex-1 text-sm"
                maxLength={280}
                onChange={(event) => setPostDraft(event.target.value)}
                placeholder="Post to this channel..."
                value={postDraft}
              />
              <button
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-nada-accent text-white disabled:opacity-40"
                disabled={!postDraft.trim()}
                type="submit"
              >
                <Send size={16} />
              </button>
            </form>
          ) : (
            <p className="mt-4 rounded-2xl bg-nada-surface/70 px-4 py-3 text-[12.5px] text-nada-text-muted">
              Join this community to post without exposing a real-world identity.
            </p>
          )}
          <div className="mt-4 grid gap-2">
            {visiblePosts.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-nada-border/10 px-4 py-6 text-center text-[12.5px] text-nada-text-muted">
                No posts in this channel yet.
              </p>
            ) : (
              visiblePosts.map((post) => (
                <article className="rounded-2xl bg-nada-surface/70 px-4 py-3" key={post.id}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-nada-accent">{post.authorName}</span>
                    <span className="text-[10px] text-nada-secondary/45">
                      {formatRelativeTime(post.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-nada-primary/90">{post.body}</p>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      <AnimatePresence>
        {pendingCommunityAction ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[1200] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setPendingCommunityAction(null)}
          >
            <motion.div
              animate={{ y: 0, opacity: 1, scale: 1 }}
              className="w-full max-w-sm rounded-3xl border border-nada-border/10 bg-nada-surface p-5 shadow-2xl"
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              initial={{ y: 16, opacity: 0, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-2xl",
                    pendingCommunityAction.action === "delete"
                      ? "bg-red-500/12 text-red-300"
                      : "bg-nada-accent/12 text-nada-accent"
                  )}
                >
                  {pendingCommunityAction.action === "delete" ? (
                    <Trash2 size={20} />
                  ) : (
                    <Users size={20} />
                  )}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-nada-primary">
                    {pendingCommunityAction.action === "delete"
                      ? "Delete community"
                      : "Leave community"}
                  </h3>
                  <p className="truncate text-xs text-nada-secondary/55">
                    {pendingCommunityAction.community.title}
                  </p>
                </div>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-nada-secondary/75">
                {pendingCommunityAction.action === "delete"
                  ? "This removes the community from your NADA space and deletes its local posts."
                  : "You can rejoin later with an invite, but posting will be disabled until then."}
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
                  onClick={() => setPendingCommunityAction(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={cn(
                    "flex-1 rounded-2xl px-4 py-3 text-sm font-bold",
                    pendingCommunityAction.action === "delete"
                      ? "bg-red-500 text-white"
                      : "bg-nada-accent text-white"
                  )}
                  onClick={() => {
                    if (pendingCommunityAction.action === "delete") {
                      onDeleteCommunity(pendingCommunityAction.community.id);
                    } else {
                      onLeaveCommunity(pendingCommunityAction.community.id);
                    }
                    setPendingCommunityAction(null);
                  }}
                  type="button"
                >
                  {pendingCommunityAction.action === "delete" ? "Delete" : "Leave"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="grid gap-2">
        <p className="px-1 text-[11px] font-bold uppercase text-nada-text-muted">Explore Templates</p>
        {featured.map(([name, meta, badge]) => (
          <div className="nada-settings-card flex items-center gap-3" key={name}>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
              <BarChart2 size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-nada-primary">{name}</span>
              <span className="block text-[12px] text-nada-text-muted">{meta}</span>
            </span>
            <span className="rounded-full bg-nada-surface/70 px-2 py-1 text-[10px] font-bold text-nada-secondary/60">
              {badge}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function CommunityCreateSheet({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (draft: CommunityDraft) => void;
}): JSX.Element {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Tech");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<"open" | "invite-only">("open");
  const canCreate = title.trim().length > 0 && description.trim().length > 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase text-nada-accent">New community</p>
          <h2 className="text-lg font-semibold text-nada-primary">Add community</h2>
        </div>
        <button
          className="grid h-10 w-10 place-items-center rounded-2xl bg-nada-muted text-nada-secondary"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>
      </div>
      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Community name</span>
          <input
            autoFocus
            className="nada-input-dark h-12 w-full text-[15px]"
            maxLength={54}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Tech community, Sports hub..."
            value={title}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Description</span>
          <textarea
            className="nada-input-dark min-h-[96px] w-full resize-none px-4 py-3 text-[14px]"
            maxLength={180}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What should people talk about here?"
            value={description}
          />
        </label>
        <div>
          <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Category</span>
          <div className="grid grid-cols-2 gap-2">
            {COMMUNITY_CATEGORY_OPTIONS.map((option) => (
              <button
                className={cn(
                  "rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
                  category === option
                    ? "border-nada-accent/45 bg-nada-accent/12 text-nada-accent"
                    : "border-nada-border/10 bg-nada-surface-elevated/45 text-nada-secondary/75"
                )}
                key={option}
                onClick={() => setCategory(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Access</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["open", "Open"],
              ["invite-only", "Invite-only"]
            ].map(([value, label]) => (
              <button
                className={cn(
                  "rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                  privacy === value
                    ? "border-nada-accent/45 bg-nada-accent/12 text-nada-accent"
                    : "border-nada-border/10 bg-nada-surface-elevated/45 text-nada-secondary/75"
                )}
                key={value}
                onClick={() => setPrivacy(value as "open" | "invite-only")}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          className="nada-btn-gold flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold disabled:opacity-45"
          disabled={!canCreate}
          onClick={() => onCreate({ category, description, privacy, title })}
          type="button"
        >
          <Plus size={16} />
          Create community
        </button>
      </div>
    </Sheet>
  );
}

function GroupsHome({
  chats,
  contacts,
  groupItems,
  onCreateGroup,
  onSelectGroup
}: {
  chats: ChatRecord[];
  contacts: ContactRecord[];
  groupItems: ChatListModel[];
  onCreateGroup: () => void;
  onSelectGroup: (groupId: string) => void;
}): JSX.Element {
  const inviteOnlyCount = chats.filter((chat) => chat.type === "group").length;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      <div className="nada-premium-card mb-5 p-5">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-nada-accent/14 text-nada-accent">
          <Users size={24} />
        </div>
        <h2 className="text-[20px] font-bold text-nada-primary">Silent rooms</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-nada-text-muted">
          Create a room where nobody needs a real name, phone number, or visible identity.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="nada-privacy-chip">Invite-only</span>
          <span className="nada-privacy-chip">Local keys</span>
          <span className="nada-privacy-chip">No contacts upload</span>
        </div>
        <button
          className="nada-btn-gold mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[13px] font-bold"
          onClick={onCreateGroup}
          type="button"
        >
          <Plus size={16} />
          Create anonymous group
        </button>
      </div>

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase text-nada-text-muted">My Groups</p>
          <span className="rounded-full bg-nada-surface-elevated/70 px-2 py-1 text-[10px] font-bold text-nada-secondary/60">
            {inviteOnlyCount}
          </span>
        </div>
        {groupItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-nada-border/10 bg-nada-surface-elevated/35 px-4 py-8 text-center">
            <Users className="mx-auto mb-3 h-7 w-7 text-nada-secondary/35" />
            <p className="text-[14px] font-bold text-nada-primary">No private rooms yet</p>
            <p className="mt-1 text-[12.5px] text-nada-text-muted">
              Start a hidden circle with trusted anonymous contacts.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {groupItems.map((item) => (
              <button
                className="nada-settings-card flex items-center gap-3"
                key={item.chatId}
                onClick={() => item.groupId && onSelectGroup(item.groupId)}
                type="button"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-nada-accent/14 text-nada-accent">
                  <Users size={19} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[14px] font-bold text-nada-primary">{item.title}</span>
                  <span className="block truncate text-[12px] text-nada-text-muted">{item.preview}</span>
                </span>
                <span className="text-[11px] font-semibold text-nada-secondary/55">{item.timestamp}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <p className="px-1 text-[11px] font-bold uppercase text-nada-text-muted">Invite-only Groups</p>
        {[
          ["Silent Room", `${contacts.length} possible members`, "Private Node"],
          ["Hidden Circle", "Invite link required", "Locked"],
          ["Ghost Group", "Burn-after-read ready", "Coming soon"]
        ].map(([name, meta, badge]) => (
          <div className="nada-settings-card flex items-center gap-3" key={name}>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
              <ShieldAlert size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-nada-primary">{name}</span>
              <span className="block text-[12px] text-nada-text-muted">{meta}</span>
            </span>
            <span className="rounded-full bg-nada-surface/70 px-2 py-1 text-[10px] font-bold text-nada-secondary/60">
              {badge}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

async function upsertContact(payload: InvitePayload): Promise<ContactRecord> {
  const existing = await nadaDb.contacts.get(payload.pubkeyHash);
  const contact: ContactRecord = {
    id: payload.pubkeyHash,
    pubkeyHash: payload.pubkeyHash,
    publicKey: payload.publicKey,
    localDisplayName:
      existing && !isLegacyNadaName(existing.localDisplayName)
        ? existing.localDisplayName
        : generateRandomUsername(payload.pubkeyHash),
    addedAt: existing?.addedAt ?? Date.now(),
    trustStatus: existing?.trustStatus ?? "unverified"
  };

  await nadaDb.contacts.put(contact);
  return contact;
}

async function upsertGroupFromInvite(
  identity: IdentityRecord,
  payload: GroupInvitePayload
): Promise<ChatRecord> {
  const existing = await nadaDb.chats.get(payload.groupId);
  const now = Date.now();
  const chat: ChatRecord = {
    id: payload.groupId,
    type: "group",
    title: existing?.title ?? payload.title,
    memberPubkeyHashes: Array.from(
      new Set([...payload.memberPubkeyHashes, identity.pubkeyHash])
    ),
    ownerPubkeyHash: payload.ownerPubkeyHash,
    // ⚠️ MVP_ONLY — replace before production
    groupSenderKey: payload.senderKeyPackage,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    disappearingTimer: existing?.disappearingTimer ?? 0,
    ...(existing?.avatar ? { avatar: existing.avatar } : {})
  };

  await nadaDb.chats.put(chat);
  await nadaDb.groupKeys.put({
    groupId: payload.groupId,
    senderKey: payload.senderKeyPackage,
    createdByPubkeyHash: payload.ownerPubkeyHash,
    createdAt: now
  });
  return chat;
}

/* ─────────────────────────────────────────────────────────────
   StatusView Component
   ───────────────────────────────────────────────────────────── */
function StatusView({
  identity,
  contacts,
  statuses,
  onPostStatus,
  onViewStatus
}: {
  identity: IdentityRecord;
  contacts: ContactRecord[];
  statuses: MessageRecord[];
  onPostStatus: () => void;
  onViewStatus: (hash: string) => void;
}) {
  const myStatuses = statuses
    .filter(s => s.senderPubkeyHash === identity.pubkeyHash)
    .sort((a, b) => b.createdAt - a.createdAt);
  const otherStatuses = statuses
    .filter(s => s.senderPubkeyHash !== identity.pubkeyHash)
    .sort((a, b) => b.createdAt - a.createdAt);
  
  const grouped = otherStatuses.reduce((acc, s) => {
    if (!acc[s.senderPubkeyHash]) acc[s.senderPubkeyHash] = [];
    acc[s.senderPubkeyHash]!.push(s);
    return acc;
  }, {} as Record<string, MessageRecord[]>);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      <div className="nada-premium-card mb-5 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase text-nada-accent">Anonymous stories</p>
            <h2 className="mt-1 text-[21px] font-bold text-nada-primary">Nothing shared forever.</h2>
          </div>
          <button
            className="grid h-11 w-11 place-items-center rounded-2xl bg-nada-accent text-white shadow-accent-glow transition hover:scale-105 active:scale-95"
            onClick={onPostStatus}
            type="button"
          >
            <Plus size={20} />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-nada-text-muted">
          Post a vanishing thought without revealing who you are.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Vanishes in 24h", "Anonymous viewers", "Comments stay here"].map((label) => (
            <span key={label} className="nada-privacy-chip">{label}</span>
          ))}
        </div>
      </div>

      <button
        className="nada-settings-card mb-5 flex items-center gap-4 text-left"
        onClick={() => myStatuses.length > 0 ? onViewStatus(identity.pubkeyHash) : onPostStatus()}
        type="button"
      >
        <div className="relative h-14 w-14 shrink-0 rounded-2xl border border-nada-accent/35 p-0.5">
          <div className="grid h-full w-full place-items-center overflow-hidden rounded-[14px] bg-nada-accent/12">
            {myStatuses.length > 0 ? (
              <CircleDashed className="text-nada-accent" size={24} />
            ) : (
              <Plus className="text-nada-accent" size={24} />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-nada-primary">My Status</h3>
          <p className="truncate text-[13px] text-nada-text-muted">
            {myStatuses.length > 0
              ? `${myStatuses.length} update${myStatuses.length === 1 ? "" : "s"} - tap to view or add more`
              : "Add your first vanishing thought"}
          </p>
        </div>
        <span className="rounded-full bg-nada-surface/70 px-2.5 py-1 text-[10px] font-bold text-nada-secondary/60">
          {myStatuses.length}
        </span>
      </button>

      <section className="mb-5">
        <p className="mb-2 px-1 text-[11px] font-bold uppercase text-nada-text-muted">Anonymous Updates</p>
        {Object.entries(grouped).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-nada-border/10 bg-nada-surface-elevated/35 px-5 py-10 text-center">
            <CircleDashed className="mx-auto mb-3 h-8 w-8 text-nada-secondary/35" />
            <p className="text-[14px] font-bold text-nada-primary">Nothing shared.</p>
            <p className="mt-1 text-[12.5px] text-nada-text-muted">
              Recent anonymous updates from contacts will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {Object.entries(grouped).map(([hash, list]) => {
              const contact = contacts.find(c => c.pubkeyHash === hash);
              const name = contact?.localDisplayName || generateRandomUsername(hash);
              const latest = list[0]!;
              return (
                <button
                  key={hash}
                  className="nada-settings-card flex items-center gap-4 text-left"
                  onClick={() => onViewStatus(hash)}
                  type="button"
                >
                  <div className="h-14 w-14 shrink-0 rounded-2xl border border-nada-accent/45 p-0.5">
                    <div className="grid h-full w-full place-items-center overflow-hidden rounded-[14px] bg-nada-accent/12">
                      <CircleDashed className="text-nada-accent" size={24} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold text-nada-primary">{name}</h3>
                    <p className="truncate text-[13px] text-nada-text-muted">
                      {list.length} update{list.length === 1 ? "" : "s"} - {formatRelativeTime(latest.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <p className="px-1 text-[11px] font-bold uppercase text-nada-text-muted">Muted</p>
        <div className="rounded-2xl border border-nada-border/8 bg-nada-surface-elevated/30 px-4 py-4 text-[12.5px] text-nada-text-muted">
          Muted status updates will stay tucked away here.
        </div>
      </section>
    </div>
  );
}

function StatusCreateSheet({
  onClose,
  onPost
}: {
  onClose: () => void;
  onPost: (text: string, media?: MediaAttachment) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const canPost = Boolean(text.trim() || media);

  const selectStatusMedia = (file: File): void => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl) return;
      setMedia({
        fileName: file.name,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: Math.max(file.size, 1),
        url: dataUrl,
        ...(file.type.startsWith("image/") ? { thumbnailDataUrl: dataUrl } : {})
      });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex flex-col bg-nada-bg md:relative md:inset-auto md:h-full md:w-full pt-safe-area pb-safe-area pl-safe-area pr-safe-area"
      style={{
        background:
          "radial-gradient(circle at 50% 20%, rgb(var(--nada-accent) / 0.18), transparent 36%), radial-gradient(circle at 50% 80%, rgb(var(--nada-gold) / 0.10), transparent 34%), rgb(var(--nada-bg))"
      }}
      initial={{ y: "100%" }} 
      animate={{ y: 0 }} 
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
    >
      <div className="flex h-16 items-center justify-between px-4 text-white">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/8 text-white/80"><X size={22} /></button>
        <div className="text-center">
          <h2 className="font-bold">Add Status</h2>
          <p className="text-[10px] text-white/45">Vanishes in 24h</p>
        </div>
        <button 
          onClick={() => {
            if (!canPost) return;
            setIsPosting(true);
            onPost(text, media ?? undefined);
          }}
          disabled={!canPost || isPosting}
          className="rounded-full bg-nada-accent px-5 py-2 text-sm font-bold text-white shadow-accent-glow disabled:opacity-50"
        >
          Post
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <textarea
          autoFocus
          className="w-full resize-none bg-transparent text-center text-[30px] font-bold leading-tight text-white outline-none placeholder:text-white/20"
          placeholder="Say less..."
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
        />
      </div>
      <div className="px-6 pb-8">
        <input
          ref={fileInputRef}
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) selectStatusMedia(file);
            event.currentTarget.value = "";
          }}
          type="file"
        />
        {media ? (
          <div className="mx-auto mb-4 max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-3">
            {media.mimeType.startsWith("image/") ? (
              <img
                alt={media.originalName}
                className="max-h-56 w-full rounded-2xl object-contain"
                src={media.url}
              />
            ) : media.mimeType.startsWith("video/") ? (
              <video className="max-h-56 w-full rounded-2xl" controls src={media.url} />
            ) : (
              <audio className="w-full" controls src={media.url} />
            )}
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/60">
              <span className="truncate">{media.originalName}</span>
              <button className="font-bold text-red-200" onClick={() => setMedia(null)} type="button">
                Remove
              </button>
            </div>
          </div>
        ) : null}
        <div className="mx-auto mb-4 flex max-w-sm justify-center gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-white/75"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Image size={16} />
            Add media
          </button>
        </div>
        <div className="mx-auto flex max-w-sm flex-wrap justify-center gap-2">
          {["Anonymous", "No screenshots if supported", "Comments in status"].map((label) => (
            <span key={label} className="nada-privacy-chip border-white/10 bg-white/[0.06] text-white/65">{label}</span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function StatusViewerSheet({
  contacts,
  identity,
  onComment,
  onDeleteStatus,
  onReactStatus,
  senderName,
  statuses,
  onClose
}: {
  contacts: ContactRecord[];
  identity: IdentityRecord;
  onComment: (status: MessageRecord, text: string) => void;
  onDeleteStatus: (status: MessageRecord) => void;
  onReactStatus: (status: MessageRecord, emoji: string) => Promise<MessageRecord | null>;
  senderName: string;
  statuses: MessageRecord[];
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentDraft, setCommentDraft] = useState("");
  const [comments, setComments] = useState<MessageRecord[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [pendingDeleteStatus, setPendingDeleteStatus] = useState<MessageRecord | null>(null);
  const currentStatus = statuses[currentIndex];

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(statuses.length - 1, 0)));
  }, [statuses.length]);

  const goToPreviousStatus = useCallback(() => {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }, []);

  const goToNextStatus = useCallback(() => {
    setCurrentIndex((index) => {
      if (index < statuses.length - 1) {
        return index + 1;
      }
      onClose();
      return index;
    });
  }, [onClose, statuses.length]);

  const handleStatusTap = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (showComments) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left + rect.width / 2) {
      goToPreviousStatus();
    } else {
      goToNextStatus();
    }
  }, [goToNextStatus, goToPreviousStatus, showComments]);

  useEffect(() => {
    if (showComments || commentDraft.trim()) return;
    const timer = setTimeout(goToNextStatus, 5000);
    return () => clearTimeout(timer);
  }, [commentDraft, goToNextStatus, showComments]);

  useEffect(() => {
    if (!currentStatus) return;
    let active = true;
    const load = async () => {
      const records = await loadStatusComments(currentStatus.id);
      if (active) setComments(records.sort((a, b) => a.createdAt - b.createdAt));
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const commentRecords = useMemo(
    () => comments.filter((comment) => Boolean(parseStatusCommentPayload(comment.body))),
    [comments]
  );
  const reactionSummary = useMemo(() => {
    const latestBySender = new Map<string, { createdAt: number; emoji: string }>();
    comments.forEach((comment) => {
      const payload = parseStatusReactionPayload(comment.body);
      if (!payload) return;
      const existing = latestBySender.get(comment.senderPubkeyHash);
      if (!existing || comment.createdAt >= existing.createdAt) {
        latestBySender.set(comment.senderPubkeyHash, {
          createdAt: comment.createdAt,
          emoji: payload.emoji
        });
      }
    });

    const counts = new Map<string, number>();
    latestBySender.forEach(({ emoji }) => {
      counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    });

    return {
      counts,
      mine: latestBySender.get(identity.pubkeyHash)?.emoji ?? null,
      total: latestBySender.size
    };
  }, [comments, identity.pubkeyHash]);

  if (!currentStatus) return null;
  const statusText = decodeMessagePayload(currentStatus.body)?.text ?? textFromMessage(currentStatus);
  const statusMedia = mediaFromMessage(currentStatus);
  const statusMediaUrl = statusMedia?.url ?? statusMedia?.thumbnailDataUrl ?? statusMedia?.thumbnailUrl ?? null;
  const canDeleteCurrentStatus = currentStatus.senderPubkeyHash === identity.pubkeyHash;

  return (
    <motion.div
      className="fixed inset-0 z-[1100] flex flex-col bg-black text-white"
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", damping: 30, stiffness: 400 }}
    >
      <div className="absolute inset-x-0 top-0 z-10 p-4 pt-safe-area">
        <div className="flex gap-1 mb-4">
          {statuses.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
               {i === currentIndex && (
                 <motion.div 
                   key={currentStatus.id}
                   className="h-full bg-white" 
                   initial={{ width: 0 }} 
                   animate={{ width: "100%" }} 
                   transition={{ duration: 5, ease: "linear" }} 
                 />
               )}
               {i < currentIndex && <div className="h-full w-full bg-white" />}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <IdentityOrb seed={senderName} size="md" label={senderName} />
             <div>
                <h3 className="font-bold">{senderName}</h3>
                <p className="text-[10px] opacity-60">{formatRelativeTime(currentStatus.createdAt)}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
            {canDeleteCurrentStatus ? (
              <button
                aria-label="Delete status"
                className="grid h-10 w-10 place-items-center rounded-2xl bg-red-500/12 text-red-200 transition hover:bg-red-500/18"
                onClick={() => setPendingDeleteStatus(currentStatus)}
                type="button"
              >
                <Trash2 size={18} />
              </button>
            ) : null}
            <button
              aria-label="Close status"
              className="grid h-10 w-10 place-items-center rounded-2xl bg-white/8 text-white/80 transition hover:bg-white/12"
              onClick={onClose}
              type="button"
            >
              <X size={22} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative flex-1 flex items-center justify-center p-6 text-center"
        onClick={handleStatusTap}
      >
        <button
          aria-label="Previous status"
          className="absolute inset-y-0 left-0 z-[1] w-1/2 cursor-pointer bg-transparent"
          onClick={(event) => {
            event.stopPropagation();
            goToPreviousStatus();
          }}
          type="button"
        />
        <button
          aria-label="Next status"
          className="absolute inset-y-0 right-0 z-[1] w-1/2 cursor-pointer bg-transparent"
          onClick={(event) => {
            event.stopPropagation();
            goToNextStatus();
          }}
          type="button"
        />
        <div className="pointer-events-none relative z-[2] flex max-w-2xl flex-col items-center gap-5">
          {statusMedia && statusMediaUrl ? (
            statusMedia.mimeType.startsWith("image/") ? (
              <img
                alt={statusMedia.originalName}
                className="max-h-[58vh] max-w-full rounded-3xl object-contain shadow-2xl"
                src={statusMediaUrl}
              />
            ) : statusMedia.mimeType.startsWith("video/") ? (
              <video
                className="pointer-events-auto max-h-[58vh] max-w-full rounded-3xl shadow-2xl"
                controls
                src={statusMediaUrl}
              />
            ) : (
              <audio className="pointer-events-auto w-[min(88vw,420px)]" controls src={statusMediaUrl} />
            )
          ) : null}
          {statusText && statusText !== currentStatus.body ? (
            <p className="text-3xl font-bold leading-tight max-w-lg">
              {statusText}
            </p>
          ) : !statusMedia ? (
            <p className="text-3xl font-bold leading-tight max-w-lg">
              {statusText}
            </p>
          ) : null}
        </div>
      </div>

      <div className="z-10 border-t border-white/10 bg-black/80 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
          {STATUS_REACTION_EMOJIS.map((emoji) => {
            const count = reactionSummary.counts.get(emoji) ?? 0;
            const isMine = reactionSummary.mine === emoji;
            return (
              <button
                className={cn(
                  "inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-lg transition",
                  isMine
                    ? "border-nada-accent/45 bg-nada-accent/20 text-white shadow-[0_0_24px_rgb(var(--nada-accent)/0.18)]"
                    : "border-white/10 bg-white/8 text-white/85 hover:bg-white/12"
                )}
                key={emoji}
                onClick={() => {
                  void onReactStatus(currentStatus, emoji).then((record) => {
                    if (!record) return;
                    setComments((current) =>
                      [...current, record].sort((a, b) => a.createdAt - b.createdAt)
                    );
                  });
                }}
                type="button"
              >
                <span>{emoji}</span>
                {count > 0 ? (
                  <span className="text-[11px] font-bold text-white/60">{count}</span>
                ) : null}
              </button>
            );
          })}
          {reactionSummary.total > 0 ? (
            <span className="shrink-0 rounded-full bg-white/8 px-3 py-2 text-xs font-semibold text-white/55">
              {reactionSummary.total} reaction{reactionSummary.total === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <button
          className="mb-3 flex w-full items-center justify-between rounded-2xl bg-white/8 px-4 py-3 text-left text-sm font-semibold"
          onClick={() => setShowComments((current) => !current)}
          type="button"
        >
          <span className="flex items-center gap-2">
            <MessageCircle size={16} />
            Comments
          </span>
          <span className="text-white/55">{commentRecords.length}</span>
        </button>
        {showComments ? (
          <div className="mb-3 max-h-44 space-y-2 overflow-y-auto pr-1">
            {commentRecords.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/45">
                No comments yet.
              </p>
            ) : (
              commentRecords.map((comment) => {
                const payload = parseStatusCommentPayload(comment.body);
                const name =
                  comment.senderPubkeyHash === identity.pubkeyHash
                    ? "You"
                    : contacts.find((contact) => contact.pubkeyHash === comment.senderPubkeyHash)
                        ?.localDisplayName ?? generateRandomUsername(comment.senderPubkeyHash);
                return (
                  <div key={comment.id} className="rounded-2xl bg-white/8 px-3 py-2 text-left">
                    <div className="mb-0.5 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold">{name}</span>
                      <span className="text-[10px] text-white/40">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-white/80">
                      {payload?.text ?? comment.body}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = commentDraft.trim();
            if (!trimmed) return;
            onComment(currentStatus, trimmed);
            const timestamp = Date.now();
            const localComment: MessageRecord = {
              id: crypto.randomUUID(),
              chatId: statusCommentChatId(currentStatus.id),
              senderPubkeyHash: identity.pubkeyHash,
              recipientPubkeyHash: currentStatus.senderPubkeyHash,
              direction: "outbound",
              kind: "system",
              body: JSON.stringify({
                kind: "status-comment",
                statusId: currentStatus.id,
                statusOwnerPubkeyHash: currentStatus.senderPubkeyHash,
                text: trimmed,
                version: 1
              } satisfies StatusCommentPayload),
              encryptedPayload: "local-preview",
              status: "sent",
              createdAt: timestamp
            };
            setComments((current) => [...current, localComment]);
            setCommentDraft("");
            setShowComments(true);
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-nada-accent/50"
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="Comment on this status..."
            value={commentDraft}
          />
          <button
            className="grid h-11 w-11 place-items-center rounded-2xl bg-nada-accent text-black disabled:opacity-40"
            disabled={!commentDraft.trim()}
            type="submit"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
      <AnimatePresence>
        {pendingDeleteStatus ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[20] grid place-items-center bg-black/55 p-5 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setPendingDeleteStatus(null)}
          >
            <motion.div
              animate={{ y: 0, opacity: 1, scale: 1 }}
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-nada-surface p-5 text-left shadow-2xl"
              exit={{ y: 12, opacity: 0, scale: 0.98 }}
              initial={{ y: 12, opacity: 0, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-red-500/12 text-red-300">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-nada-primary">Delete status?</h3>
                  <p className="text-xs text-nada-secondary/55">This status and its comments will be removed.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
                  onClick={() => setPendingDeleteStatus(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white"
                  onClick={() => {
                    onDeleteStatus(pendingDeleteStatus);
                    setPendingDeleteStatus(null);
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

async function persistIncomingMessages(
  identity: IdentityRecord,
  envelopes: MessageEnvelope[]
): Promise<void> {
  for (const envelope of envelopes) {
    const contactPayload: InvitePayload = {
      version: 1,
      pubkeyHash: envelope.sender,
      // ⚠️ MVP_ONLY — replace before production
      publicKey: envelope.sender
    };
    await upsertContact(contactPayload);
    const chatId = directChatId(identity.pubkeyHash, envelope.sender);
    const existing = await nadaDb.messages.get(envelope.id);
    if (existing) {
      continue;
    }

    // Try to decrypt the message body. Use devPlaintext first (dev mode),
    // then fall back to mockDecryptMessage (base64 decode), then raw ciphertext.
    let body: string;
    if (envelope.devPlaintext) {
      body = envelope.devPlaintext;
    } else {
      try {
        body = await mockDecryptMessage(envelope.ciphertext);
    } catch {
        body = envelope.ciphertext;
      }
    }

    const statusComment = parseStatusCommentPayload(body);
    const statusReaction = parseStatusReactionPayload(body);
    const statusDelete = parseStatusDeletePayload(body);
    if (statusDelete) {
      if (statusDelete.statusOwnerPubkeyHash === envelope.sender) {
        await nadaDb.messages.delete(statusDelete.statusId);
        await nadaDb.messages
          .where("chatId")
          .equals(statusCommentChatId(statusDelete.statusId))
          .delete();
      }
      continue;
    }

    if (statusComment) {
      await nadaDb.messages.put({
        id: envelope.id,
        chatId: statusCommentChatId(statusComment.statusId),
        senderPubkeyHash: envelope.sender,
        recipientPubkeyHash: identity.pubkeyHash,
        direction: "inbound",
        kind: "system",
        body,
        encryptedPayload: envelope.ciphertext,
        status: "delivered",
        createdAt: envelope.timestamp
      });
      continue;
    }

    if (statusReaction) {
      await nadaDb.messages.put({
        id: envelope.id,
        chatId: statusCommentChatId(statusReaction.statusId),
        senderPubkeyHash: envelope.sender,
        recipientPubkeyHash: identity.pubkeyHash,
        direction: "inbound",
        kind: "system",
        body,
        encryptedPayload: envelope.ciphertext,
        status: "delivered",
        createdAt: envelope.timestamp
      });
      continue;
    }

    const messageKind = envelope.messageKind ?? decodeMessagePayload(body)?.type ?? "text";
    if (messageKind === "status") {
      await nadaDb.messages.put({
        id: envelope.id,
        chatId: "status",
        senderPubkeyHash: envelope.sender,
        recipientPubkeyHash: identity.pubkeyHash,
        direction: "inbound",
        kind: "status",
        body,
        encryptedPayload: envelope.ciphertext,
        status: "delivered",
        createdAt: envelope.timestamp
      });
      continue;
    }

    await nadaDb.messages.put({
      id: envelope.id,
      chatId,
      senderPubkeyHash: envelope.sender,
      recipientPubkeyHash: identity.pubkeyHash,
      direction: "inbound",
      kind: messageKind,
      body,
      encryptedPayload: envelope.ciphertext,
      status: "delivered",
      createdAt: envelope.timestamp,
      ...(envelope.replyTo ? { replyTo: envelope.replyTo } : {}),
      ...(envelope.replyTo ? { replyToId: envelope.replyTo.messageId } : {})
    });
  }
}

async function persistIncomingGroupMessages(
  identity: IdentityRecord,
  envelopes: GroupMessageEnvelope[]
): Promise<void> {
  for (const envelope of envelopes) {
    const existingMessage = await nadaDb.messages.get(envelope.id);
    if (existingMessage) {
      continue;
    }

    let existingChat = await nadaDb.chats.get(envelope.groupId);
    const envelopeSenderKey = envelope.senderKeyPackage;
    const keyRecord = await nadaDb.groupKeys.get(envelope.groupId);
    const senderKey =
      envelopeSenderKey ?? existingChat?.groupSenderKey ?? keyRecord?.senderKey;

    if (envelopeSenderKey) {
      if (!keyRecord || keyRecord.senderKey !== envelopeSenderKey) {
        await nadaDb.groupKeys.put({
          groupId: envelope.groupId,
          senderKey: envelopeSenderKey,
          createdByPubkeyHash: envelope.sender,
          createdAt: envelope.timestamp
        });
      }
      if (existingChat && existingChat.groupSenderKey !== envelopeSenderKey) {
        await nadaDb.chats.update(envelope.groupId, {
          groupSenderKey: envelopeSenderKey
        });
        existingChat = {
          ...existingChat,
          groupSenderKey: envelopeSenderKey
        };
      }
    }

    // Try to decrypt the group message body
    let body: string;
    if (envelope.devPlaintext) {
      body = envelope.devPlaintext;
    } else {
      try {
        const parsed = JSON.parse(envelope.ciphertext) as {
          ciphertext?: unknown;
          nonce?: unknown;
          version?: unknown;
        };
        if (
          senderKey &&
          typeof parsed.ciphertext === "string" &&
          typeof parsed.nonce === "string" &&
          parsed.version === 1
        ) {
          body = await decryptGroupMessage(
            {
              ciphertext: parsed.ciphertext,
              nonce: parsed.nonce,
              version: 1
            },
            senderKey
          );
        } else {
          body = await mockDecryptMessage(envelope.ciphertext);
        }
      } catch {
        try {
        body = await mockDecryptMessage(envelope.ciphertext);
      } catch {
          body = GROUP_DECRYPTION_FALLBACK_TEXT;
      }
    }
    }

    const groupDelete = parseGroupDeletePayload(body);
    if (groupDelete?.groupId === envelope.groupId) {
      const ownerHash = existingChat?.ownerPubkeyHash ?? groupDelete.ownerPubkeyHash;
      if (
        groupDelete.ownerPubkeyHash === ownerHash &&
        envelope.sender === ownerHash
      ) {
        await nadaDb.messages.where("chatId").equals(envelope.groupId).delete();
        await nadaDb.chatPrefs.delete(envelope.groupId);
        await nadaDb.groupKeys.delete(envelope.groupId);
        await nadaDb.chats.delete(envelope.groupId);
      }
      continue;
    }

    if (!existingChat) {
      const now = Date.now();
      await nadaDb.chats.put({
        id: envelope.groupId,
        type: "group",
        title: `Group ${envelope.groupId.slice(0, 8)}`,
        memberPubkeyHashes: Array.from(
          new Set([identity.pubkeyHash, envelope.sender, ...envelope.recipients])
        ),
        ownerPubkeyHash: envelope.sender,
        ...(senderKey ? { groupSenderKey: senderKey } : {}),
        createdAt: now,
        updatedAt: envelope.timestamp,
        disappearingTimer: 0
      });
      existingChat = await nadaDb.chats.get(envelope.groupId);
    } else {
      await nadaDb.chats.update(envelope.groupId, {
        updatedAt: envelope.timestamp
      });
    }

    await nadaDb.messages.put({
      id: envelope.id,
      chatId: envelope.groupId,
      senderPubkeyHash: envelope.sender,
      recipientPubkeyHash: envelope.groupId,
      direction: "inbound",
      kind: envelope.messageKind ?? decodeMessagePayload(body)?.type ?? "text",
      body,
      encryptedPayload: envelope.ciphertext,
      status: "delivered",
      createdAt: envelope.timestamp,
      ...(envelope.expiresAt ? { expiresAt: envelope.expiresAt } : {}),
      ...(envelope.mentions ? { mentions: envelope.mentions } : {}),
      ...(envelope.replyToId ? { replyToId: envelope.replyToId } : {}),
      ...(envelope.replyTo ? { replyTo: envelope.replyTo } : {})
    });
  }
}

function extractMentions(
  text: string,
  contacts: ContactRecord[]
): string[] {
  const normalizedText = text.toLowerCase();
  return contacts
    .filter((contact) =>
      normalizedText.includes(`@${contact.localDisplayName.toLowerCase()}`)
    )
    .map((contact) => contact.pubkeyHash);
}

function matchesSearch(value: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  return value.toLowerCase().includes(trimmed);
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const now = Date.now();
  const date = new Date(timestamp);

  const isToday = date.toDateString() === new Date(now).toDateString();
  const isYesterday = date.toDateString() === new Date(now - 86400000).toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (isYesterday) {
    return "Yesterday";
  } else if (now - timestamp < 7 * 86400000) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function dataUrlSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return dataUrl.length;
  const base64 = dataUrl.slice(commaIndex + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(1, Math.floor((base64.length * 3) / 4) - padding);
}









