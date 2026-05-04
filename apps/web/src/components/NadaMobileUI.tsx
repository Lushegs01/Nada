"use client";

import React from "react";
import {
  Search,
  MessageCircle,
  Users,
  Settings,
  Plus,
  Check,
  CheckCheck,
  Archive,
  VolumeX,
  Pin,
  ChevronRight,
  CircleDashed
} from "lucide-react";
import { cn } from "@nada/ui";
import { motion } from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   SearchBar
   ───────────────────────────────────────────────────────────── */
export const SearchBar = ({
  value,
  onChange,
  placeholder = "Search"
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) => (
  <div className="px-5 pb-3 pt-1">
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-4 h-[15px] w-[15px] text-nada-secondary/[.40]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-nada-border/10 bg-nada-surface-elevated pl-11 pr-4 text-sm text-nada-primary outline-none placeholder:text-nada-secondary/[.40] focus:border-nada-accent/20 focus:ring-0 transition-colors"
        style={{ background: "rgb(var(--nada-surface-elevated))" }}
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Archived Row
   ───────────────────────────────────────────────────────────── */
export const ArchivedRow = ({ count = 0 }: { count?: number }) => (
  <button className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-nada-surface-elevated/50 transition-colors border-b border-nada-border/[.05]">
    <div className="flex items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-nada-surface-elevated border border-nada-border/[.08]">
        <Archive className="h-5 w-5 text-nada-secondary/[.60]" />
      </div>
      <span className="text-[15px] font-semibold text-nada-primary">Archived</span>
    </div>
    <div className="flex items-center gap-2">
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-nada-accent px-1.5 text-[10px] font-black text-black">
          {count}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-nada-secondary/[.30]" />
    </div>
  </button>
);

/* ─────────────────────────────────────────────────────────────
   ChatListItem — Premium VANTA style
   ───────────────────────────────────────────────────────────── */
export const ChatListItem = ({
  name,
  preview,
  timestamp,
  unreadCount,
  avatar,
  initials,
  isPinned,
  isMuted,
  isOnline,
  status,
  isSelected,
  onClick
}: {
  name: string;
  preview: string;
  timestamp: string;
  unreadCount: number;
  avatar?: string;
  initials?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  isOnline?: boolean;
  status?: "sent" | "delivered" | "read";
  isSelected?: boolean;
  onClick: () => void;
}) => (
  <motion.button
    onClick={onClick}
    whileTap={{ scale: 0.99 }}
    className={cn(
      "flex w-full items-center gap-4 border-b border-nada-border/[.05] px-5 py-3.5 text-left transition-all",
      isSelected
        ? "bg-nada-accent/5"
        : "hover:bg-nada-surface-elevated/40 active:bg-nada-surface-elevated/60"
    )}
  >
    {/* Avatar */}
    <div className="relative shrink-0">
      <div className={cn(
        "flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-2xl",
        unreadCount > 0
          ? "ring-1 ring-nada-accent/30"
          : "ring-1 ring-nada-border/8"
      )} style={{ background: "rgb(var(--nada-surface-3))" }}>
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-base font-bold text-nada-secondary/[.50]">
            {initials}
          </span>
        )}
      </div>
      {isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 bg-nada-success"
          style={{ borderColor: "rgb(var(--nada-bg))" }} />
      )}
    </div>

    {/* Content */}
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className={cn(
          "truncate text-[15px] font-semibold",
          unreadCount > 0 ? "text-nada-primary" : "text-nada-primary/[.90]"
        )}>
          {name}
        </h3>
        <span className={cn(
          "shrink-0 text-[11px] tabular-nums",
          unreadCount > 0 ? "text-nada-accent font-semibold" : "text-nada-secondary/[.50]"
        )}>
          {timestamp}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {status && (
            <span className={cn(
              "shrink-0",
              status === "read" ? "text-nada-accent" : "text-nada-secondary/[.30]"
            )}>
              {status === "sent" ? <Check size={13} /> : <CheckCheck size={13} />}
            </span>
          )}
          <p className={cn(
            "truncate text-sm leading-snug",
            unreadCount > 0 ? "font-medium text-nada-primary/80" : "text-nada-secondary/[.60]"
          )}>
            {preview}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isMuted && <VolumeX size={12} className="text-nada-secondary/[.25]" />}
          {isPinned && <Pin size={12} className="text-nada-secondary/[.30] -rotate-45" />}
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-nada-accent px-1 text-[10px] font-black text-black shadow-gold-glow"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </div>
      </div>
    </div>
  </motion.button>
);

