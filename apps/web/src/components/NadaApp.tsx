import type {
  NotificationSettings, NotificationSoundChoice, NotificationPreviewPrivacy,
  NotificationRingtoneChoice, DeliveryGlyph, CommunityRecord, CommunityPost,
  SafetyReport, StatusCommentPayload, StatusReactionPayload, StatusDeletePayload,
  GroupDeletePayload
} from "@/utils/dashboard-types";
import {
  STATUS_COMMENT_PREFIX, DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SOUND_CHOICES, NOTIFICATION_PREVIEW_PRIVACY_CHOICES,
  NOTIFICATION_RINGTONE_CHOICES, STATUS_REACTION_EMOJIS, GROUP_DECRYPTION_FALLBACK_TEXT
} from "@/utils/dashboard-types";
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
import { Splash } from "./AppLoading";
import { useOnlineStatus, OfflineBanner } from "./OfflineBanner";
import { Dashboard } from "./screens/Dashboard";
import { Onboarding } from "./screens/Onboarding";

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
/* ─────────────────────────────────────────────────────────────
   StatusView Component
   ───────────────────────────────────────────────────────────── */
