"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import Dexie from "dexie";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart2,
  Bell,
  BellOff,
  Camera,
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
  Smile,
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
  ChatListItem, 
  ArchivedRow,
  EmptyChatListState
} from "./NadaMobileUI";

import {
  createAnonymousIdentity,
  createSeedPhrase,
  createGroupSenderKey,
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
import { Avatar, Button, IconButton, cn } from "@nada/ui";

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
import { useSocketStore } from "@/stores/useSocketStore";

type Panel =
  | "billing"
  | "contacts"
  | "group"
  | "migration"
  | "settings"
  | "share"
  | null;

export function NadaApp(): JSX.Element {
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const connect = useSocketStore((state) => state.connect);
  const disconnect = useSocketStore((state) => state.disconnect);

  useEffect(() => {
    let active = true;

    void nadaDb.identity.get(primaryIdentityId).then((record) => {
      if (!active) {
        return;
      }

      setIdentity(record ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!identity) {
      return;
    }

    connect({ pubkeyHash: identity.pubkeyHash });
    return () => {
      disconnect();
    };
  }, [connect, disconnect, identity]);

  const handleComplete = useCallback((nextIdentity: IdentityRecord) => {
    setIdentity(nextIdentity);
  }, []);

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
    <main className="grid min-h-dvh place-items-center" style={{ background: "rgb(var(--nada-bg))" }}>
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div
          className="grid h-16 w-16 place-items-center rounded-2xl text-xl font-black text-black shadow-gold-glow overflow-hidden"
          style={{ background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))" }}
        >
          <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="nada-typing-dot" />
          <div className="nada-typing-dot" />
          <div className="nada-typing-dot" />
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
      value: displayName.trim() || "NADA",
      updatedAt: Date.now()
    });
    onComplete(confirmed);
  };

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-12" style={{ background: "rgb(var(--nada-bg))" }}>
      <div
        className="mb-6 grid h-14 w-14 place-items-center rounded-2xl text-lg font-black text-black shadow-gold-glow animate-scale-in overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))" }}
      >
        <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-nada-accent">
        NADA
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-nada-primary" style={{ letterSpacing: "-0.5px" }}>Anonymous by default.</h1>
      <p className="mt-3 text-base text-nada-secondary/[.80] leading-relaxed">
        Your identity is a keypair generated on this device. No phone number,
        email, or contact upload.
      </p>

      {!draft ? (
        <button
          className="mt-8 w-full rounded-full py-4 text-base font-bold text-black nada-btn-gold disabled:opacity-50"
          disabled={isGenerating}
          onClick={() => { void generateIdentity(); }}
        >
          {isGenerating ? "Creating identity..." : "Create identity"}
        </button>
      ) : (
        <div className="mt-8 space-y-5 animate-fade-in">
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-nada-border/[.08] p-3" style={{ background: "rgb(var(--nada-surface))" }}>
            {seedWords.map((word, index) => (
              <div
                className="rounded-xl border border-nada-border/[.08] px-3 py-2.5 text-xs text-nada-primary"
                key={`${word}-${index}`}
                style={{ background: "rgb(var(--nada-surface-elevated))" }}
              >
                <span className="mr-1 text-nada-accent/60">{index + 1}</span>
                {word}
              </div>
            ))}
          </div>
          <label className="flex cursor-pointer select-none items-center gap-3 text-sm text-nada-primary/80">
            <input
              checked={saved}
              className="h-5 w-5 rounded"
              style={{ accentColor: "rgb(var(--nada-accent))" }}
              onChange={(event) => { setSaved(event.target.checked); }}
              type="checkbox"
            />
            I saved my seed phrase
          </label>
          <input
            className="nada-input-dark h-12 w-full px-4 text-base"
            maxLength={40}
            onChange={(event) => { setDisplayName(event.target.value); }}
            placeholder="Display name (optional)"
            value={displayName}
          />
          <button className="w-full rounded-full py-4 text-base font-bold text-black nada-btn-gold disabled:opacity-40" disabled={!saved} onClick={() => void finish()}>
            Enter NADA
          </button>
        </div>
      )}
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
  // ─────────────────────────────────────────────────────────────────────────────
  
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [disappearingTimer, setDisappearingTimer] = useState(0);
  const [displayName, setDisplayName] = useState("NADA");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactHash, setSelectedContactHash] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [chatPref, setChatPrefState] = useState<ChatPrefRecord>({
    chatId: "", mutedUntil: 0, clearedAt: 0, blockedPubkeyHashes: [],
    pinnedMessageId: null, pinnedMessageBody: null, updatedAt: 0
  });
  const [blurShieldActive, setBlurShieldActive] = useState(false);
  const [blurShieldRevealed, setBlurShieldRevealed] = useState(false);
  const [showGhostModal, setShowGhostModal] = useState(false);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
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
  const [selectedStatusSenderHash, setSelectedStatusSenderHash] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    const now = Date.now();
    const records = await nadaDb.messages
      .where("[kind+createdAt]")
      .between(["status", now - 24 * 60 * 60 * 1000], ["status", Dexie.maxKey])
      .reverse()
      .toArray();
    setAllStatuses(records);
  }, []);

  const showNotification = useCallback((title: string, body: string, chatId: string) => {
    const id = crypto.randomUUID();
    setInAppNotification({ id, title, body, chatId });
    setTimeout(() => {
      setInAppNotification((current) => current?.id === id ? null : current);
    }, 4000);
  }, []);

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
  const selectedSubtitle = selectedGroup
    ? `${selectedGroup.memberPubkeyHashes.length} members`
    : (selectedContact?.trustStatus ?? "");
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

  const [dashboardToast, setDashboardToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setDashboardToast(msg);
    setTimeout(() => setDashboardToast(null), 2500);
  }, []);



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
    void markChatAsRead(selectedChatId).then(() => {
      setUnreadCounts((prev) => ({ ...prev, [selectedChatId]: 0 }));
    });
  }, [selectedChatId, messages.length]);


  // Typing indicator — compute current chat's typing state
  const peerIsTyping = selectedChatId ? Boolean(typingIndicators[selectedChatId]) : false;

  useEffect(() => {
    let active = true;

    void nadaDb.settings.get("displayName").then((record) => {
      if (!active) {
        return;
      }

      setDisplayName(record?.value ?? "NADA");
    });

    return () => {
      active = false;
    };
  }, []);

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
      setMessages(messageRecords);
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
    let active = true;

    void nadaDb.contacts.orderBy("addedAt").reverse().toArray().then((records) => {
      if (!active) {
        return;
      }

      setContacts(records);
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

      setMessages(records);
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
      deliveryEntries.map(([id, status]) => nadaDb.messages.update(id, { status }))
    ).then(() => {
      if (!active) {
        return;
      }

      setMessages((current) =>
        current.map((message) => {
          const nextStatus = deliveries[message.id];
          return nextStatus && message.status !== nextStatus
            ? { ...message, status: nextStatus }
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
      setMessages(messageRecords);

      newEnvelopes.forEach((env) => {
         const chatId = directChatId(identity.pubkeyHash, env.sender);
         if (chatId !== selectedChatId) {
             const senderContact = contactRecords.find(c => c.pubkeyHash === env.sender);
             const title = senderContact?.localDisplayName || "Someone";
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

      setChats(chatRecords.filter((chat) => chat.type === "group"));
      setMessages(messageRecords);

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
  }, [groupIncoming, identity, loadStatuses, selectedChatId, sendDelivery, showNotification]);

  /** Insert a system call-log message bubble into the current chat */
  const insertCallLogMessage = useCallback(async (callId: string, mode: CallMode, status: "started" | "ended" | "missed", duration?: number): Promise<void> => {
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

  useEffect(() => {
    const latestSignal = callSignals.find(
      (signal) =>
        signal.recipient === identity.pubkeyHash &&
        !processedCallSignals.current.has(signal.id)
    );

    if (!latestSignal) return;
    processedCallSignals.current.add(latestSignal.id);

    switch (latestSignal.signalType) {
      case "offer": {
        // Incoming call — store the SDP so the accept handler can use it
        const contact = contacts.find(c => c.pubkeyHash === latestSignal.sender);
        callStore.receiveIncomingOffer({
          callId: latestSignal.callId,
          mode: latestSignal.mode,
          peerPubkeyHash: latestSignal.sender,
          peerName: contact?.localDisplayName ?? latestSignal.sender.slice(0, 8),
          offerSdp: latestSignal.payload
        });
        // Log incoming call attempt
        void insertCallLogMessage(latestSignal.callId, latestSignal.mode, "started");
        break;
      }
      case "answer": {
        // Caller receives the answer — set remote description on our PC
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
      case "hangup":
        callStore.endCall();
        break;
    }
  }, [callSignals, identity.pubkeyHash, contacts, callStore, insertCallLogMessage]);

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

      if (!isSubscribed) return;

      for (const msg of queuedMessages) {
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
          ...(process.env["NODE_ENV"] !== "production" ? { devPlaintext: msg.body } : {})
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
      
      const outboundGroupMessages = localMessages.filter(m => m.direction === "outbound");
      
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
          ...(process.env["NODE_ENV"] !== "production" ? { devPlaintext: msg.body } : {})
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

  const sendMessage = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed || !selectedChatId) {
      return;
    }

    // Always stop typing indicator when sending
    handleTypingStop();

    if (editingMessageId) {
      const editedAt = Date.now();
      const encryptedPayload = await mockEncryptMessage(trimmed);
      await nadaDb.messages.update(editingMessageId, {
        body: trimmed,
        editedAt,
        encryptedPayload
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === editingMessageId
            ? { ...message, body: trimmed, editedAt, encryptedPayload }
            : message
        )
      );
      setEditingMessageId(null);
      setMessageText("");
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
    const ciphertext = selectedGroup?.groupSenderKey
      ? JSON.stringify(
          await encryptGroupMessage(body, selectedGroup.groupSenderKey)
        )
      : await mockEncryptMessage(body);
    const statusFallback = selectedGroup ? "local" : "queued";
    let sent = false;

    if (selectedGroup) {
      const recipients = selectedGroup.memberPubkeyHashes.filter(
        (member) => member !== identity.pubkeyHash
      );
      const baseEnvelope = {
        type: "group-message" as const,
        id,
        groupId: selectedGroup.id,
        recipients,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "text" as const,
        ...(replyToId ? { replyToId } : {}),
        ...(replySnapshot ? { replyTo: replySnapshot } : {}),
        ...(mentions.length > 0 ? { mentions } : {}),
        ...(expiresAt ? { expiresAt } : {})
      };
      const groupEnvelope: GroupMessageEnvelope =
        process.env["NODE_ENV"] === "production"
          ? baseEnvelope
          : {
              ...baseEnvelope,
              // ⚠️ MVP_ONLY — replace before production
              devPlaintext: body
            };
      sent = sendGroupEnvelope(groupEnvelope);
    } else if (selectedContact) {
      const baseEnvelope = {
        type: "message" as const,
        id,
        recipient: selectedContact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "text" as const,
        ...(replySnapshot ? { replyTo: replySnapshot } : {})
      };
      const envelope: MessageEnvelope =
        process.env["NODE_ENV"] === "production"
          ? baseEnvelope
          : {
              ...baseEnvelope,
              // ⚠️ MVP_ONLY — replace before production
              devPlaintext: body
            };
      sent = sendEnvelope(envelope);
    }

    if (!selectedGroup && !selectedContact) {
      return;
    }

    const recipientHash =
      selectedGroup?.id ?? selectedContact?.pubkeyHash ?? identity.pubkeyHash;
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
    setMessageText("");
    setReplyToId(null);
    if ("vibrate" in navigator) {
      navigator.vibrate(8);
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
        timestamp, ciphertext, messageKind: "poll" as const
      };
      const groupEnvelope: GroupMessageEnvelope = process.env["NODE_ENV"] === "production" ? baseEnvelope : { ...baseEnvelope, devPlaintext: body };
      sent = sendGroupEnvelope(groupEnvelope);
    } else if (selectedContact) {
      const baseEnvelope = {
        type: "message" as const, id, recipient: selectedContact.pubkeyHash, sender: identity.pubkeyHash,
        timestamp, ciphertext, messageKind: "poll" as const
      };
      const envelope: MessageEnvelope = process.env["NODE_ENV"] === "production" ? baseEnvelope : { ...baseEnvelope, devPlaintext: body };
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
    const payload = media 
      ? buildMediaPayload({ media, type: "status" })
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
    
    contacts.forEach(contact => {
      sendEnvelope({
        type: "message",
        id: crypto.randomUUID(),
        recipient: contact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        messageKind: "status"
      });
    });
    
    showToast("Status posted!");
  };

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
        ...(process.env["NODE_ENV"] !== "production" ? { devPlaintext: body } : {}),
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
        ...(process.env["NODE_ENV"] !== "production" ? { devPlaintext: body } : {})
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
        ...(process.env["NODE_ENV"] !== "production" ? { devPlaintext: structuredBody } : {}),
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
        ...(process.env["NODE_ENV"] !== "production" ? { devPlaintext: structuredBody } : {})
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
      void insertCallLogMessage(selectedGroup.id, mode, "started");
      return;
    }

    if (!selectedContact) return;

    const callId = crypto.randomUUID();
    try {
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
    } catch {
      callStore.failCall("Could not start media capture.");
    }
  };

  const endCall = (): void => {
    const callId = activeCall?.callId;
    const peerPubkeyHash = activeCall?.peerPubkeyHash;
    const mode = activeCall?.mode;
    const startedAt = activeCall?.startedAt;

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
      const payload: GroupMessageEnvelope = {
        type: "group-message",
        id: envelopeId,
        groupId: targetGroup.id,
        recipients: targetGroup.memberPubkeyHashes,
        sender: identity.pubkeyHash,
        timestamp: Date.now(),
        ciphertext: bodyToForward // This needs to be re-encrypted technically, but for now we forward the raw body which will be encrypted by sendGroupEnvelope wrapper if needed
      };

      const record: MessageRecord = {
        id: envelopeId,
        chatId: targetGroup.id,
        senderPubkeyHash: identity.pubkeyHash,
        recipientPubkeyHash: targetGroup.id,
        body: bodyToForward,
        createdAt: Date.now(),
        status: "local",
        direction: "outbound",
        kind: "text",
        encryptedPayload: ""
      };
      await nadaDb.messages.add(record);
      if (targetGroup.id === selectedChatId) {
        setMessages((current) => [...current, record]);
      }
      sendGroupEnvelope(payload);
    } else if (targetPeer) {
      const envelopeId = crypto.randomUUID();
      const payload: MessageEnvelope = {
        type: "message",
        id: envelopeId,
        sender: identity.pubkeyHash,
        recipient: targetPeer.pubkeyHash,
        timestamp: Date.now(),
        ciphertext: bodyToForward
      };
      const record: MessageRecord = {
        id: envelopeId,
        chatId: targetChatId,
        senderPubkeyHash: identity.pubkeyHash,
        recipientPubkeyHash: targetPeer.pubkeyHash,
        body: bodyToForward,
        createdAt: Date.now(),
        status: "queued",
        direction: "outbound",
        kind: "text",
        encryptedPayload: ""
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

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }

    const vapidKey = process.env['NEXT_PUBLIC_VAPID_PUBLIC_KEY'];
    if (!vapidKey) return;

    void navigator.serviceWorker.ready.then(async (registration) => {
      try {
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
          // Send it to the server anyway to ensure pubkeyHash is updated if it changed
          const relayUrl = process.env['NEXT_PUBLIC_RELAY_URL']?.replace("ws://", "http://").replace("wss://", "https://") || "";
          if (relayUrl) {
            await fetch(`${relayUrl}/api/v1/push/subscribe`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pubkeyHash: identity.pubkeyHash,
                subscription: existingSub.toJSON()
              })
            }).catch(() => {});
          }
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

        const relayUrl = process.env['NEXT_PUBLIC_RELAY_URL']?.replace("ws://", "http://").replace("wss://", "https://") || "";
        if (!relayUrl) return;

        await fetch(`${relayUrl}/api/v1/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkeyHash: identity.pubkeyHash,
            subscription: subscription.toJSON()
          })
        });
      } catch (err) {
        console.error("Failed to subscribe to push notifications", err);
      }
    });
  }, [identity.pubkeyHash]);

  return (
    <div className="h-dvh w-full overflow-hidden flex items-center justify-center bg-nada-bg pl-safe-area pr-safe-area">
      <section className="flex h-full w-full max-w-[1600px] bg-nada-surface md:h-[calc(100dvh-2rem)] md:rounded-3xl md:border md:border-nada-border/10 md:shadow-2xl md:overflow-hidden">
        <aside
          className={cn(
            "nada-sidebar relative flex w-full flex-col overflow-hidden md:w-[360px] lg:w-[400px] md:border-r md:border-nada-border/10 bg-nada-surface",
            selectedContact || selectedGroup ? "hidden md:flex" : "flex"
          )}
        >
        <MobileChatsHome
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          unreadTotal={totalUnreadCount}
          onComposeClick={() => setPanel("contacts")}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setPanel(null);
            setShowGhostModal(false);
            setShowMoodModal(false);
          }}
          headerProps={{
            displayName: displayName,
            activeTab: activeTab,
            onCameraClick: () => setPanel("status_create" as Panel),
            onMoreClick: () => setPanel("settings")
          }}
        >
          {activeTab === "status" ? (
            <StatusView 
              identity={identity}
              contacts={contacts}
              statuses={allStatuses}
              onPostStatus={() => setPanel("status_create" as Panel)}
              onViewStatus={(hash) => setSelectedStatusSenderHash(hash)}
            />
          ) : activeTab === "settings" ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-6 animate-fade-in">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-nada-border/[.08]" style={{ background: "rgb(var(--nada-surface-elevated))" }}>
                <Settings className="h-9 w-9 text-nada-secondary/[.20]" />
              </div>
              <h3 className="mb-2 text-base font-bold text-nada-primary">Settings</h3>
              <p className="mb-8 text-sm leading-relaxed text-nada-secondary/[.60]">
                Configure your account, privacy, and appearance.
              </p>
              <button className="nada-btn-gold px-6 py-3 text-sm font-bold" onClick={() => setPanel("settings")}>
                Open Settings
              </button>
            </div>
          ) : (
          <div className="flex flex-col">
            <RelayStatus status={relayStatus} />
            <ArchivedRow count={0} />
            
            {contacts.length === 0 && chats.length === 0 ? (
              <EmptyChatListState onAdd={() => setPanel("contacts")} />
            ) : (
              <>
                {chats
                  .filter((chat) => {
                    if (activeFilter === "groups") return true;
                    if (activeFilter === "unread" && (unreadCounts[chat.id] ?? 0) === 0) return false;
                    return matchesSearch(chat.title, searchQuery);
                  })
                  .map((chat) => {
                    const chatId = chat.id;
                    const lastMsg = lastMessages[chatId];
                    const unread = unreadCounts[chatId] ?? 0;
                    return (
                      <ChatListItem
                        key={chat.id}
                        name={chat.title}
                        preview={lastMsg?.body || "Start a conversation"}
                        timestamp={lastMsg && lastMsg.ts > 0 ? formatRelativeTime(lastMsg.ts) : ""}
                        unreadCount={unread}
                        initials={chat.title.slice(0, 1).toUpperCase()}
                        isSelected={selectedGroupId === chat.id}
                        onClick={() => {
                          setSelectedContactHash(null);
                          setSelectedGroupId(chat.id);
                          setDisappearingTimer(chat.disappearingTimer);
                          setMessageSearchQuery("");
                        }}
                      />
                    );
                  })}
                {activeTab !== "communities" && contacts
                  .filter((contact) => {
                    if (activeFilter === "groups") return false;
                    const chatId = directChatId(identity.pubkeyHash, contact.pubkeyHash);
                    if (activeFilter === "unread" && (unreadCounts[chatId] ?? 0) === 0) return false;
                    return matchesSearch(
                      `${contact.localDisplayName} ${contact.pubkeyHash}`,
                      searchQuery
                    );
                  })
                  .map((contact) => {
                    const chatId = directChatId(identity.pubkeyHash, contact.pubkeyHash);
                    const lastMsg = lastMessages[chatId];
                    const unread = unreadCounts[chatId] ?? 0;
                    return (
                      <ChatListItem
                        key={contact.id}
                        name={contact.localDisplayName}
                        preview={lastMsg?.body || "Start a conversation"}
                        timestamp={lastMsg && lastMsg.ts > 0 ? formatRelativeTime(lastMsg.ts) : ""}
                        unreadCount={unread}
                        initials={contact.localDisplayName.slice(0, 1).toUpperCase()}
                        isSelected={selectedContactHash === contact.pubkeyHash}
                        isOnline={true}
                        onClick={() => {
                          setSelectedGroupId(null);
                          setSelectedContactHash(contact.pubkeyHash);
                          setMessageSearchQuery("");
                        }}
                      />
                    );
                  })}
                
                
              </>
            )}
            </div>
          )}
        </MobileChatsHome>
      </aside>

      <ChatPanel
        canAttachFile={Boolean(selectedContact || selectedGroup)}
        canCopyGroupInvite={Boolean(selectedGroup?.groupSenderKey)}
        contact={selectedContact}
        disappearingTimer={disappearingTimer}
        editingMessage={editingMessage}
        isGroup={Boolean(selectedGroup)}
        messageSearchQuery={messageSearchQuery}
        messageText={messageText}
        messages={chatMessages}
        onBack={() => {
          setSelectedContactHash(null);
          setSelectedGroupId(null);
          setMessageSearchQuery("");
        }}
        onAttachFile={attachFile}
        onCancelEdit={() => {
          setEditingMessageId(null);
          setMessageText("");
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
          setMessageText(message.body);
        }}
        onMessageSearchChange={setMessageSearchQuery}
        onMessageTextChange={setMessageText}
        onReply={(message) => {
          setReplyToId(message.id);
        }}
        onSend={(event) => {
          void sendMessage(event);
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
          setChatPrefState(await getChatPref(selectedChatId));
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
          />
        ) : null}
        {panel === ("status_create" as Panel) ? (
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
            senderName={
              selectedStatusSenderHash === identity.pubkeyHash 
                ? "My Status" 
                : contacts.find(c => c.pubkeyHash === selectedStatusSenderHash)?.localDisplayName || "Someone"
            }
            statuses={allStatuses.filter(s => s.senderPubkeyHash === selectedStatusSenderHash)}
            onClose={() => setSelectedStatusSenderHash(null)}
          />
        ) : null}
      </AnimatePresence>
      <IncomingCallModal
        onAccept={async () => {
          const snap = callStore.call;
          if (!snap || !snap.pendingOfferSdp) return;

          try {
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
        onReject={() => { endCall(); }}
      />
      <VoiceCallOverlay onEnd={endCall} />
      <VideoCallOverlay onEnd={endCall} />
      <GroupCallOverlay />

      {/* Dashboard-level toast */}
      <AnimatePresence>
        {dashboardToast && (
          <motion.div
            className="fixed bottom-24 left-1/2 z-[950] -translate-x-1/2 rounded-xl bg-nada-surface border border-nada-border/[.05]0 px-5 py-3 text-sm text-nada-primary shadow-xl"
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
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/[.05]0 p-6 shadow-2xl"
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
            className="fixed top-4 left-1/2 z-[1000] -translate-x-1/2 cursor-pointer rounded-2xl bg-nada-surface border border-nada-border/[.05]0 p-4 shadow-2xl flex items-center gap-4 w-[90%] max-w-sm"
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            onClick={() => {
              setInAppNotification(null);
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
              className="relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-nada-surface border border-nada-border/[.05]0 shadow-2xl flex flex-col max-h-[80vh]"
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
                     <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-nada-muted text-nada-primary">
                       <Users size={20} />
                     </div>
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
                     <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-nada-muted text-nada-primary">
                       <span className="text-lg">{contact.localDisplayName.charAt(0).toUpperCase()}</span>
                     </div>
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
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/[.05]0 p-6 shadow-2xl"
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

function RelayStatus({ status }: { status: string }): JSX.Element {
  const isConnected = status === "connected";
  const copy =
    status === "connected"
      ? "Connected"
      : status === "missing-url"
        ? "Relay URL missing"
        : "Connecting...";

  return (
    <div className="mx-5 mb-2 flex items-center gap-2 rounded-2xl border border-nada-border/[.08] px-3 py-2 text-xs text-nada-secondary/[.60]" style={{ background: "rgb(var(--nada-surface-elevated))" }}>
      <div className={cn(
        "h-1.5 w-1.5 rounded-full",
        isConnected ? "bg-nada-success animate-pulse" : "bg-nada-danger"
      )} />
      {copy}
    </div>
  );
}



function ChatPanel({
  canAttachFile,
  canCopyGroupInvite,
  contact,
  disappearingTimer,
  editingMessage,
  isGroup,
  messageSearchQuery,
  messageText,
  messages,
  onBack,
  onAttachFile,
  onCancelEdit,
  onCancelReply,
  onCopyGroupInvite,
  onDisappearingTimerChange,
  onEditMessage,
  onMessageSearchChange,
  onMessageTextChange,
  onReply,
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
  contact: ContactRecord | null;
  disappearingTimer: number;
  editingMessage: MessageRecord | null;
  isGroup: boolean;
  messageSearchQuery: string;
  messageText: string;
  messages: MessageRecord[];
  onBack: () => void;
  onAttachFile: (file: File) => Promise<boolean>;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onCopyGroupInvite: () => void;
  onDisappearingTimerChange: (value: number) => void;
  onEditMessage: (message: MessageRecord) => void;
  onMessageSearchChange: (value: string) => void;
  onMessageTextChange: (value: string) => void;
  onReply: (message: MessageRecord) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
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
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [reactionPickerForId, setReactionPickerForId] = useState<string | null>(null);
  const [showWallpaperPrompt, setShowWallpaperPrompt] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteSheetMessageId, setDeleteSheetMessageId] = useState<string | null>(null);

  useEffect(() => {
    const anyOpen =
      showWallpaperPrompt ||
      showPollModal ||
      showMuteModal ||
      showClearModal ||
      showBlockModal ||
      showProfilePanel ||
      deleteSheetMessageId !== null;
    if (!anyOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showWallpaperPrompt) setShowWallpaperPrompt(false);
      else if (showPollModal) setShowPollModal(false);
      else if (showMuteModal) setShowMuteModal(false);
      else if (showClearModal) setShowClearModal(false);
      else if (showBlockModal) setShowBlockModal(false);
      else if (showProfilePanel) setShowProfilePanel(false);
      else if (deleteSheetMessageId !== null) setDeleteSheetMessageId(null);
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
    deleteSheetMessageId
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Handle chat search scrolling
  useEffect(() => {
    if (chatSearchActive && searchMatchIds.length > 0) {
      const matchId = searchMatchIds[chatSearchIdx];
      if (matchId) {
        const el = messageRefs.current[matchId];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Subtle highlight animation
          el.animate([
            { backgroundColor: 'rgba(var(--nada-accent), 0.2)' },
            { backgroundColor: 'transparent' }
          ], { duration: 2000 });
        }
      }
    }
  }, [chatSearchIdx, searchMatchIds, chatSearchActive]);

  useEffect(() => {
    return () => {
      // Cleanup any active recordings when the chat panel unmounts
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
      <section className="hidden flex-1 flex-col items-center justify-center md:flex" style={{ background: "rgb(var(--nada-bg))" }}>
        <div className="max-w-xs text-center animate-fade-in">
          <div
            className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl overflow-hidden shadow-gold-glow"
            style={{ background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))" }}
          >
            <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
          </div>
          <h2 className="text-lg font-bold text-nada-primary">NADA</h2>
          <p className="mt-2 text-sm text-nada-secondary/70 leading-relaxed">
            Select a conversation to begin.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section 
      className="relative flex min-h-dvh flex-1 flex-col overflow-hidden" 
      style={{ 
        background: wallpaperUrl ? `url(${wallpaperUrl}) center/cover no-repeat` : "#05050A" 
      }}
    >
      {!wallpaperUrl && (
        <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/stardust.png')" }} />
      )}
      {/* Dark overlay for readability if wallpaper is set */}
      {wallpaperUrl && <div className="absolute inset-0 bg-black/40 z-0 pointer-events-none" />}
      
      {/* Chat Header */}
      <header
        className="z-header relative flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.04] px-4 pl-safe-area pr-safe-area"
        style={{ background: "rgba(13, 20, 30, 0.8)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
        <IconButton className="md:hidden" label="Back" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        {/* Avatar with online ring */}
        <div className="relative shrink-0">
          <div
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl text-sm font-bold text-white shadow-lg"
            style={{ 
              background: "linear-gradient(135deg, #2AABEE 0%, #1A7AB0 100%)",
              boxShadow: "0 2px 8px rgba(42, 171, 238, 0.3)"
            }}
          >
            {title.charAt(0).toUpperCase()}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-nada-primary" style={{ letterSpacing: "-0.2px" }}>{title}</h2>
          <p className="truncate text-xs text-nada-secondary/[.60]">{subtitle || "Tap for info"}</p>
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
                  <div className="absolute right-0 top-full z-50 mt-2 w-52 origin-top-right rounded-2xl border border-nada-border/[.08] py-1 shadow-dark-lg animate-scale-in" style={{ background: "rgb(var(--nada-surface-elevated))" }}>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated transition-colors"
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
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setChatSearchActive(true);
                      }}
                    >
                      <Search size={14} className="text-nada-accent/70" />
                      Search in chat
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated transition-colors"
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
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated transition-colors"
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
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated transition-colors"
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
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-danger hover:bg-nada-surface-elevated transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowClearModal(true);
                      }}
                    >
                      <Trash2 size={14} className="text-nada-danger/70" />
                      Clear chat
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-danger hover:bg-nada-surface-elevated transition-colors"
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

      {/* Typing indicator */}
      {peerIsTyping && !peerIsBlocked && (
        <div className="flex items-center gap-2 border-b border-nada-border/[.08] px-4 py-2 text-xs text-nada-accent/80 animate-fade-in" style={{ background: "rgb(var(--nada-surface))" }}>
          <span className="flex gap-1">
            <span className="nada-typing-dot" style={{ width: 5, height: 5 }} />
            <span className="nada-typing-dot" style={{ width: 5, height: 5 }} />
            <span className="nada-typing-dot" style={{ width: 5, height: 5 }} />
          </span>
          <span className="text-nada-secondary/[.60]">{title} is typing…</span>
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
            const el = messageRefs.current[pinnedMessageId];
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
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
            className="absolute left-1/2 top-20 z-[100] -translate-x-1/2 rounded-xl bg-nada-surface border border-nada-border/[.05]0 px-4 py-2.5 text-sm text-nada-primary shadow-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
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
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/[.05]0 p-6 shadow-2xl"
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
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/[.05]0 p-6 shadow-2xl"
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

      {/* Block user confirmation modal */}
      <AnimatePresence>
        {showBlockModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowBlockModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/[.05]0 p-6 shadow-2xl"
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
                className="relative z-10 w-full max-w-lg rounded-t-2xl bg-nada-surface border-t border-nada-border/[.05]0 p-2 pb-safe shadow-2xl"
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
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/[.05]0 p-6 shadow-2xl"
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
                  className="w-full rounded-xl border border-nada-border/[.05]0 bg-black/40 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/50 focus:border-nada-accent focus:outline-none mb-4"
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
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/[.05]0 p-6 shadow-2xl flex flex-col max-h-[80vh]"
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
                  className="w-full rounded-xl border border-nada-border/[.05]0 bg-black/40 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/50 focus:border-nada-accent focus:outline-none font-medium"
                  autoFocus
                />
                
                <div className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1 py-2">
                  {[0,1,2,3,4,5,6,7,8,9].map((i) => (
                    <input
                      key={i}
                      name={`opt${i}`}
                      placeholder={`Option ${i + 1}${i >= 2 ? ' (optional)' : ''}`}
                      className="w-full rounded-xl border border-nada-border/[.05]0 bg-black/20 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/30 focus:border-nada-accent focus:outline-none"
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-2 px-1">
                  <input type="checkbox" id="multipleAnswers" name="multipleAnswers" value="true" className="rounded bg-black/40 border-nada-border/[.05]0 text-nada-accent focus:ring-nada-accent focus:ring-offset-nada-surface" />
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
              className="relative z-10 w-full max-w-sm h-full bg-nada-surface border-l border-nada-border/[.05]0 overflow-y-auto"
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

      <div className="flex items-center gap-2 border-b border-nada-border/30 bg-nada-muted/50 px-4 py-1.5 text-2xs text-nada-secondary">
        <Clock size={12} />
        <select
          className="rounded-lg border border-nada-border bg-nada-surface px-2 py-1 text-2xs text-nada-primary outline-none"
          onChange={(event) => {
            onDisappearingTimerChange(Number(event.target.value));
          }}
          value={disappearingTimer}
        >
          <option value={0}>Keep messages</option>
          <option value={60000}>1 min</option>
          <option value={3600000}>1 hour</option>
          <option value={86400000}>1 day</option>
        </select>
        <div className="ml-auto">
          <label className="flex h-8 items-center gap-2 rounded-lg border border-nada-border bg-nada-surface px-2.5">
            <Search size={13} />
            <input
              className="w-28 bg-transparent text-2xs text-nada-primary outline-none placeholder:text-nada-secondary/[.60]"
              onChange={(event) => {
                onMessageSearchChange(event.target.value);
              }}
              placeholder="Search..."
              value={messageSearchQuery}
            />
          </label>
        </div>
      </div>
      {uploadStatus ? (
        <div className="border-b border-nada-border/30 bg-nada-accent/5 px-4 py-2 text-xs text-nada-accent">
          {uploadStatus}
        </div>
      ) : null}

      <div className="relative flex-1 space-y-0.5 overflow-y-auto px-4 py-4 pb-32" style={{ background: wallpaperUrl ? "transparent" : "rgb(var(--nada-bg))" }}>
        {blurShieldActive && !blurShieldRevealed && (
          <div className="nada-blur-shield" onClick={onRevealBlurShield}>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-nada-surface/80 text-nada-secondary">
                <EyeOff size={22} />
              </div>
              <p className="text-sm font-medium text-nada-primary">Privacy shield active</p>
              <p className="text-xs text-nada-secondary">Tap to reveal messages</p>
            </div>
          </div>
        )}
        {messages.map((message, index) => {
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
                : `${isVideo ? "Video" : "Voice"} call started`;
            const isMissed = callLog.status === "missed";
            return (
              <div key={message.id} ref={(el) => { messageRefs.current[message.id] = el; }}>
                {showDateSep && (
                  <div className="flex justify-center py-4">
                    <span className="rounded-full border border-nada-border/[.08] px-3 py-1 text-[11px] font-medium text-nada-secondary/[.50]" style={{ background: "rgb(var(--nada-surface-elevated))" }}>
                      {new Date(message.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  </div>
                )}
                <div className="flex justify-center py-2">
                  <div className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium",
                    isMissed
                      ? "bg-red-500/10 text-red-400"
                      : "bg-nada-muted text-nada-secondary"
                  )}>
                    {isVideo
                      ? <Video size={13} />
                      : <Phone size={13} />}
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

          return (
            <div key={message.id} ref={(el) => { messageRefs.current[message.id] = el; }} className={cn(isFirstInCluster ? "mt-3" : "mt-0.5")}>
              {/* Date separator */}
              {showDateSep && (
                <div className="flex justify-center py-4">
                  <span className="rounded-full border border-nada-border/[.08] px-3 py-1 text-[11px] font-medium text-nada-secondary/[.50]" style={{ background: "rgb(var(--nada-surface-elevated))" }}>
                    {new Date(message.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </div>
              )}
              <motion.div
                animate={{ opacity: 1, y: 0 }}
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
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActiveMessageMenu(isMenuOpen ? null : message.id);
                }}
                onPointerDown={(e) => {
                  longPressTimer.current = setTimeout(() => {
                    setActiveMessageMenu(message.id);
                  }, 500);
                  if (e.pointerType === "mouse") {
                    clearTimeout(longPressTimer.current);
                  }
                }}
                onPointerUp={() => {
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
                }}
                onPointerLeave={() => {
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
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
                    "relative max-w-[85%] px-4 py-2.5",
                    message.direction === "outbound"
                      ? cn("nada-bubble-sent", isLastInCluster && "has-tail")
                      : cn("nada-bubble-received", isLastInCluster && "has-tail"),
                    isPinned && "ring-1 ring-nada-accent/40"
                  )}
                >
                  {message.replyToId ? (
                    <div 
                      className="mb-1.5 rounded-lg bg-black/10 px-2.5 py-1.5 text-xs opacity-80 cursor-pointer hover:opacity-100 transition-opacity"
                      onClick={() => {
                        const el = messageRefs.current[message.replyToId!];
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "center" });
                          el.animate([
                            { backgroundColor: 'rgba(56, 189, 248, 0.3)' },
                            { backgroundColor: 'transparent' }
                          ], { duration: 1500 });
                        }
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
                          <div className="flex flex-col border-l-2 border-nada-accent pl-2">
                            <span className="font-semibold text-[10px] text-nada-accent">{senderName}</span>
                            <span className="truncate opacity-80">
                              {previewText.length > 48 ? `${previewText.slice(0, 48)}...` : previewText}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                  <MessageContent
                    message={message}
                    outbound={message.direction === "outbound"}
                    onOpenMedia={setMediaViewer}
                    onReact={onReact}
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
                        ? "text-white/60"
                        : "text-nada-secondary"
                    )}
                  >
                    {message.editedAt ? <span>edited ·</span> : null}
                    {isVanishing && <Flame size={10} className="opacity-70" />}
                    <span>{formatTime(message.createdAt)}</span>
                    {message.direction === "outbound" && (
                      <span className="ml-0.5">
                        {message.status === "delivered" ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>

                  {/* Hover actions — desktop only */}
                  <div className={cn(
                    "absolute -top-8 right-0 flex items-center gap-0.5 rounded-lg border border-nada-border/40 bg-nada-surface px-1 py-0.5 shadow-md transition-all z-10",
                    isMenuOpen ? "opacity-100 visible" : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
                  )}>
                    {/* Reaction picker toggle */}
                    <div className="relative">
                      <button
                        aria-label="React"
                        className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReactionPickerForId(reactionPickerForId === message.id ? null : message.id);
                          setActiveMessageMenu(null);
                        }}
                        type="button"
                      >
                        <Smile size={14} />
                      </button>
                      {reactionPickerForId === message.id && (
                        <motion.div
                          className="absolute -top-10 left-0 flex gap-1 rounded-lg border border-nada-border/[.05]0 bg-nada-surface p-1.5 shadow-lg z-20"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                        >
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              className="text-base hover:scale-125 transition-transform"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReact(message, emoji);
                                setReactionPickerForId(null);
                              }}
                              type="button"
                            >
                              {emoji}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                    <button
                      aria-label="Reply"
                      className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary"
                      onClick={() => { onReply(message); setActiveMessageMenu(null); }}
                      type="button"
                    >
                      <Reply size={14} />
                    </button>
                    <button
                      aria-label="Forward"
                      className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary"
                      onClick={() => { onForward(message.id); setActiveMessageMenu(null); }}
                      type="button"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      aria-label="Pin message"
                      className={cn(
                        "rounded-md p-1.5 transition hover:bg-nada-muted",
                        isPinned ? "text-nada-accent" : "text-nada-secondary hover:text-nada-primary"
                      )}
                      onClick={() => { onPin(message); setActiveMessageMenu(null); }}
                      type="button"
                    >
                      <Pin size={14} />
                    </button>
                    {message.direction === "outbound" && !message.deletedAt ? (
                       <>
                        <button
                          aria-label="Edit"
                          className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary"
                          onClick={() => { onEditMessage(message); setActiveMessageMenu(null); }}
                          type="button"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          aria-label="Delete"
                          className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-danger"
                          onClick={() => { setDeleteSheetMessageId(message.id); setActiveMessageMenu(null); }}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : !message.deletedAt ? (
                      <button
                        aria-label="Delete for me"
                        className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-danger"
                        onClick={() => { setDeleteSheetMessageId(message.id); setActiveMessageMenu(null); }}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
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
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Click-away to close message menu / reaction picker */}
      {(activeMessageMenu || reactionPickerForId) && (
        <div className="fixed inset-0 z-30" onClick={() => {
          setActiveMessageMenu(null);
          setReactionPickerForId(null);
        }} />
      )}

      <form
        className={cn(
          "nada-input-bar relative sticky bottom-0 z-header px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
          peerIsBlocked && "pointer-events-none opacity-40"
        )}
        onSubmit={onSend}
      >
        {/* Message reply preview */}

        {replyMessage ? (
          <div className="mb-2.5 flex items-center justify-between rounded-xl px-3 py-2 border-l-2 border-nada-accent backdrop-blur-md" style={{ background: "rgba(42, 171, 238, 0.08)" }}>
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
          <div className="mb-2 flex items-center justify-between rounded-lg bg-nada-accent/10 px-3 py-2 text-xs text-nada-accent">
            <span className="truncate">Editing message</span>
            <button className="ml-2 shrink-0" onClick={onCancelEdit} type="button">
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
        <div className="flex items-center gap-2">
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-nada-secondary/[.60] transition hover:bg-white/10 hover:text-white active:scale-90"
                disabled={!canAttachFile || peerIsBlocked}
                onClick={() => { setAttachmentMenuOpen((current) => !current); }}
                type="button"
              >
                <Plus size={20} />
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
                className="h-11 min-w-0 flex-1 rounded-full border border-white/[0.05] bg-white/5 px-4 text-[15px] text-nada-primary outline-none placeholder:text-nada-secondary/[.30] focus:border-nada-accent/30 focus:bg-white/[0.08] transition-all disabled:opacity-50"
                disabled={peerIsBlocked}
                onChange={(event) => {
                  const val = event.target.value;
                  onMessageTextChange(val);
                  
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
                    const syntheticEvent = { preventDefault: () => {} } as FormEvent<HTMLFormElement>;
                    onSend(syntheticEvent);
                  }
                }}
                placeholder="Type a message..."
                value={messageText}
              />
              {messageText.trim() ? (
                <button
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-black shadow-gold-glow transition-all duration-150 active:scale-90"
                  style={{ background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))" }}
                  type="submit"
                  aria-label="Send message"
                >
                  <Send size={17} />
                </button>
              ) : (
                <button
                  aria-label="Voice note — hold to record"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-black shadow-gold-glow transition-all active:scale-90"
                  style={{ background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))" }}
                  onPointerDown={startRecording}
                  type="button"
                >
                  <Mic size={18} />
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

function MessageContent({
  message,
  outbound,
  onOpenMedia,
  onReact
}: {
  message: MessageRecord;
  outbound: boolean;
  onOpenMedia: (viewer: { name: string; url: string; mimeType: string }) => void;
  onReact?: (message: MessageRecord, emoji: string) => void;
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
      return resolvedUrl ? (
        <VoiceNoteBubble
          durationSeconds={Math.round(media.duration ?? 0)}
          outbound={outbound}
          src={resolvedUrl}
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
        durationSeconds={voice.durationSeconds}
        outbound={outbound}
        src={voice.src}
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
  const options = [
    { label: "Photo", icon: Image, action: onPickImage },
    { label: "Camera", icon: Camera, action: onPickCamera },
    { label: "Document", icon: FileText, action: onPickDocument },
    { label: "Video", icon: Video, action: onPickVideo },
    { label: "Audio", icon: Music, action: onPickAudio },
    ...(onPickPoll ? [{ label: "Poll", icon: FileText, action: onPickPoll }] : [])
  ];

  return (
    <div className="absolute bottom-16 left-3 z-40 grid w-52 gap-1 rounded-2xl border border-nada-border/[.05]0 bg-nada-surface p-2 shadow-xl animate-scale-in">
      {options.map((option) => (
        <button
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-nada-primary transition-colors hover:bg-nada-muted"
          key={option.label}
          onClick={option.action}
          type="button"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-nada-accent/10 text-nada-accent">
            <option.icon size={17} />
          </span>
          {option.label}
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
    <div className="mb-2 rounded-2xl border border-nada-border/[.05]0 bg-nada-muted/70 p-3">
      <div className="flex gap-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-nada-surface">
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
          <p className="truncate text-sm font-semibold text-nada-primary">{name}</p>
          <p className="mt-1 text-xs text-nada-secondary">
            {draft.file.type || "application/octet-stream"} - {formatBytes(draft.originalFile.size)}
          </p>
          {draft.width && draft.height ? (
            <p className="mt-1 text-xs text-nada-secondary">
              {draft.width} x {draft.height}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-nada-danger">{error}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded-xl px-3 py-2 text-xs font-medium text-nada-secondary transition-colors hover:bg-nada-surface"
          disabled={isSending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-nada-accent px-4 py-2 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-60"
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
        <div className="grid place-items-center rounded-xl bg-[#F8F4E6] p-5">
          {inviteUrl ? (
            <QRCodeSVG
              bgColor="#F8F4E6"
              fgColor="#0A0A0F"
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

      <div className="mt-6 border-t border-nada-border/[.05]0 pt-5">
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
  label: string;
  plan: PaidBillingPlan;
}> = [
  {
    description: "Larger files, longer relay retention, themes, backups.",
    label: "Pro",
    plan: "pro"
  },
  {
    description: "Verified anonymous profile, catalog, bot API, ZK analytics.",
    label: "Business",
    plan: "business"
  },
  {
    description: "Self-hosted relay, SLA, admin controls, compliance docs.",
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

      <div className="mt-5 border-t border-nada-border/[.05]0 pt-5">
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
  onDisplayNameChange
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
            className="flex w-full items-center justify-between border-b border-nada-border/[.08] px-4 py-3.5 text-left hover:bg-nada-surface-elevated transition-colors"
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
            className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-nada-surface-elevated transition-colors"
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

      {/* Actions */}
      <div className="mt-5 space-y-1">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nada-secondary/[.40]">More</p>
        <div className="rounded-2xl border border-nada-border/[.08] overflow-hidden" style={{ background: "rgb(var(--nada-surface))" }}>
          <button
            className="flex w-full items-center gap-3 border-b border-nada-border/[.08] px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated transition-colors"
            onClick={onOpenBilling}
          >
            <CreditCard size={15} className="text-nada-accent/70" />
            Plans &amp; Billing
            <ChevronDown size={14} className="ml-auto rotate-[-90deg] text-nada-secondary/[.30]" />
          </button>
          <button
            className="flex w-full items-center gap-3 border-b border-nada-border/[.08] px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated transition-colors"
            onClick={onOpenShare}
          >
            <Share2 size={15} className="text-nada-accent/70" />
            Share invite card
            <ChevronDown size={14} className="ml-auto rotate-[-90deg] text-nada-secondary/[.30]" />
          </button>
          <button
            className="flex w-full items-center gap-3 px-4 py-3.5 text-sm text-nada-primary hover:bg-nada-surface-elevated transition-colors"
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
    </Sheet>
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
      className="nada-overlay fixed inset-0 z-overlay p-0 md:p-3"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="nada-sheet ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto rounded-none md:rounded-2xl p-5 pt-safe-area pb-safe-area pl-safe-area pr-safe-area"
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

async function upsertContact(payload: InvitePayload): Promise<ContactRecord> {
  const existing = await nadaDb.contacts.get(payload.pubkeyHash);
  const contact: ContactRecord = {
    id: payload.pubkeyHash,
    pubkeyHash: payload.pubkeyHash,
    publicKey: payload.publicKey,
    localDisplayName:
      existing?.localDisplayName ?? `NADA ${payload.pubkeyHash.slice(0, 8)}`,
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
  const myStatuses = statuses.filter(s => s.senderPubkeyHash === identity.pubkeyHash);
  const otherStatuses = statuses.filter(s => s.senderPubkeyHash !== identity.pubkeyHash);
  
  const grouped = otherStatuses.reduce((acc, s) => {
    if (!acc[s.senderPubkeyHash]) acc[s.senderPubkeyHash] = [];
    acc[s.senderPubkeyHash]!.push(s);
    return acc;
  }, {} as Record<string, MessageRecord[]>);

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-20">
      <div className="px-5 py-4 border-b border-nada-border/[.05]">
        <h2 className="text-xl font-bold text-nada-primary">Status</h2>
      </div>

      <div className="px-5 py-4 flex items-center gap-4 hover:bg-nada-surface-elevated/30 cursor-pointer" 
           onClick={() => myStatuses.length > 0 ? onViewStatus(identity.pubkeyHash) : onPostStatus()}>
        <div className="relative">
          <div className="h-14 w-14 rounded-2xl border-2 border-nada-accent/40 p-0.5">
            <div className="h-full w-full rounded-xl bg-nada-muted flex items-center justify-center overflow-hidden">
               {myStatuses.length > 0 ? <CircleDashed className="text-nada-accent animate-spin-slow" size={24} /> : <Plus className="text-nada-accent" size={24} />}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-nada-primary">My Status</h3>
          <p className="text-sm text-nada-secondary/[.60] truncate">
            {myStatuses.length > 0 ? "Tap to view updates" : "Tap to add status update"}
          </p>
        </div>
        {myStatuses.length === 0 && (
          <button className="p-2 text-nada-accent" onClick={(e) => { e.stopPropagation(); onPostStatus(); }}>
            <Plus size={20} />
          </button>
        )}
      </div>

      {Object.entries(grouped).length > 0 && (
        <div className="mt-4">
          <p className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-nada-secondary/[.40]">Recent updates</p>
          {Object.entries(grouped).map(([hash, list]) => {
            const contact = contacts.find(c => c.pubkeyHash === hash);
            const name = contact?.localDisplayName || hash.slice(0, 8);
            const latest = list[0]!;
            return (
              <div key={hash} className="px-5 py-3 flex items-center gap-4 hover:bg-nada-surface-elevated/30 cursor-pointer" onClick={() => onViewStatus(hash)}>
                <div className="h-14 w-14 rounded-2xl border-2 border-nada-accent p-0.5">
                  <div className="h-full w-full rounded-xl bg-nada-muted flex items-center justify-center overflow-hidden">
                    <CircleDashed className="text-nada-accent" size={24} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-nada-primary">{name}</h3>
                  <p className="text-sm text-nada-secondary/[.60] truncate">
                    {formatRelativeTime(latest.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[1000] flex flex-col bg-black md:relative md:inset-auto md:h-full md:w-full pt-safe-area pb-safe-area pl-safe-area pr-safe-area"
      initial={{ y: "100%" }} 
      animate={{ y: 0 }} 
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
    >
      <div className="flex h-16 items-center justify-between px-4 text-white">
        <button onClick={onClose} className="p-2"><X size={24} /></button>
        <h2 className="font-bold">Add Status</h2>
        <button 
          onClick={() => {
            if (!text.trim()) return;
            setIsPosting(true);
            onPost(text);
          }}
          disabled={!text.trim() || isPosting}
          className="rounded-full bg-nada-accent px-5 py-1.5 text-sm font-bold text-black disabled:opacity-50"
        >
          Post
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6">
        <textarea
          autoFocus
          className="w-full bg-transparent text-center text-3xl font-bold text-white outline-none placeholder:text-white/20 resize-none"
          placeholder="Type a status..."
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
        />
      </div>
    </motion.div>
  );
}

function StatusViewerSheet({
  senderName,
  statuses,
  onClose
}: {
  senderName: string;
  statuses: MessageRecord[];
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentStatus = statuses[currentIndex];

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentIndex < statuses.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        onClose();
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentIndex, statuses.length, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!currentStatus) return null;

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
             <div className="h-10 w-10 rounded-full bg-nada-accent/20 flex items-center justify-center">
                <span className="font-bold text-nada-accent">{senderName.slice(0,1)}</span>
             </div>
             <div>
                <h3 className="font-bold">{senderName}</h3>
                <p className="text-[10px] opacity-60">{formatRelativeTime(currentStatus.createdAt)}</p>
             </div>
          </div>
          <button onClick={onClose}><X size={24} /></button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <p className="text-3xl font-bold leading-tight max-w-lg">
          {decodeMessagePayload(currentStatus.body)?.text ?? "..."}
        </p>
      </div>
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

    await nadaDb.messages.put({
      id: envelope.id,
      chatId,
      senderPubkeyHash: envelope.sender,
      recipientPubkeyHash: identity.pubkeyHash,
      direction: "inbound",
      kind: envelope.messageKind ?? decodeMessagePayload(body)?.type ?? "text",
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
    const existingChat = await nadaDb.chats.get(envelope.groupId);
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
        createdAt: now,
        updatedAt: envelope.timestamp,
        disappearingTimer: 0
      });
    } else {
      await nadaDb.chats.update(envelope.groupId, {
        updatedAt: envelope.timestamp
      });
    }

    const existingMessage = await nadaDb.messages.get(envelope.id);
    if (existingMessage) {
      continue;
    }

    // Try to decrypt the group message body
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