/* ─────────────────────────────────────────────────────────────
   Bottom Navigation — VANTA minimal with gold active tab
   ───────────────────────────────────────────────────────────── */
export const BottomNavigation = ({
  activeTab,
  onTabChange,
  unreadCount = 0
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  unreadCount?: number;
}) => {
  const tabs = [
    { id: "chats",       label: "Chats",       icon: MessageCircle, badge: unreadCount },
    { id: "status",      label: "Status",      icon: CircleDashed },
    { id: "communities", label: "Groups",       icon: Users },
    { id: "settings",    label: "Settings",     icon: Settings }
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-header border-t border-white/[0.04] pb-safe-area pl-safe-area pr-safe-area"
      style={{ background: "rgba(13, 20, 30, 0.8)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      <div className="flex h-16 items-center justify-around px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center justify-center flex-1 h-full pt-1.5 transition-all active:scale-95 group"
            >
              <div className="relative flex items-center justify-center h-8 w-14 mb-1">
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full bg-nada-accent/15"
                    initial={false}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon
                  className={cn(
                    "h-[22px] w-[22px] transition-colors relative z-10",
                    isActive ? "text-nada-accent" : "text-nada-secondary/[.40]"
                  )}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-nada-accent px-0.5 text-[9px] font-black text-black border border-black z-20">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>

              <span className={cn(
                "text-[10px] font-bold tracking-tight transition-colors pb-1.5 relative z-10",
                isActive ? "text-nada-accent" : "text-nada-secondary/[.40]"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   NADA Logo Mark
   ───────────────────────────────────────────────────────────── */
const NadaLogoMark = ({ size = 28 }: { size?: number }) => (
  <div
    className="flex items-center justify-center rounded-xl overflow-hidden shrink-0"
    style={{
      width: size,
      height: size,
      background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))",
      boxShadow: "0 2px 8px rgba(247,185,40,0.3)"
    }}
  >
    <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Mobile Header — VANTA style
   ───────────────────────────────────────────────────────────── */
const TAB_TITLES: Record<string, string> = {
  chats: "Inbox",
  status: "Status",
  communities: "Groups",
  settings: "Settings"
};

export const MobileHeader = ({
  activeTab = "chats",
  onComposeClick
}: {
  displayName: string;
  activeTab?: string;
  onCameraClick: () => void;
  onMoreClick: () => void;
  onComposeClick?: () => void;
}) => (
  <header
    className="sticky top-0 z-header flex items-end justify-between px-5 pb-3 pt-safe-area pl-safe-area pr-safe-area border-b border-white/[0.04]"
    style={{ background: "rgba(13, 20, 30, 0.8)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
  >
    <div className="flex items-center gap-3 pt-4">
      <NadaLogoMark size={30} />
    </div>

    <div className="pt-4">
      <h1 className="text-[28px] font-bold tracking-tight text-nada-primary" style={{ letterSpacing: "-0.5px" }}>
        {TAB_TITLES[activeTab] ?? "Inbox"}
      </h1>
    </div>

    <div className="pt-4">
      <button
        onClick={onComposeClick}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-nada-border/[.12] transition-all hover:border-nada-accent/30 hover:bg-nada-surface-elevated active:scale-90"
        style={{ background: "rgb(var(--nada-surface-elevated))" }}
        aria-label="New conversation"
      >
        <Plus className="h-4 w-4 text-nada-secondary/70" />
      </button>
    </div>
  </header>
);

/* ─────────────────────────────────────────────────────────────
   MobileChatsHome
   ───────────────────────────────────────────────────────────── */
export const MobileChatsHome = ({
  children,
  searchQuery,
  onSearchChange,
  unreadTotal,
  onComposeClick,
  activeTab,
  onTabChange,
  headerProps
}: {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  unreadTotal: number;
  onComposeClick: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  headerProps: {
    displayName: string;
    activeTab?: string;
    onCameraClick: () => void;
    onMoreClick: () => void;
  };
}) => (
  <div className="flex h-full flex-col overflow-hidden" style={{ background: "rgb(var(--nada-bg))" }}>
    <MobileHeader
      {...headerProps}
      activeTab={headerProps.activeTab ?? activeTab}
      onComposeClick={onComposeClick}
    />
    <SearchBar value={searchQuery} onChange={onSearchChange} />

    <div className="flex-1 overflow-y-auto pb-24">
      {children}
    </div>

    <BottomNavigation
      activeTab={activeTab}
      onTabChange={onTabChange}
      unreadCount={unreadTotal}
    />
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Empty Chat List State
   ───────────────────────────────────────────────────────────── */
export const EmptyChatListState = ({ onAdd }: { onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center py-24 px-10 text-center animate-fade-in">
    <div
      className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-nada-border/[.08]"
      style={{ background: "rgb(var(--nada-surface-elevated))" }}
    >
      <MessageCircle className="h-9 w-9 text-nada-secondary/[.20]" />
    </div>
    <h3 className="mb-2 text-base font-bold text-nada-primary">No conversations yet</h3>
    <p className="mb-8 text-sm leading-relaxed text-nada-secondary/[.60]">
      Add a contact to start an anonymous,<br />encrypted conversation.
    </p>
    <button
      onClick={onAdd}
      className="nada-btn-gold px-6 py-3 text-sm font-bold"
    >
      Add first contact
    </button>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Chat List Skeleton
   ───────────────────────────────────────────────────────────── */
export const ChatListSkeleton = () => (
  <div className="space-y-0">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className="flex items-center gap-4 border-b border-nada-border/[.05] px-5 py-4">
        <div className="h-[52px] w-[52px] shrink-0 rounded-2xl nada-skeleton" />
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="h-4 w-1/3 rounded-md nada-skeleton" />
            <div className="h-3 w-10 rounded-md nada-skeleton" />
          </div>
          <div className="h-3 w-2/3 rounded-md nada-skeleton" />
        </div>
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Profile Header — for profile/shared-media view
   ───────────────────────────────────────────────────────────── */
export const ProfileHeader = ({
  name,
  username,
  bio,
  avatar,
  initials
}: {
  name: string;
  username?: string;
  bio?: string;
  avatar?: string;
  initials?: string;
}) => (
  <div className="flex flex-col items-center px-6 py-8 text-center">
    {/* Avatar */}
    <div
      className="relative mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl"
      style={{
        background: "rgb(var(--nada-surface-3))",
        boxShadow: "0 0 0 1px rgb(var(--nada-border) / 0.06), 0 8px 32px rgba(0,0,0,0.5)"
      }}
    >
      {avatar ? (
        <img src={avatar} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-2xl font-bold text-nada-secondary/[.50]">{initials}</span>
      )}
    </div>

    <h2 className="text-xl font-bold text-nada-primary" style={{ letterSpacing: "-0.3px" }}>
      {name}
    </h2>
    {username && (
      <p className="mt-0.5 text-sm text-nada-secondary/[.60]">{username}</p>
    )}
    {bio && (
      <p className="mt-3 text-sm leading-relaxed text-nada-secondary/[.80] max-w-[240px]">
        {bio}
      </p>
    )}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Settings Row — icon + label + chevron
   ───────────────────────────────────────────────────────────── */
export const SettingsRowItem = ({
  icon: Icon,
  label,
  value,
  onClick,
  danger = false
}: {
  icon?: React.ElementType;
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}) => (
  <button
    onClick={onClick}
    className="flex w-full items-center gap-4 px-5 py-3.5 border-b border-nada-border/[.05] hover:bg-nada-surface-elevated/30 transition-colors active:bg-nada-surface-elevated/50"
  >
    {Icon && (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: danger ? "rgb(255 77 77 / 0.12)" : "rgb(247 185 40 / 0.10)" }}>
        <Icon className={cn("h-[17px] w-[17px]", danger ? "text-nada-danger" : "text-nada-accent")} />
      </div>
    )}
    <span className={cn("flex-1 text-left text-[15px] font-medium", danger ? "text-nada-danger" : "text-nada-primary")}>
      {label}
    </span>
    {value && (
      <span className="mr-1 text-sm text-nada-secondary/[.50]">{value}</span>
    )}
    <ChevronRight className="h-4 w-4 text-nada-secondary/[.25]" />
  </button>
);
