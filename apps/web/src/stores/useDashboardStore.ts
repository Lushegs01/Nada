import { create } from 'zustand';
type Updater<T> = T | ((prev: T) => T);
import type { ChatRecord, ContactRecord, MessageRecord } from "@nada/db";
import type { CommunityRecord, WhisperEcho, WhisperNotification, SafetyReport, NotificationSettings, GlobalSearchResult, ReportTarget, PendingChatAction } from "@/utils/dashboard-types";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/utils/dashboard-types";

type Panel = "settings" | "contacts" | "billing" | "share" | "migration" | "group" | "safetyReport" | "community_create" | "status_create" | "blocked" | null;

interface DashboardState {
  chatPref: import("@/lib/db").ChatPrefRecord;
  setChatPref: (p: Updater<import("@/lib/db").ChatPrefRecord>) => void;
  // App State
  ghostMode: boolean;
  setGhostMode: (val: Updater<boolean>) => void;
  mood: string;
  setMood: (val: Updater<string>) => void;
  notificationSettings: NotificationSettings;
  setNotificationSettings: (val: Updater<NotificationSettings>) => void;
  showOnboarding: boolean;
  setShowOnboarding: (val: Updater<boolean>) => void;

  // Data Collections
  chats: ChatRecord[];
  setChats: (chats: Updater<ChatRecord[]>) => void;
  contacts: ContactRecord[];
  setContacts: (contacts: Updater<ContactRecord[]>) => void;
  messages: MessageRecord[];
  setMessages: (messages: Updater<MessageRecord[]>) => void;
  allStatuses: MessageRecord[];
  setAllStatuses: (statuses: Updater<MessageRecord[]>) => void;
  communities: CommunityRecord[];
  setCommunities: (communities: Updater<CommunityRecord[]>) => void;
  whispers: WhisperEcho[];
  setWhispers: (whispers: Updater<WhisperEcho[]>) => void;
  whisperNotifications: WhisperNotification[];
  setWhisperNotifications: (notifications: Updater<WhisperNotification[]>) => void;
  whisperUnreadCount: number;
  setWhisperUnreadCount: (count: Updater<number>) => void;
  focusedEchoId: string | null;
  setFocusedEchoId: (id: Updater<string | null>) => void;
  safetyReports: SafetyReport[];
  setSafetyReports: (reports: Updater<SafetyReport[]>) => void;

