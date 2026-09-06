import { MessageCircle, Settings, Trophy, Waves, type LucideIcon } from "lucide-react";

/**
 * The one place NADA's navigation is defined.
 *
 * Both navigators — the desktop rail and the mobile orb — render from these
 * lists, and every active-state decision goes through `primaryTabFor`. Before
 * this module the rail and the orb shared a flat list of eight destinations
 * (chats, status, groups, whispers, contest, alerts, profile, settings), which
 * put a communication app's core next to a notification inbox and an account
 * page as if they were peers.
 *
 * NADA is a communication platform: talking to people (Chats), its anonymous
 * feed (Whispers), and Contest. Everything else is either a view inside one of
 * those or a global utility, and says so here rather than in each navigator.
 */

export type PrimaryTabId = "chats" | "whispers" | "contest" | "settings";

/**
 * Every destination `activeTab` can hold. The secondary ones are still real
 * screens with real state — they are reached from inside a primary section or
 * from the header, not from the navigators.
 */
export type TabId = PrimaryTabId | "status" | "alerts" | "profile";

export interface NavItem {
  readonly id: PrimaryTabId;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Used as the rail tooltip and the orb's accessible description. */
  readonly hint: string;
}

/** The three destinations that describe what NADA is. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { id: "chats", label: "Chats", icon: MessageCircle, hint: "Direct messages and groups" },
  { id: "whispers", label: "Whispers", icon: Waves, hint: "Anonymous echoes" },
  { id: "contest", label: "Contest", icon: Trophy, hint: "Leaderboard and prizes" }
] as const;

/** Account management. Rendered apart from the three above, never among them. */
export const SETTINGS_NAV: NavItem = {
  id: "settings",
  label: "Settings",
  icon: Settings,
  hint: "Account, privacy, notifications"
} as const;

/** Every navigable destination, in render order, for navigators that need one list. */
export const ALL_NAV: readonly NavItem[] = [...PRIMARY_NAV, SETTINGS_NAV] as const;

/**
 * Which primary section a secondary screen belongs to, for active state.
 *
 * `alerts` is deliberately absent: notifications are a global utility reached
 * from the header bell, so no primary destination lights up for them.
 */
const SECONDARY_PARENT: Readonly<Record<string, PrimaryTabId>> = {
  status: "chats"
};

/** Secondary screens that are opened from within the app rather than the navigators. */
export function isSecondaryTab(tab: string): boolean {
  return tab === "status" || tab === "alerts" || tab === "profile";
}

/**
 * The primary nav entry that should read as active for a given screen, or null
 * when none should (notifications).
 *
 * Profile is the one screen whose parent depends on whose profile it is: your
 * own is the account area under Settings, while another ghost's is reached from
 * the Whispers feed and belongs there.
 */
export function primaryTabFor(
  tab: string,
  context?: { readonly ownProfile?: boolean }
): PrimaryTabId | null {
  if (tab === "profile") {
    return context?.ownProfile ? "settings" : "whispers";
  }
  if (tab === "alerts") {
    return null;
  }
  return SECONDARY_PARENT[tab] ?? (tab as PrimaryTabId);
}

/** Header titles. Chats shows the brand; every other screen names itself. */
const TAB_TITLES: Readonly<Record<string, string>> = {
  alerts: "Alerts",
  chats: "NADA",
  contest: "Contest",
  profile: "Profile",
  settings: "Settings",
  status: "Status",
  whispers: "Whispers"
};

export function tabTitle(tab: string): string {
  return TAB_TITLES[tab] ?? "NADA";
}

/**
 * Chats carries the unread-message count. Alert counts live on the header bell
 * now, so no other destination has a badge.
 */
export function tabBadge(tabId: string, unreadCount: number): number {
  return tabId === "chats" ? unreadCount : 0;
}

/** Secondary filters inside Chats. Groups are a kind of conversation, not a section. */
export type ChatFilterId = "all" | "direct" | "groups" | "unread";

export interface ChatFilter {
  readonly id: ChatFilterId;
  readonly label: string;
}

export const CHAT_FILTERS: readonly ChatFilter[] = [
  { id: "all", label: "All" },
  { id: "direct", label: "Direct" },
  { id: "groups", label: "Groups" },
  { id: "unread", label: "Unread" }
] as const;
