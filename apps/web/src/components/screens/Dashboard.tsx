"use client";
/* eslint-disable */
import "../chat/chat.css";
import dynamic from "next/dynamic";
import { type ChatPrefRecord, getGlobalSetting, nadaDb, directChatId, isBlocked, isMuted, setGlobalSetting, getChatPref, loadMessagesForChat, markChatAsRead, setChatPref } from "@/lib/db";
import { parseInviteToken, parseGroupInviteToken, buildGroupInviteUrl } from "@/lib/invite";
import { buildReplySnapshot, textFromMessage, previewForMessage, messageKindFromRecord, buildTextPayload, encodeMessagePayload, buildMediaPayload } from "@/lib/media-message";
import { validateMediaFile, prepareMediaFile, uploadEncryptedMedia } from "@/lib/media-upload";
import { getRelayHttpBaseUrl } from "@/lib/relay-url";
import { whispersRelayConfigured, queryWhisperFeed, publishEchoRemote, deleteEchoRemote, reflectRemote, reactRemote, rippleRemote, queryWhisperReflections, deleteReflectionRemote, reactReflectionRemote, queryWhisperNotifications, markWhisperNotificationsReadRemote } from "@/lib/whispers";
import type { CallMode, LocalCallSession } from "@/lib/webrtc";
import { createLocalCallSession } from "@/lib/webrtc";
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useCallStore } from "@/stores/useCallStore";
import { useIdentityStore } from "@/stores/useIdentityStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { parseCommunityRecords, parseWhisperEchoes, parseWhisperNotifications, seedWhisperEchoes, parseSafetyReports, parseNotificationSettings, persistIncomingMessages, formatRelativeTime, generateRandomUsername, isLegacyNadaName, mergeMessageRecords, upsertContact, upsertGroupFromInvite, deliveryStatusRank, parseStatusReactionPayload, persistIncomingGroupMessages, extractMentions, statusCommentChatId, defaultCommunityChannels, defaultCommunityTopics, dataUrlSize, matchesSearch } from "@/utils/helpers";
import { encryptGroupMessage, mockEncryptMessage, createGroupSenderKey } from "@nada/crypto";
import type { IdentityRecord, ChatRecord, ContactRecord, MessageRecord } from "@nada/db";
import type { MessageEnvelope, ReplyToMessage, GroupMessageEnvelope, PollData, MediaAttachment, GroupInvitePayload } from "@nada/types";
import { cn, GroupOrb, IdentityOrb } from "@nada/ui";
import Dexie from "dexie";
import { motion, AnimatePresence } from "framer-motion";
import { Ghost, Bell, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { IncomingCallModal, VoiceCallOverlay, VideoCallOverlay } from "../CallOverlay";
import { GlobalSearchResults } from "../chat/ChatPanel";
const ChatPanel = dynamic(() => import("../chat/ChatPanel").then(m => m.ChatPanel), { ssr: false });
import { GroupCallOverlay } from "../GroupCallOverlay";
import { DesktopNavRail, MobileChatsHome, ArchivedRow, EmptyChatListState, ChatListItem } from "../NadaMobileUI";
const BillingSheet = dynamic(() => import("../panels/BillingSheet").then(m => m.BillingSheet), { ssr: false });
const ContactSheet = dynamic(() => import("../panels/ContactSheets").then(m => m.ContactSheet), { ssr: false });
const MigrationSheet = dynamic(() => import("../panels/ContactSheets").then(m => m.MigrationSheet), { ssr: false });
const ShareSheet = dynamic(() => import("../panels/ContactSheets").then(m => m.ShareSheet), { ssr: false });
const GroupSheet = dynamic(() => import("../panels/ContactSheets").then(m => m.GroupSheet), { ssr: false });
import { ConfirmChatActionDialog } from "../panels/Dialogs";
const SafetyReportSheet = dynamic(() => import("../panels/SafetyReportSheet").then(m => m.SafetyReportSheet), { ssr: false });
import { SettingsDashboardPreview } from "../panels/SettingsSheet";
const SettingsSheet = dynamic(() => import("../panels/SettingsSheet").then(m => m.SettingsSheet), { ssr: false });
import { LaunchOnboardingSheet } from "../panels/Sheet";
import { parseVoiceNoteBody } from "../VoiceNote";
import { GroupsHome } from "./CommunitiesHome";
import { WhispersFeed, type WhisperThreadMeta } from "./WhispersFeed";
import { NotificationsPanel } from "./NotificationsPanel";
import { ProfilePage } from "./ProfilePage";
import { StatusView, StatusCreateSheet, StatusViewerSheet } from "./StatusView";
import { type NotificationSettings, DEFAULT_NOTIFICATION_SETTINGS, type Panel, type GlobalSearchResult, type PendingChatAction, type ReportTarget, type CommunityRecord, type WhisperEcho, type WhisperReflection, type WhisperNotification, type WhisperProfile, type SafetyReport, COMMUNITIES_SETTING_KEY, WHISPERS_SETTING_KEY, WHISPER_NOTIFICATIONS_SETTING_KEY, REPORTS_SETTING_KEY, ONBOARDING_DISMISSED_SETTING_KEY, NOTIFICATION_SETTINGS_KEY, type NotificationTone, type ChatListModel, CALL_RING_TIMEOUT_MS, PENDING_ENCRYPTED_PAYLOAD, devPlaintextFor, type StatusCommentPayload, type StatusReactionPayload, type StatusDeletePayload, type CommunityDraft, type GroupDeletePayload } from "@/utils/dashboard-types";

export function Dashboard({ identity }: { identity: IdentityRecord }): JSX.Element {
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
    const incomingReactions = useSocketStore((state) => state.incomingReactions);
    const incomingDeletions = useSocketStore((state) => state.incomingDeletions);
    const sendReaction = useSocketStore((state) => state.sendReaction);
    const setSocketGhostMode = useSocketStore((state) => state.setGhostMode);
    const processedReactions = useRef<Set<string>>(new Set());
    const processedDeletions = useRef<Set<string>>(new Set());
    const ghostMode = useDashboardStore((s) => s.ghostMode);
    const setGhostMode = useDashboardStore((s) => s.setGhostMode);
    const mood = useDashboardStore((s) => s.mood);
    const setMood = useDashboardStore((s) => s.setMood);
    const notificationSettings = useDashboardStore((s) => s.notificationSettings);
    const setNotificationSettings = useDashboardStore((s) => s.setNotificationSettings);
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
    const chats = useDashboardStore((s) => s.chats);
    const setChats = useDashboardStore((s) => s.setChats);
    const contacts = useDashboardStore((s) => s.contacts);
    const setContacts = useDashboardStore((s) => s.setContacts);
    const disappearingTimer = useDashboardStore((s) => s.disappearingTimer);
    const setDisappearingTimer = useDashboardStore((s) => s.setDisappearingTimer);
    const displayName = useDashboardStore((s) => s.displayName);
    const setDisplayName = useDashboardStore((s) => s.setDisplayName);
    const editingMessageId = useDashboardStore((s) => s.editingMessageId);
    const setEditingMessageId = useDashboardStore((s) => s.setEditingMessageId);
    const messageSearchQuery = useDashboardStore((s) => s.messageSearchQuery);
    const setMessageSearchQuery = useDashboardStore((s) => s.setMessageSearchQuery);
    const messages = useDashboardStore((s) => s.messages);
    const setMessages = useDashboardStore((s) => s.setMessages);
    const panel = useDashboardStore((s) => s.panel);
    const setPanel = useDashboardStore((s) => s.setPanel);
    const replyToId = useDashboardStore((s) => s.replyToId);
    const setReplyToId = useDashboardStore((s) => s.setReplyToId);
    const searchQuery = useDashboardStore((s) => s.searchQuery);
    const setSearchQuery = useDashboardStore((s) => s.setSearchQuery);
    const globalSearchResults = useDashboardStore((s) => s.globalSearchResults);
    const setGlobalSearchResults = useDashboardStore((s) => s.setGlobalSearchResults);
    const selectedContactHash = useDashboardStore((s) => s.selectedContactHash);
    const setSelectedContactHash = useDashboardStore((s) => s.setSelectedContactHash);
    const selectedGroupId = useDashboardStore((s) => s.selectedGroupId);
    const setSelectedGroupId = useDashboardStore((s) => s.setSelectedGroupId);
    const uploadStatus = useDashboardStore((s) => s.uploadStatus);
    const setUploadStatus = useDashboardStore((s) => s.setUploadStatus);
    const chatPref = useDashboardStore((s) => s.chatPref);
    const setChatPrefState = useDashboardStore((s) => s.setChatPref);
    const [archivedChatIds, setArchivedChatIds] = useState<Set<string>>(
            () => new Set()
          );
    const [mutedChatIds, setMutedChatIds] = useState<Set<string>>(
            () => new Set()
          );
    const showArchivedChats = useDashboardStore((s) => s.showArchivedChats);
    const setShowArchivedChats = useDashboardStore((s) => s.setShowArchivedChats);
    const pendingChatAction = useDashboardStore((s) => s.pendingChatAction);
    const setPendingChatAction = useDashboardStore((s) => s.setPendingChatAction);
    const blurShieldActive = useDashboardStore((s) => s.blurShieldActive);
    const setBlurShieldActive = useDashboardStore((s) => s.setBlurShieldActive);
    const blurShieldRevealed = useDashboardStore((s) => s.blurShieldRevealed);
    const setBlurShieldRevealed = useDashboardStore((s) => s.setBlurShieldRevealed);
    const showGhostModal = useDashboardStore((s) => s.showGhostModal);
    const setShowGhostModal = useDashboardStore((s) => s.setShowGhostModal);
    const showMoodModal = useDashboardStore((s) => s.showMoodModal);
    const setShowMoodModal = useDashboardStore((s) => s.setShowMoodModal);
    const forwardMessageId = useDashboardStore((s) => s.forwardMessageId);
    const setForwardMessageId = useDashboardStore((s) => s.setForwardMessageId);
    const pendingReportTarget = useDashboardStore((s) => s.pendingReportTarget);
    const setPendingReportTarget = useDashboardStore((s) => s.setPendingReportTarget);
    const inAppNotification = useDashboardStore((s) => s.inAppNotification);
    const setInAppNotification = useDashboardStore((s) => s.setInAppNotification);
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
    const allStatuses = useDashboardStore((s) => s.allStatuses);
    const setAllStatuses = useDashboardStore((s) => s.setAllStatuses);
    const communities = useDashboardStore((s) => s.communities);
    const setCommunities = useDashboardStore((s) => s.setCommunities);
    const whispers = useDashboardStore((s) => s.whispers);
    const setWhispers = useDashboardStore((s) => s.setWhispers);
    const whisperNotifications = useDashboardStore((s) => s.whisperNotifications);
    const setWhisperNotifications = useDashboardStore((s) => s.setWhisperNotifications);
    const whisperUnreadCount = useDashboardStore((s) => s.whisperUnreadCount);
    const setWhisperUnreadCount = useDashboardStore((s) => s.setWhisperUnreadCount);
    const focusedEchoId = useDashboardStore((s) => s.focusedEchoId);
    const setFocusedEchoId = useDashboardStore((s) => s.setFocusedEchoId);
    // Per-echo thread paging state (lazy loading + "show older reflections").
    const [whisperThreadMeta, setWhisperThreadMeta] = useState<Record<string, WhisperThreadMeta>>({});
    const [whisperFeedHasMore, setWhisperFeedHasMore] = useState(false);
    const [whisperFeedLoadingMore, setWhisperFeedLoadingMore] = useState(false);
    const [whisperFeedSyncing, setWhisperFeedSyncing] = useState(whispersRelayConfigured());
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    // Ghost profile page target: null = your own profile on the Profile tab.
    const [profileTarget, setProfileTarget] = useState<{ hash: string; name: string } | null>(null);
    const lastWhisperAlertAt = useRef(0);
    const safetyReports = useDashboardStore((s) => s.safetyReports);
    const setSafetyReports = useDashboardStore((s) => s.setSafetyReports);
    const showOnboarding = useDashboardStore((s) => s.showOnboarding);
    const setShowOnboarding = useDashboardStore((s) => s.setShowOnboarding);
    const selectedStatusSenderHash = useDashboardStore((s) => s.selectedStatusSenderHash);
    const setSelectedStatusSenderHash = useDashboardStore((s) => s.setSelectedStatusSenderHash);
    useEffect(() => {
    let active = true;
    void Promise.all([
      getGlobalSetting(COMMUNITIES_SETTING_KEY),
      getGlobalSetting(WHISPERS_SETTING_KEY),
      getGlobalSetting(REPORTS_SETTING_KEY),
      getGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY),
      getGlobalSetting(NOTIFICATION_SETTINGS_KEY),
      getGlobalSetting(WHISPER_NOTIFICATIONS_SETTING_KEY)
    ]).then(([communitiesValue, whispersValue, reportsValue, onboardingDismissed, notificationSettingsValue, whisperNotificationsValue]) => {
      if (active) {
        setCommunities(parseCommunityRecords(communitiesValue));
        // Paint the cached feed instantly. When a relay is configured, the
        // sync effect below replaces this with the authoritative global feed.
        // With no relay, fall back to a local seed so the feed isn't empty.
        const cachedWhispers = parseWhisperEchoes(whispersValue);
        if (cachedWhispers.length > 0) {
          setWhispers(cachedWhispers);
        } else if (!whispersRelayConfigured()) {
          const seeded = seedWhisperEchoes();
          setWhispers(seeded);
          void setGlobalSetting(WHISPERS_SETTING_KEY, JSON.stringify(seeded));
        }
        // Paint the cached notification inbox instantly too; the relay sync
        // replaces it with the authoritative state moments later.
        const cachedNotifications = parseWhisperNotifications(whisperNotificationsValue);
        if (cachedNotifications.length > 0) {
          setWhisperNotifications(cachedNotifications);
          setWhisperUnreadCount(cachedNotifications.filter((n) => !n.read).length);
          lastWhisperAlertAt.current = Math.max(
            0,
            ...cachedNotifications.map((n) => n.createdAt)
          );
        }
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
    // Whispers is a public global feed: pull the authoritative timeline from the
    // relay so any user's Echo (and everyone's reactions/reflections/ripples)
    // shows up on every device. Best-effort — falls back to the local cache.
    // Threads the viewer already opened keep their fully-loaded reflections
    // (the feed response only carries a small preview per Echo).
    const syncWhispersFromRelay = useCallback(async (): Promise<void> => {
            const echoes = await queryWhisperFeed(identity.pubkeyHash, 100);
            if (!echoes) {
              setWhisperFeedSyncing(false);
              return;
            }
            setWhispers((current) => {
              const loadedThreads = new Map(
                current.map((echo) => [echo.id, echo.reflections] as const)
              );
              const merged = echoes.map((echo) => {
                const loaded = loadedThreads.get(echo.id);
                return loaded && loaded.length > echo.reflections.length
                  ? { ...echo, reflections: loaded }
                  : echo;
              });
              // Keep older Echoes the user paged into that fell outside the
              // first page of the fresh sync.
              const fresh = new Set(echoes.map((echo) => echo.id));
              const oldest = echoes.length > 0
                ? Math.min(...echoes.map((echo) => echo.createdAt))
                : 0;
              const retained = current.filter(
                (echo) => !fresh.has(echo.id) && echo.createdAt < oldest
              );
              const next = [...merged, ...retained];
              void setGlobalSetting(WHISPERS_SETTING_KEY, JSON.stringify(next.slice(0, 200)));
              return next;
            });
            setWhisperFeedHasMore(echoes.length >= 100);
            setWhisperFeedSyncing(false);
          }, [identity.pubkeyHash, setWhispers]);
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
    // Notification inbox sync: authoritative read/unread state lives on the
    // relay; new arrivals surface as in-app alerts through the same
    // notification pipeline chats use (tones, preview privacy, vibration).
    const syncWhisperNotifications = useCallback(async (): Promise<void> => {
            setNotificationsLoading(true);
            try {
              const page = await queryWhisperNotifications(identity.pubkeyHash, 100);
              if (!page) return;
              setWhisperNotifications(page.notifications);
              setWhisperUnreadCount(page.unreadCount);
              await setGlobalSetting(
                WHISPER_NOTIFICATIONS_SETTING_KEY,
                JSON.stringify(page.notifications.slice(0, 100))
              );
              const fresh = page.notifications.filter(
                (n) => !n.read && n.createdAt > lastWhisperAlertAt.current
              );
              // lastWhisperAlertAt === 0 means this is the first sync of the
              // session — don't replay the whole backlog as toasts.
              if (fresh.length > 0 && lastWhisperAlertAt.current > 0) {
                const latest = fresh[0]!;
                showNotification(
                  "Whispers",
                  fresh.length === 1
                    ? `${latest.actorName} interacted with your whispers.`
                    : `${fresh.length} new interactions on your whispers.`,
                  "whispers-alerts"
                );
              }
              if (page.notifications.length > 0) {
                lastWhisperAlertAt.current = Math.max(
                  lastWhisperAlertAt.current,
                  ...page.notifications.map((n) => n.createdAt)
                );
              }
            } finally {
              setNotificationsLoading(false);
            }
          }, [identity.pubkeyHash, setWhisperNotifications, setWhisperUnreadCount, showNotification]);
    useEffect(() => {
    if (!whispersRelayConfigured()) {
      setWhisperFeedSyncing(false);
      return;
    }
    const syncAll = () => {
      void syncWhispersFromRelay();
      void syncWhisperNotifications();
    };
    syncAll();
    const intervalId = window.setInterval(syncAll, 20000);
    window.addEventListener("focus", syncAll);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncAll);
    };
    }, [syncWhispersFromRelay, syncWhisperNotifications]);
    const [activeFilter] = useState("all");
    const activeTab = useDashboardStore((s) => s.activeTab);
    const setActiveTab = useDashboardStore((s) => s.setActiveTab);
    const [lastMessages, setLastMessages] = useState<Record<string, { body: string; ts: number }>>({});
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const processedGroupIncoming = useRef<Set<string>>(new Set());
    const processedIncoming = useRef<Set<string>>(new Set());
    const processedCallSignals = useRef<Set<string>>(new Set());
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
    const unreadCount = useMemo(() => 
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
    const timeoutId = setTimeout(() => {
      void nadaDb.messages
        .orderBy("createdAt")
        .reverse()
        .limit(250)
        .toArray()
        .then((recentRecords) => {
          if (!active) return;
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

          // Ghost profiles: any whisper author whose handle matches, one entry
          // per author, listed ahead of individual Echo matches.
          const seenGhosts = new Set<string>();
          for (const echo of whispers) {
            if (
              echo.authorHash &&
              !seenGhosts.has(echo.authorHash) &&
              echo.authorName.toLowerCase().includes(query)
            ) {
              seenGhosts.add(echo.authorHash);
              results.push({
                id: `ghost:${echo.authorHash}`,
                label: echo.authorName,
                meta: "Ghost profile",
                targetId: echo.authorHash,
                targetType: "ghost"
              });
            }
          }

          for (const echo of whispers) {
            const haystack = `${echo.authorName} ${echo.body}`.toLowerCase();
            if (haystack.includes(query)) {
              results.push({
                id: `whisper:${echo.id}`,
                label: echo.authorName,
                meta: echo.body.slice(0, 72) || "Echo",
                targetId: echo.id,
                targetType: "whisper"
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
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
    }, [chats, whispers, contacts, identity.pubkeyHash, searchQuery, visibleStatuses]);
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

            if (result.targetType === "ghost") {
              setProfileTarget({ hash: result.targetId, name: result.label });
              setSelectedContactHash(null);
              setSelectedGroupId(null);
              setActiveTab("profile");
              return;
            }

            if (result.targetType === "whisper") {
              setSelectedContactHash(null);
              setSelectedGroupId(null);
              setActiveTab("whispers");
              setFocusedEchoId(result.targetId);
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
    useEffect(() => {
    if (!selectedChatId) return;
    let active = true;
    void getChatPref(selectedChatId).then((pref) => {
      if (active) setChatPrefState(pref);
    });
    return () => { active = false; };
    }, [selectedChatId]);
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
        // Merge instead of overwrite: an invite-link contact added while this
        // initial read was in flight (first mount right after onboarding)
        // must not be wiped by a stale empty snapshot.
        setContacts((current) => {
          const byHash = new Map(renamed.map((contact) => [contact.pubkeyHash, contact]));
          for (const contact of current) {
            if (!byHash.has(contact.pubkeyHash)) {
              byHash.set(contact.pubkeyHash, contact);
            }
          }
          return [...byHash.values()];
        });
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
    if (!inviteToken) {
      return;
    }

    let active = true;
    const payload = parseInviteToken(inviteToken);
    if (!payload || payload.pubkeyHash === identity.pubkeyHash) {
      return;
    }

    // No processed-token ref guard here: upsertContact is idempotent and a
    // ref guard breaks under StrictMode double-invoke (the first run claims
    // the token, its cleanup cancels the state updates, and the second run
    // bails out early — leaving the UI empty right after onboarding).
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
    if (!groupInviteToken) {
      return;
    }

    const payload = parseGroupInviteToken(groupInviteToken);
    if (!payload) {
      return;
    }

    // Idempotent upsert — see the direct-invite effect above for why there
    // is deliberately no processed-token ref guard.
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
          ...devPlaintextFor(msg.body)
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
          ...devPlaintextFor(msg.body)
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
                ...devPlaintextFor(message.body)
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
                ...devPlaintextFor(message.body)
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
              // ⚠️ MVP_ONLY — replace before production
              const groupEnvelope: GroupMessageEnvelope = { ...baseEnvelope, ...devPlaintextFor(body) };
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
              // ⚠️ MVP_ONLY — replace before production
              const envelope: MessageEnvelope = { ...baseEnvelope, ...devPlaintextFor(body) };
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
              const groupEnvelope: GroupMessageEnvelope = { ...baseEnvelope, ...devPlaintextFor(body) };
              sent = sendGroupEnvelope(groupEnvelope);
            } else if (selectedContact) {
              const baseEnvelope = {
                type: "message" as const, id, recipient: selectedContact.pubkeyHash, sender: identity.pubkeyHash,
                timestamp, ciphertext, messageKind: "poll" as const
              };
              const envelope: MessageEnvelope = { ...baseEnvelope, ...devPlaintextFor(body) };
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
                      ...devPlaintextFor(body),
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
                ...devPlaintextFor(body)
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
                ...devPlaintextFor(body)
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
                ...devPlaintextFor(body)
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
                ...devPlaintextFor(body)
              });
            });
            showToast("Status deleted.");
          };
    // ── Whispers feed actions ──────────────────────────────────────────────
    const whisperAuthorName = (): string =>
            displayName.trim() || generateRandomUsername(identity.pubkeyHash);
    const saveWhispers = useCallback(async (next: WhisperEcho[]) => {
            const sorted = [...next].sort((a, b) => b.createdAt - a.createdAt);
            setWhispers(sorted);
            await setGlobalSetting(WHISPERS_SETTING_KEY, JSON.stringify(sorted));
          }, [setWhispers]);
    const updateWhisper = useCallback((
            echoId: string,
            updater: (echo: WhisperEcho) => WhisperEcho
          ): void => {
            const next = whispers.map((echo) =>
              echo.id === echoId ? updater(echo) : echo
            );
            void saveWhispers(next);
          }, [whispers, saveWhispers]);
    // Every action updates local state optimistically for instant feedback, then
    // (when a relay is configured) writes through to the relay and re-syncs so
    // the change becomes visible to every other NADA user.
    const postEcho = (body: string): void => {
            const text = body.trim();
            if (!text) return;
            const id = crypto.randomUUID();
            const timestamp = Date.now();
            const authorName = whisperAuthorName();
            const record: WhisperEcho = {
              authorHash: identity.pubkeyHash,
              authorName,
              body: text,
              createdAt: timestamp,
              echoCount: 0,
              echoedByMe: false,
              id,
              reflectionCount: 0,
              reflections: [],
              rippleCount: 0,
              rippledByMe: false
            };
            void saveWhispers([record, ...whispers]);
            showToast("Echo whispered to everyone.");
            if (whispersRelayConfigured()) {
              void publishEchoRemote({ author: identity.pubkeyHash, authorName, body: text, id, timestamp })
                .then((ok) => {
                  if (ok) void syncWhispersFromRelay();
                  else showToast("Couldn't reach the feed. Your Echo is saved locally.");
                });
            }
          };
    const toggleEcho = (echoId: string): void => {
            const target = whispers.find((echo) => echo.id === echoId);
            const nextOn = !(target?.echoedByMe ?? false);
            updateWhisper(echoId, (echo) => ({
              ...echo,
              echoCount: Math.max(0, echo.echoCount + (echo.echoedByMe ? -1 : 1)),
              echoedByMe: !echo.echoedByMe
            }));
            if (whispersRelayConfigured()) {
              void reactRemote({ echoId, on: nextOn, reactor: identity.pubkeyHash, reactorName: whisperAuthorName(), timestamp: Date.now() })
                .then((ok) => {
                  if (ok) void syncWhispersFromRelay();
                });
            }
          };
    // Add a Reflection — top-level, or a nested threaded reply when `parent`
    // names the reflection being answered. Optimistic locally, then written
    // through to the relay which fans out notifications to the Echo author
    // and the parent reply's author.
    const addReflection = (
            echoId: string,
            body: string,
            parent?: { parentId: string; replyToName: string }
          ): void => {
            const text = body.trim();
            if (!text) return;
            const id = crypto.randomUUID();
            const timestamp = Date.now();
            const authorName = whisperAuthorName();
            updateWhisper(echoId, (echo) => ({
              ...echo,
              reflectionCount: echo.reflectionCount + 1,
              reflections: [
                ...echo.reflections.map((reflection) =>
                  parent && reflection.id === parent.parentId
                    ? { ...reflection, replyCount: reflection.replyCount + 1 }
                    : reflection
                ),
                {
                  authorHash: identity.pubkeyHash,
                  authorName,
                  body: text,
                  createdAt: timestamp,
                  id,
                  likeCount: 0,
                  likedByMe: false,
                  replyCount: 0,
                  ...(parent
                    ? { parentId: parent.parentId, replyToName: parent.replyToName }
                    : {})
                }
              ].slice(-500)
            }));
            if (whispersRelayConfigured()) {
              void reflectRemote({
                author: identity.pubkeyHash,
                authorName,
                body: text,
                echoId,
                id,
                timestamp,
                ...(parent
                  ? { parentId: parent.parentId, replyToName: parent.replyToName }
                  : {})
              }).then((ok) => {
                if (ok) void syncWhispersFromRelay();
              });
            }
          };
    // Lazily load (and page) one Echo's full reply thread when it's expanded.
    const loadWhisperThread = useCallback((echoId: string, before?: number): void => {
            if (!whispersRelayConfigured()) {
              setWhisperThreadMeta((current) => ({
                ...current,
                [echoId]: { hasMore: false, loaded: true, loading: false }
              }));
              return;
            }
            setWhisperThreadMeta((current) => ({
              ...current,
              [echoId]: {
                hasMore: current[echoId]?.hasMore ?? false,
                loaded: current[echoId]?.loaded ?? false,
                loading: true
              }
            }));
            void queryWhisperReflections(echoId, identity.pubkeyHash, 25, before).then((page) => {
              if (!page) {
                setWhisperThreadMeta((current) => ({
                  ...current,
                  [echoId]: {
                    hasMore: current[echoId]?.hasMore ?? false,
                    loaded: current[echoId]?.loaded ?? false,
                    loading: false
                  }
                }));
                return;
              }
              setWhispers((current) =>
                current.map((echo) => {
                  if (echo.id !== echoId) return echo;
                  // First page replaces the preview; older pages merge in.
                  const merged = before
                    ? [
                        ...echo.reflections.filter(
                          (existing) => !page.reflections.some((r) => r.id === existing.id)
                        ),
                        ...page.reflections
                      ]
                    : page.reflections;
                  return { ...echo, reflectionCount: page.total, reflections: merged };
                })
              );
              setWhisperThreadMeta((current) => ({
                ...current,
                [echoId]: { hasMore: page.hasMore, loaded: true, loading: false }
              }));
            });
          }, [identity.pubkeyHash, setWhispers]);
    // Feed pagination: fetch Echoes older than the oldest one on screen.
    const loadMoreWhisperFeed = useCallback((): void => {
            if (!whispersRelayConfigured() || whispers.length === 0) return;
            const oldest = Math.min(...whispers.map((echo) => echo.createdAt));
            setWhisperFeedLoadingMore(true);
            void queryWhisperFeed(identity.pubkeyHash, 50, { before: oldest }).then((older) => {
              setWhisperFeedLoadingMore(false);
              if (!older) return;
              setWhisperFeedHasMore(older.length >= 50);
              if (older.length === 0) return;
              setWhispers((current) => {
                const known = new Set(current.map((echo) => echo.id));
                return [...current, ...older.filter((echo) => !known.has(echo.id))];
              });
            });
          }, [identity.pubkeyHash, setWhispers, whispers]);
    // Like / unlike a single reflection inside a thread.
    const toggleReflectionLike = (echoId: string, reflection: WhisperReflection): void => {
            const nextOn = !reflection.likedByMe;
            updateWhisper(echoId, (echo) => ({
              ...echo,
              reflections: echo.reflections.map((item) =>
                item.id === reflection.id
                  ? {
                      ...item,
                      likeCount: Math.max(0, item.likeCount + (nextOn ? 1 : -1)),
                      likedByMe: nextOn
                    }
                  : item
              )
            }));
            if (whispersRelayConfigured()) {
              void reactReflectionRemote({
                on: nextOn,
                reactor: identity.pubkeyHash,
                reactorName: whisperAuthorName(),
                reflectionId: reflection.id,
                timestamp: Date.now()
              });
            }
          };
    // Delete your own reflection. Mirrors the relay's cascade rules locally:
    // leaves vanish, parents with replies become tombstones so the thread
    // keeps its shape.
    const deleteReflection = (echoId: string, reflectionId: string): void => {
            updateWhisper(echoId, (echo) => {
              const target = echo.reflections.find((item) => item.id === reflectionId);
              if (!target) return echo;
              const hasChildren = echo.reflections.some(
                (item) => item.parentId === reflectionId
              );
              const reflections = hasChildren
                ? echo.reflections.map((item) =>
                    item.id === reflectionId
                      ? { ...item, body: "", deleted: true, likeCount: 0, likedByMe: false }
                      : item
                  )
                : echo.reflections
                    .filter((item) => item.id !== reflectionId)
                    .map((item) =>
                      item.id === target.parentId
                        ? { ...item, replyCount: Math.max(0, item.replyCount - 1) }
                        : item
                    );
              return {
                ...echo,
                reflectionCount: Math.max(0, echo.reflectionCount - 1),
                reflections
              };
            });
            showToast("Reflection deleted.");
            if (whispersRelayConfigured()) {
              void deleteReflectionRemote({ author: identity.pubkeyHash, id: reflectionId })
                .then((ok) => {
                  if (ok) void syncWhispersFromRelay();
                });
            }
          };
    const rippleEcho = (echoId: string): void => {
            const source = whispers.find((echo) => echo.id === echoId);
            if (!source || source.rippledByMe) return;
            const id = crypto.randomUUID();
            const timestamp = Date.now();
            const authorName = whisperAuthorName();
            const rippleSource = source.rippleOf ?? {
              authorName: source.authorName,
              body: source.body,
              createdAt: source.createdAt,
              id: source.id
            };
            const ripple: WhisperEcho = {
              authorHash: identity.pubkeyHash,
              authorName,
              body: "",
              createdAt: timestamp,
              echoCount: 0,
              echoedByMe: false,
              id,
              reflectionCount: 0,
              reflections: [],
              rippleCount: 0,
              rippledByMe: false,
              rippleOf: rippleSource
            };
            const next = whispers.map((echo) =>
              echo.id === echoId
                ? { ...echo, rippleCount: echo.rippleCount + 1, rippledByMe: true }
                : echo
            );
            void saveWhispers([ripple, ...next]);
            showToast("Rippled to the feed.");
            if (whispersRelayConfigured()) {
              void rippleRemote({ author: identity.pubkeyHash, authorName, echoId, id, rippleOf: rippleSource, timestamp })
                .then((ok) => {
                  if (ok) void syncWhispersFromRelay();
                });
            }
          };
    const deleteEcho = (echoId: string): void => {
            void saveWhispers(whispers.filter((echo) => echo.id !== echoId));
            // Keep everything referencing the Echo consistent: drop stale
            // notifications that would deep-link into it and its thread state.
            setWhisperNotifications((current) => {
              const next = current.filter((n) => n.echoId !== echoId);
              if (next.length !== current.length) {
                setWhisperUnreadCount(next.filter((n) => !n.read).length);
                void setGlobalSetting(
                  WHISPER_NOTIFICATIONS_SETTING_KEY,
                  JSON.stringify(next.slice(0, 100))
                );
              }
              return next;
            });
            setWhisperThreadMeta((current) => {
              if (!(echoId in current)) return current;
              const { [echoId]: _removed, ...rest } = current;
              return rest;
            });
            showToast("Echo deleted.");
            if (whispersRelayConfigured()) {
              void deleteEchoRemote({ author: identity.pubkeyHash, id: echoId })
                .then((ok) => {
                  if (ok) void syncWhispersFromRelay();
                });
            }
          };
    // Route to a ghost's profile page (used from the feed, alerts, search and
    // follow lists — every rendered identity funnels through here).
    const openWhisperProfile = useCallback((hash: string, name: string): void => {
            if (!hash) return;
            setProfileTarget({ hash, name });
            setSelectedContactHash(null);
            setSelectedGroupId(null);
            setActiveTab("profile");
          }, [setActiveTab]);
    // ── Whisper notifications (Alerts tab) ─────────────────────────────────
    const markAllWhisperNotificationsRead = useCallback((): void => {
            setWhisperNotifications((current) => {
              const next = current.map((n) => (n.read ? n : { ...n, read: true }));
              void setGlobalSetting(
                WHISPER_NOTIFICATIONS_SETTING_KEY,
                JSON.stringify(next.slice(0, 100))
              );
              return next;
            });
            setWhisperUnreadCount(0);
            if (whispersRelayConfigured()) {
              void markWhisperNotificationsReadRemote(identity.pubkeyHash);
            }
          }, [identity.pubkeyHash, setWhisperNotifications, setWhisperUnreadCount]);
    // Deep-link a notification to its target: follows open the actor's ghost
    // profile; everything else lands on the Echo with its thread expanded.
    const openWhisperNotification = useCallback((notification: WhisperNotification): void => {
            if (!notification.read) {
              setWhisperNotifications((current) =>
                current.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
              );
              setWhisperUnreadCount((count) => Math.max(0, count - 1));
              if (whispersRelayConfigured()) {
                void markWhisperNotificationsReadRemote(identity.pubkeyHash, [notification.id]);
              }
            }
            if (notification.kind === "follow" || !notification.echoId) {
              openWhisperProfile(notification.actorHash, notification.actorName);
              return;
            }
            const echoId = notification.echoId;
            setActiveTab("whispers");
            setSelectedContactHash(null);
            setSelectedGroupId(null);
            if (whispers.some((echo) => echo.id === echoId)) {
              setFocusedEchoId(echoId);
            } else {
              // The Echo fell outside the loaded window — refresh, then focus.
              void syncWhispersFromRelay().then(() => setFocusedEchoId(echoId));
            }
          }, [identity.pubkeyHash, openWhisperProfile, setActiveTab, setFocusedEchoId, setWhisperNotifications, setWhisperUnreadCount, syncWhispersFromRelay, whispers]);
    // ── Ghost profiles ──────────────────────────────────────────────────────
    // The ProfilePage screen fetches its own data; the Dashboard only routes
    // to it and provides the cross-app actions (message, block, report).
    // Jump from a profile's timeline into the main feed with that Echo focused.
    const openEchoFromProfile = useCallback((echoId: string, echo?: WhisperEcho): void => {
            if (echo) {
              setWhispers((current) =>
                current.some((item) => item.id === echoId) ? current : [...current, echo]
              );
            }
            setActiveTab("whispers");
            setSelectedContactHash(null);
            setSelectedGroupId(null);
            if (echo || whispers.some((item) => item.id === echoId)) {
              setFocusedEchoId(echoId);
            } else {
              void syncWhispersFromRelay().then(() => setFocusedEchoId(echoId));
            }
          }, [setActiveTab, setFocusedEchoId, setWhispers, syncWhispersFromRelay, whispers]);
    // "Message" from a profile: create (or reuse) the contact with their
    // relay-verified pubkey and drop straight into the direct chat. The chat
    // id is deterministic, so an existing conversation is always reused.
    const messageGhost = useCallback(async (profile: WhisperProfile): Promise<void> => {
            if (!profile.pubkey) {
              showToast("This ghost can't be messaged yet.");
              return;
            }
            const existing = await nadaDb.contacts.get(profile.pubkeyHash);
            const contact: ContactRecord = existing ?? {
              id: profile.pubkeyHash,
              pubkeyHash: profile.pubkeyHash,
              publicKey: profile.pubkey,
              localDisplayName:
                profile.displayName || generateRandomUsername(profile.pubkeyHash),
              addedAt: Date.now(),
              trustStatus: "unverified"
            };
            if (!existing) {
              await nadaDb.contacts.put(contact);
              setContacts((current) =>
                current.some((item) => item.pubkeyHash === contact.pubkeyHash)
                  ? current
                  : [contact, ...current]
              );
            }
            setSelectedGroupId(null);
            setSelectedContactHash(contact.pubkeyHash);
            setMessageSearchQuery("");
            setActiveTab("chats");
          }, [setActiveTab, setContacts, showToast]);
    // Block state for the open profile — backed by the direct chat's local
    // preference record, same mechanism the chat screen uses.
    const [profileBlocked, setProfileBlocked] = useState(false);
    useEffect(() => {
    if (!profileTarget || profileTarget.hash === identity.pubkeyHash) {
      setProfileBlocked(false);
      return;
    }
    let active = true;
    void getChatPref(directChatId(identity.pubkeyHash, profileTarget.hash)).then((pref) => {
      if (active) setProfileBlocked(isBlocked(pref, profileTarget.hash));
    });
    return () => {
      active = false;
    };
    }, [profileTarget, identity.pubkeyHash]);
    const toggleBlockGhost = useCallback(async (hash: string, block: boolean): Promise<void> => {
            const chatId = directChatId(identity.pubkeyHash, hash);
            const pref = await getChatPref(chatId);
            const blockedPubkeyHashes = block
              ? Array.from(new Set([...pref.blockedPubkeyHashes, hash]))
              : pref.blockedPubkeyHashes.filter((item) => item !== hash);
            await setChatPref(chatId, { blockedPubkeyHashes });
            setProfileBlocked(block);
            setChatPrefState((current) =>
              current.chatId === chatId ? { ...current, blockedPubkeyHashes } : current
            );
            showToast(block ? "Ghost blocked." : "Ghost unblocked.");
          }, [identity.pubkeyHash, setChatPrefState, showToast]);
    const reportGhost = useCallback((profile: WhisperProfile): void => {
            setPendingReportTarget({
              id: profile.pubkeyHash,
              title: profile.displayName || "Ghost",
              type: "user"
            });
          }, [setPendingReportTarget]);
    // Shared profile links (…/?ghost=<hash>) deep-link straight to the page.
    const ghostParam = searchParams.get("ghost") ?? "";
    useEffect(() => {
    if (!ghostParam) return;
    openWhisperProfile(ghostParam, "Ghost");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ghostParam]);
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
                ...devPlaintextFor(body),
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
                ...devPlaintextFor(body)
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
                ...devPlaintextFor(structuredBody),
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
                ...devPlaintextFor(structuredBody)
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
                ...devPlaintextFor(bodyToForward)
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
                ...devPlaintextFor(bodyToForward)
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
                  ...devPlaintextFor(body)
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
        className="nada-desktop-shell flex h-full w-full max-w-[1920px] bg-nada-surface md:h-[calc(100dvh-1.5rem)] md:overflow-hidden md:rounded-[28px]"
      >
        <DesktopNavRail
          activeTab={activeTab}
          alertCount={whisperUnreadCount}
          onTabChange={(tab) => {
            // The nav's Profile entry is always the hub for YOUR identity.
            if (tab === "profile") setProfileTarget(null);
            setActiveTab(tab);
            setPanel(null);
            setShowGhostModal(false);
            setShowMoodModal(false);
          }}
          unreadCount={unreadCount}
          onNewChat={() => setPanel("contacts")}
        />
        <aside
          className={cn(
            "nada-sidebar relative flex w-full flex-col overflow-hidden bg-nada-surface md:w-[340px] md:min-w-[320px] md:max-w-[370px] lg:w-[360px]",
            selectedContact || selectedGroup ? "!hidden md:!flex" : "flex"
          )}
        >
        <MobileChatsHome
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          unreadTotal={unreadCount}
          alertCount={whisperUnreadCount}
          onComposeClick={() => setPanel("contacts")}
          selfSeed={identity.pubkeyHash}
          ghost={ghostMode}
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab === "profile") setProfileTarget(null);
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
          ) : activeTab === "whispers" ? (
            <WhispersFeed
              displayName={displayName}
              echoes={whispers}
              feedHasMore={whisperFeedHasMore}
              feedLoadingMore={whisperFeedLoadingMore}
              feedSyncing={whisperFeedSyncing}
              focusedEchoId={focusedEchoId}
              identity={identity}
              onAddReflection={addReflection}
              onClearFocusedEcho={() => setFocusedEchoId(null)}
              onDeleteEcho={deleteEcho}
              onDeleteReflection={deleteReflection}
              onLoadMoreFeed={loadMoreWhisperFeed}
              onLoadThread={loadWhisperThread}
              onOpenProfile={openWhisperProfile}
              onPostEcho={postEcho}
              onReportEcho={(echo) => {
                setPendingReportTarget({
                  id: echo.id,
                  title: `Echo by ${echo.authorName}`,
                  type: "whisper"
                });
              }}
              onRipple={rippleEcho}
              onToggleEcho={toggleEcho}
              onToggleReflectionLike={toggleReflectionLike}
              threadMeta={whisperThreadMeta}
            />
          ) : activeTab === "alerts" ? (
            <NotificationsPanel
              loading={notificationsLoading}
              notifications={whisperNotifications}
              onMarkAllRead={markAllWhisperNotificationsRead}
              onOpenNotification={openWhisperNotification}
              onOpenProfile={openWhisperProfile}
              relayConfigured={whispersRelayConfigured()}
              unreadCount={whisperUnreadCount}
            />
          ) : activeTab === "profile" ? (
            <ProfilePage
              identity={identity}
              isBlocked={profileBlocked}
              key={(profileTarget ?? { hash: identity.pubkeyHash }).hash}
              localEchoes={whispers}
              onBack={
                profileTarget && profileTarget.hash !== identity.pubkeyHash
                  ? () => {
                      setProfileTarget(null);
                      setActiveTab("whispers");
                    }
                  : undefined
              }
              onMessage={(profile) => void messageGhost(profile)}
              onOpenEcho={openEchoFromProfile}
              onOpenProfile={openWhisperProfile}
              onReport={reportGhost}
              onToast={showToast}
              onToggleBlock={(hash, block) => void toggleBlockGhost(hash, block)}
              target={profileTarget ?? { hash: identity.pubkeyHash, name: whisperAuthorName() }}
              viewerName={whisperAuthorName()}
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
                    if (activeTab === "whispers" && !item.isGroup) return false;
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
        onOpenGhostProfile={
          selectedContact
            ? () =>
                openWhisperProfile(
                  selectedContact.pubkeyHash,
                  selectedContact.localDisplayName
                )
            : undefined
        }
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
              setContacts((current) => [
                contact,
                ...current.filter((entry) => entry.pubkeyHash !== contact.pubkeyHash)
              ]);
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
            onAddContact={() => {
              setShowOnboarding(false);
              void setGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY, "true");
              setPanel("contacts");
            }}
            onClose={() => {
              setShowOnboarding(false);
              void setGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY, "true");
            }}
            onCreateGroup={() => {
              setShowOnboarding(false);
              void setGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY, "true");
              setPanel("group");
            }}
            onEnableNotifications={() => {
              void registerPushNotifications();
            }}
            onOpenCommunity={() => {
              setShowOnboarding(false);
              void setGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY, "true");
              setActiveTab("whispers");
            }}
            onPostStatus={() => {
              setShowOnboarding(false);
              void setGlobalSetting(ONBOARDING_DISMISSED_SETTING_KEY, "true");
              setPanel("status_create");
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
                     <IdentityOrb seed={chat.title} size="md" label={chat.title} />
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