  // Active Selections
  selectedContactHash: string | null;
  setSelectedContactHash: (hash: Updater<string | null>) => void;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: Updater<string | null>) => void;
  selectedStatusSenderHash: string | null;
  setSelectedStatusSenderHash: (hash: Updater<string | null>) => void;
  
  // Chat specific state
  disappearingTimer: number;
  setDisappearingTimer: (val: Updater<number>) => void;
  displayName: string;
  setDisplayName: (val: Updater<string>) => void;
  editingMessageId: string | null;
  setEditingMessageId: (id: Updater<string | null>) => void;
  replyToId: string | null;
  setReplyToId: (id: Updater<string | null>) => void;
  forwardMessageId: string | null;
  setForwardMessageId: (id: Updater<string | null>) => void;
  
  // UI State
  panel: Panel;
  setPanel: (panel: Updater<Panel>) => void;
  activeTab: string;
  setActiveTab: (tab: Updater<string>) => void;
  activeFilter: string;
  setActiveFilter: (filter: Updater<string>) => void;
  searchQuery: string;
  setSearchQuery: (query: Updater<string>) => void;
  messageSearchQuery: string;
  setMessageSearchQuery: (query: Updater<string>) => void;
  globalSearchResults: GlobalSearchResult[];
  setGlobalSearchResults: (results: Updater<GlobalSearchResult[]>) => void;
  uploadStatus: string | null;
  setUploadStatus: (status: Updater<string | null>) => void;
  
  // Modals & Overlays
  blurShieldActive: boolean;
  setBlurShieldActive: (val: Updater<boolean>) => void;
  blurShieldRevealed: boolean;
  setBlurShieldRevealed: (val: Updater<boolean>) => void;
  showGhostModal: boolean;
  setShowGhostModal: (val: Updater<boolean>) => void;
  showMoodModal: boolean;
  setShowMoodModal: (val: Updater<boolean>) => void;
  showArchivedChats: boolean;
  setShowArchivedChats: (val: Updater<boolean>) => void;
  
  // Action state
  pendingChatAction: PendingChatAction | null;
  setPendingChatAction: (action: Updater<PendingChatAction | null>) => void;
  pendingReportTarget: ReportTarget | null;
  setPendingReportTarget: (target: Updater<ReportTarget | null>) => void;
  inAppNotification: { id: string; title: string; body: string; chatId: string } | null;
  setInAppNotification: (notif: Updater<{ id: string; title: string; body: string; chatId: string } | null>) => void;
  
  // Chat Prefs
  archivedChatIds: Set<string>;
  setArchivedChatIds: (ids: Updater<Set<string>>) => void;
  mutedChatIds: Set<string>;
  setMutedChatIds: (ids: Updater<Set<string>>) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  ghostMode: false,
  setGhostMode: (ghostMode) => set((state) => ({ ghostMode: typeof ghostMode === 'function' ? ghostMode(state.ghostMode) : ghostMode })),
  mood: "Available",
  setMood: (mood) => set((state) => ({ mood: typeof mood === 'function' ? mood(state.mood) : mood })),
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
  setNotificationSettings: (notificationSettings) => set((state) => ({ notificationSettings: typeof notificationSettings === 'function' ? notificationSettings(state.notificationSettings) : notificationSettings })),
  showOnboarding: false,
  setShowOnboarding: (showOnboarding) => set((state) => ({ showOnboarding: typeof showOnboarding === 'function' ? showOnboarding(state.showOnboarding) : showOnboarding })),

  chats: [],
  setChats: (chats) => set((state) => ({ chats: typeof chats === 'function' ? chats(state.chats) : chats })),
  contacts: [],
  setContacts: (contacts) => set((state) => ({ contacts: typeof contacts === 'function' ? contacts(state.contacts) : contacts })),
  messages: [],
  setMessages: (messages) => set((state) => ({ messages: typeof messages === 'function' ? messages(state.messages) : messages })),
  allStatuses: [],
  setAllStatuses: (allStatuses) => set((state) => ({ allStatuses: typeof allStatuses === 'function' ? allStatuses(state.allStatuses) : allStatuses })),
  communities: [],
  setCommunities: (communities) => set((state) => ({ communities: typeof communities === 'function' ? communities(state.communities) : communities })),
  whispers: [],
  setWhispers: (whispers) => set((state) => ({ whispers: typeof whispers === 'function' ? whispers(state.whispers) : whispers })),
  whisperNotifications: [],
  setWhisperNotifications: (whisperNotifications) => set((state) => ({ whisperNotifications: typeof whisperNotifications === 'function' ? whisperNotifications(state.whisperNotifications) : whisperNotifications })),
  whisperUnreadCount: 0,
  setWhisperUnreadCount: (whisperUnreadCount) => set((state) => ({ whisperUnreadCount: typeof whisperUnreadCount === 'function' ? whisperUnreadCount(state.whisperUnreadCount) : whisperUnreadCount })),
  focusedEchoId: null,
  setFocusedEchoId: (focusedEchoId) => set((state) => ({ focusedEchoId: typeof focusedEchoId === 'function' ? focusedEchoId(state.focusedEchoId) : focusedEchoId })),
  safetyReports: [],
  setSafetyReports: (safetyReports) => set((state) => ({ safetyReports: typeof safetyReports === 'function' ? safetyReports(state.safetyReports) : safetyReports })),

  selectedContactHash: null,
  setSelectedContactHash: (selectedContactHash) => set((state) => ({ selectedContactHash: typeof selectedContactHash === 'function' ? selectedContactHash(state.selectedContactHash) : selectedContactHash })),
  selectedGroupId: null,
  setSelectedGroupId: (selectedGroupId) => set((state) => ({ selectedGroupId: typeof selectedGroupId === 'function' ? selectedGroupId(state.selectedGroupId) : selectedGroupId })),
  selectedStatusSenderHash: null,
  setSelectedStatusSenderHash: (selectedStatusSenderHash) => set((state) => ({ selectedStatusSenderHash: typeof selectedStatusSenderHash === 'function' ? selectedStatusSenderHash(state.selectedStatusSenderHash) : selectedStatusSenderHash })),

  disappearingTimer: 0,
  setDisappearingTimer: (disappearingTimer) => set((state) => ({ disappearingTimer: typeof disappearingTimer === 'function' ? disappearingTimer(state.disappearingTimer) : disappearingTimer })),
  displayName: "NADA",
  setDisplayName: (displayName) => set((state) => ({ displayName: typeof displayName === 'function' ? displayName(state.displayName) : displayName })),
  editingMessageId: null,
  setEditingMessageId: (editingMessageId) => set((state) => ({ editingMessageId: typeof editingMessageId === 'function' ? editingMessageId(state.editingMessageId) : editingMessageId })),
  replyToId: null,
  setReplyToId: (replyToId) => set((state) => ({ replyToId: typeof replyToId === 'function' ? replyToId(state.replyToId) : replyToId })),
  forwardMessageId: null,
  setForwardMessageId: (forwardMessageId) => set((state) => ({ forwardMessageId: typeof forwardMessageId === 'function' ? forwardMessageId(state.forwardMessageId) : forwardMessageId })),

  panel: null,
  setPanel: (panel) => set((state) => ({ panel: typeof panel === 'function' ? panel(state.panel) : panel })),
  activeTab: "chats",
  setActiveTab: (activeTab) => set((state) => ({ activeTab: typeof activeTab === 'function' ? activeTab(state.activeTab) : activeTab })),
  activeFilter: "all",
  setActiveFilter: (activeFilter) => set((state) => ({ activeFilter: typeof activeFilter === 'function' ? activeFilter(state.activeFilter) : activeFilter })),
  searchQuery: "",
  setSearchQuery: (searchQuery) => set((state) => ({ searchQuery: typeof searchQuery === 'function' ? searchQuery(state.searchQuery) : searchQuery })),
  messageSearchQuery: "",
  setMessageSearchQuery: (messageSearchQuery) => set((state) => ({ messageSearchQuery: typeof messageSearchQuery === 'function' ? messageSearchQuery(state.messageSearchQuery) : messageSearchQuery })),
  globalSearchResults: [],
  setGlobalSearchResults: (globalSearchResults) => set((state) => ({ globalSearchResults: typeof globalSearchResults === 'function' ? globalSearchResults(state.globalSearchResults) : globalSearchResults })),
  uploadStatus: null,
  setUploadStatus: (uploadStatus) => set((state) => ({ uploadStatus: typeof uploadStatus === 'function' ? uploadStatus(state.uploadStatus) : uploadStatus })),

  blurShieldActive: false,
  setBlurShieldActive: (blurShieldActive) => set((state) => ({ blurShieldActive: typeof blurShieldActive === 'function' ? blurShieldActive(state.blurShieldActive) : blurShieldActive })),
  blurShieldRevealed: false,
  setBlurShieldRevealed: (blurShieldRevealed) => set((state) => ({ blurShieldRevealed: typeof blurShieldRevealed === 'function' ? blurShieldRevealed(state.blurShieldRevealed) : blurShieldRevealed })),
  showGhostModal: false,
  setShowGhostModal: (showGhostModal) => set((state) => ({ showGhostModal: typeof showGhostModal === 'function' ? showGhostModal(state.showGhostModal) : showGhostModal })),
  showMoodModal: false,
  setShowMoodModal: (showMoodModal) => set((state) => ({ showMoodModal: typeof showMoodModal === 'function' ? showMoodModal(state.showMoodModal) : showMoodModal })),
  showArchivedChats: false,
  setShowArchivedChats: (showArchivedChats) => set((state) => ({ showArchivedChats: typeof showArchivedChats === 'function' ? showArchivedChats(state.showArchivedChats) : showArchivedChats })),

  pendingChatAction: null,
  setPendingChatAction: (pendingChatAction) => set((state) => ({ pendingChatAction: typeof pendingChatAction === 'function' ? pendingChatAction(state.pendingChatAction) : pendingChatAction })),
  pendingReportTarget: null,
  setPendingReportTarget: (pendingReportTarget) => set((state) => ({ pendingReportTarget: typeof pendingReportTarget === 'function' ? pendingReportTarget(state.pendingReportTarget) : pendingReportTarget })),
  inAppNotification: null,
  setInAppNotification: (inAppNotification) => set((state) => ({ inAppNotification: typeof inAppNotification === 'function' ? inAppNotification(state.inAppNotification) : inAppNotification })),

  chatPref: { chatId: "", mutedUntil: 0, clearedAt: 0, blockedPubkeyHashes: [], pinnedMessageId: null, pinnedMessageBody: null, archivedAt: 0, updatedAt: 0 },
  setChatPref: (chatPref) => set((state) => ({ chatPref: typeof chatPref === 'function' ? chatPref(state.chatPref) : chatPref })),

  archivedChatIds: new Set(),
  setArchivedChatIds: (archivedChatIds) => set((state) => ({ archivedChatIds: typeof archivedChatIds === 'function' ? archivedChatIds(state.archivedChatIds) : archivedChatIds })),
  mutedChatIds: new Set(),
  setMutedChatIds: (mutedChatIds) => set((state) => ({ mutedChatIds: typeof mutedChatIds === 'function' ? mutedChatIds(state.mutedChatIds) : mutedChatIds })),
}));


/**
 * Stable, module-scope handles for every store action.
 *
 * Reading a setter through `useDashboardStore((s) => s.setX)` subscribes the
 * component to the store once per setter — forty subscriptions on the
 * dashboard alone — and hands React a value it must treat as a fresh
 * dependency, which is why `react-hooks/exhaustive-deps` had to be disabled
 * across the largest component in the app. Zustand's actions never change
 * identity, so binding them once here removes the subscriptions and lets the
 * dependency rule run for real, where it can catch actual stale closures.
 */
export const dashboardActions = {
  setActiveFilter: ((value: Parameters<DashboardState["setActiveFilter"]>[0]) =>
    useDashboardStore.getState().setActiveFilter(value)) as DashboardState["setActiveFilter"],
  setActiveTab: ((value: Parameters<DashboardState["setActiveTab"]>[0]) =>
    useDashboardStore.getState().setActiveTab(value)) as DashboardState["setActiveTab"],
  setAllStatuses: ((value: Parameters<DashboardState["setAllStatuses"]>[0]) =>
    useDashboardStore.getState().setAllStatuses(value)) as DashboardState["setAllStatuses"],
  setArchivedChatIds: ((value: Parameters<DashboardState["setArchivedChatIds"]>[0]) =>
    useDashboardStore.getState().setArchivedChatIds(value)) as DashboardState["setArchivedChatIds"],
  setBlurShieldActive: ((value: Parameters<DashboardState["setBlurShieldActive"]>[0]) =>
    useDashboardStore.getState().setBlurShieldActive(value)) as DashboardState["setBlurShieldActive"],
  setBlurShieldRevealed: ((value: Parameters<DashboardState["setBlurShieldRevealed"]>[0]) =>
    useDashboardStore.getState().setBlurShieldRevealed(value)) as DashboardState["setBlurShieldRevealed"],
  setChatPref: ((value: Parameters<DashboardState["setChatPref"]>[0]) =>
    useDashboardStore.getState().setChatPref(value)) as DashboardState["setChatPref"],
  setChats: ((value: Parameters<DashboardState["setChats"]>[0]) =>
    useDashboardStore.getState().setChats(value)) as DashboardState["setChats"],
  setCommunities: ((value: Parameters<DashboardState["setCommunities"]>[0]) =>
    useDashboardStore.getState().setCommunities(value)) as DashboardState["setCommunities"],
  setContacts: ((value: Parameters<DashboardState["setContacts"]>[0]) =>
    useDashboardStore.getState().setContacts(value)) as DashboardState["setContacts"],
  setDisappearingTimer: ((value: Parameters<DashboardState["setDisappearingTimer"]>[0]) =>
    useDashboardStore.getState().setDisappearingTimer(value)) as DashboardState["setDisappearingTimer"],
  setDisplayName: ((value: Parameters<DashboardState["setDisplayName"]>[0]) =>
    useDashboardStore.getState().setDisplayName(value)) as DashboardState["setDisplayName"],
  setEditingMessageId: ((value: Parameters<DashboardState["setEditingMessageId"]>[0]) =>
    useDashboardStore.getState().setEditingMessageId(value)) as DashboardState["setEditingMessageId"],
  setFocusedEchoId: ((value: Parameters<DashboardState["setFocusedEchoId"]>[0]) =>
    useDashboardStore.getState().setFocusedEchoId(value)) as DashboardState["setFocusedEchoId"],
  setForwardMessageId: ((value: Parameters<DashboardState["setForwardMessageId"]>[0]) =>
    useDashboardStore.getState().setForwardMessageId(value)) as DashboardState["setForwardMessageId"],
  setGhostMode: ((value: Parameters<DashboardState["setGhostMode"]>[0]) =>
    useDashboardStore.getState().setGhostMode(value)) as DashboardState["setGhostMode"],
  setGlobalSearchResults: ((value: Parameters<DashboardState["setGlobalSearchResults"]>[0]) =>
    useDashboardStore.getState().setGlobalSearchResults(value)) as DashboardState["setGlobalSearchResults"],
  setInAppNotification: ((value: Parameters<DashboardState["setInAppNotification"]>[0]) =>
    useDashboardStore.getState().setInAppNotification(value)) as DashboardState["setInAppNotification"],
  setMessageSearchQuery: ((value: Parameters<DashboardState["setMessageSearchQuery"]>[0]) =>
    useDashboardStore.getState().setMessageSearchQuery(value)) as DashboardState["setMessageSearchQuery"],
  setMessages: ((value: Parameters<DashboardState["setMessages"]>[0]) =>
    useDashboardStore.getState().setMessages(value)) as DashboardState["setMessages"],
  setMood: ((value: Parameters<DashboardState["setMood"]>[0]) =>
    useDashboardStore.getState().setMood(value)) as DashboardState["setMood"],
  setMutedChatIds: ((value: Parameters<DashboardState["setMutedChatIds"]>[0]) =>
    useDashboardStore.getState().setMutedChatIds(value)) as DashboardState["setMutedChatIds"],
  setNotificationSettings: ((value: Parameters<DashboardState["setNotificationSettings"]>[0]) =>
    useDashboardStore.getState().setNotificationSettings(value)) as DashboardState["setNotificationSettings"],
  setPanel: ((value: Parameters<DashboardState["setPanel"]>[0]) =>
    useDashboardStore.getState().setPanel(value)) as DashboardState["setPanel"],
  setPendingChatAction: ((value: Parameters<DashboardState["setPendingChatAction"]>[0]) =>
    useDashboardStore.getState().setPendingChatAction(value)) as DashboardState["setPendingChatAction"],
  setPendingReportTarget: ((value: Parameters<DashboardState["setPendingReportTarget"]>[0]) =>
    useDashboardStore.getState().setPendingReportTarget(value)) as DashboardState["setPendingReportTarget"],
  setReplyToId: ((value: Parameters<DashboardState["setReplyToId"]>[0]) =>
    useDashboardStore.getState().setReplyToId(value)) as DashboardState["setReplyToId"],
  setSafetyReports: ((value: Parameters<DashboardState["setSafetyReports"]>[0]) =>
    useDashboardStore.getState().setSafetyReports(value)) as DashboardState["setSafetyReports"],
  setSearchQuery: ((value: Parameters<DashboardState["setSearchQuery"]>[0]) =>
    useDashboardStore.getState().setSearchQuery(value)) as DashboardState["setSearchQuery"],
  setSelectedContactHash: ((value: Parameters<DashboardState["setSelectedContactHash"]>[0]) =>
    useDashboardStore.getState().setSelectedContactHash(value)) as DashboardState["setSelectedContactHash"],
  setSelectedGroupId: ((value: Parameters<DashboardState["setSelectedGroupId"]>[0]) =>
    useDashboardStore.getState().setSelectedGroupId(value)) as DashboardState["setSelectedGroupId"],
  setSelectedStatusSenderHash: ((value: Parameters<DashboardState["setSelectedStatusSenderHash"]>[0]) =>
    useDashboardStore.getState().setSelectedStatusSenderHash(value)) as DashboardState["setSelectedStatusSenderHash"],
  setShowArchivedChats: ((value: Parameters<DashboardState["setShowArchivedChats"]>[0]) =>
    useDashboardStore.getState().setShowArchivedChats(value)) as DashboardState["setShowArchivedChats"],
  setShowGhostModal: ((value: Parameters<DashboardState["setShowGhostModal"]>[0]) =>
    useDashboardStore.getState().setShowGhostModal(value)) as DashboardState["setShowGhostModal"],
  setShowMoodModal: ((value: Parameters<DashboardState["setShowMoodModal"]>[0]) =>
    useDashboardStore.getState().setShowMoodModal(value)) as DashboardState["setShowMoodModal"],
  setShowOnboarding: ((value: Parameters<DashboardState["setShowOnboarding"]>[0]) =>
    useDashboardStore.getState().setShowOnboarding(value)) as DashboardState["setShowOnboarding"],
  setUploadStatus: ((value: Parameters<DashboardState["setUploadStatus"]>[0]) =>
    useDashboardStore.getState().setUploadStatus(value)) as DashboardState["setUploadStatus"],
  setWhisperNotifications: ((value: Parameters<DashboardState["setWhisperNotifications"]>[0]) =>
    useDashboardStore.getState().setWhisperNotifications(value)) as DashboardState["setWhisperNotifications"],
  setWhisperUnreadCount: ((value: Parameters<DashboardState["setWhisperUnreadCount"]>[0]) =>
    useDashboardStore.getState().setWhisperUnreadCount(value)) as DashboardState["setWhisperUnreadCount"],
  setWhispers: ((value: Parameters<DashboardState["setWhispers"]>[0]) =>
    useDashboardStore.getState().setWhispers(value)) as DashboardState["setWhispers"],
} as const;
