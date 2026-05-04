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
  <div className="px-5 py-3">
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-4 h-[16px] w-[16px] text-nada-secondary/[.35]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-nada-border/20 bg-nada-surface-elevated pl-12 pr-4 text-sm text-nada-primary outline-none placeholder:text-nada-secondary/[.35] focus:border-nada-accent/40 focus:ring-4 focus:ring-nada-accent/10 transition-all duration-300 backdrop-blur-sm"
        style={{ background: "rgb(var(--nada-surface-elevated) / 0.7)" }}
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Archived Row — Premium styling
   ───────────────────────────────────────────────────────────── */
export const ArchivedRow = ({ count = 0 }: { count?: number }) => (
  <button className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-nada-surface-elevated/40 transition-colors duration-200 border-b border-nada-border/[.05]">
    <div className="flex items-center gap-3.5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-nada-surface-elevated border border-nada-border/[.12]">
        <Archive className="h-5 w-5 text-nada-secondary/[.55]" />
      </div>
      <span className="text-[15px] font-semibold text-nada-primary">Archived</span>
    </div>
    <div className="flex items-center gap-2">
      {count > 0 && (
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-nada-accent px-2 text-[11px] font-bold text-black shadow-lg">
          {count}
        </span>
      )}
      <ChevronRight className="h-4 w-4 text-nada-secondary/[.25]" />
    </div>
  </button>
);

/* ─────────────────────────────────────────────────────────────
   ChatListItem — Modern refined styling
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
    whileTap={{ scale: 0.98 }}
    className={cn(
      "flex w-full items-center gap-3.5 border-b border-nada-border/[.05] px-5 py-4 text-left transition-all duration-200",
      isSelected
        ? "bg-nada-accent/8"
        : "hover:bg-nada-surface-elevated/30 active:bg-nada-surface-elevated/50"
    )}
  >
    {/* Avatar */}
    <div className="relative shrink-0">
      <div className={cn(
        "flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl font-semibold",
        unreadCount > 0
          ? "ring-1.5 ring-nada-accent/35 bg-gradient-to-br from-nada-accent/20 to-nada-gold-dark/15"
          : "ring-1 ring-nada-border/12 bg-nada-surface-3"
      )}>
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-nada-accent/70">
            {initials}
          </span>
        )}
      </div>
      {isOnline && (
        <div className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-nada-bg bg-nada-success shadow-lg" />
      )}
    </div>

    {/* Content */}
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className={cn(
          "truncate text-[15px] font-semibold tracking-tight",
          unreadCount > 0 ? "text-nada-primary" : "text-nada-primary/85"
        )}>
          {name}
        </h3>
        <span className={cn(
          "shrink-0 text-[11px] tabular-nums font-medium",
          unreadCount > 0 ? "text-nada-accent" : "text-nada-secondary/[.45]"
        )}>
          {timestamp}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {status && (
            <span className={cn(
              "shrink-0",
              status === "read" ? "text-nada-accent" : "text-nada-secondary/[.25]"
            )}>
              {status === "sent" ? <Check size={13} /> : <CheckCheck size={13} />}
            </span>
          )}
          <p className={cn(
            "truncate text-[13px] leading-snug",
            unreadCount > 0 ? "font-medium text-nada-primary/85" : "text-nada-secondary/[.55]"
          )}>
            {preview}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isMuted && <VolumeX size={13} className="text-nada-secondary/[.20]" />}
          {isPinned && <Pin size={13} className="text-nada-secondary/[.25] -rotate-45" />}
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-nada-accent px-1 text-[10px] font-black text-black shadow-lg"
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
   Bottom Navigation — Modern refined design
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
      className="fixed bottom-0 left-0 right-0 z-header border-t border-white/[0.05] pb-safe-area pl-safe-area pr-safe-area"
      style={{ 
        background: "linear-gradient(to top, rgba(13, 20, 30, 0.95), rgba(13, 20, 30, 0.7))",
        backdropFilter: "blur(24px)", 
        WebkitBackdropFilter: "blur(24px)" 
      }}
    >
      <div className="flex h-16 items-center justify-around px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center justify-center flex-1 h-full pt-1 transition-all active:scale-90 group"
            >
              <div className="relative flex items-center justify-center h-8 w-16 mb-0.5">
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full bg-nada-accent/18 blur-sm"
                    initial={false}
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon
                  className={cn(
                    "h-[24px] w-[24px] transition-all duration-300 relative z-10",
                    isActive ? "text-nada-accent" : "text-nada-secondary/[.35]"
                  )}
                  strokeWidth={isActive ? 2.2 : 2}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-nada-accent px-0.5 text-[9px] font-black text-black border border-nada-bg z-20 shadow-lg"
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </motion.span>
                )}
              </div>

              <span className={cn(
                "text-[10px] font-bold tracking-tight transition-all duration-300 pb-1 relative z-10 leading-none",
                isActive ? "text-nada-accent" : "text-nada-secondary/[.35]"
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
   NADA Logo Mark — Enhanced styling
   ───────────────────────────────────────────────────────────── */
const NadaLogoMark = ({ size = 28 }: { size?: number }) => (
  <motion.div
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    className="flex items-center justify-center rounded-2xl overflow-hidden shrink-0 cursor-pointer"
    style={{
      width: size,
      height: size,
      background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))",
      boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.1), 0 4px 16px rgba(42, 171, 238, 0.25)"
    }}
  >
    <img src="/logo.png" alt="NADA Logo" className="h-full w-full object-cover" />
  </motion.div>
);

/* ─────────────────────────────────────────────────────────────
   Mobile Header — Refined styling
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
    className="sticky top-0 z-header flex items-end justify-between px-5 pb-3 pt-safe-area pl-safe-area pr-safe-area border-b border-white/[0.03]"
    style={{ 
      background: "linear-gradient(to bottom, rgba(13, 20, 30, 0.95), rgba(13, 20, 30, 0.8))",
      backdropFilter: "blur(20px)", 
      WebkitBackdropFilter: "blur(20px)" 
    }}
  >
    <div className="flex items-center gap-3 pt-3.5">
      <NadaLogoMark size={32} />
    </div>

    <div className="pt-3.5">
      <h1 className="text-2xl font-bold tracking-tight text-nada-primary" style={{ letterSpacing: "-0.4px" }}>
        {TAB_TITLES[activeTab] ?? "Inbox"}
      </h1>
    </div>

    <div className="pt-3.5">
      <button
        onClick={onComposeClick}
        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-nada-border/[.15] transition-all duration-200 hover:border-nada-accent/40 hover:bg-nada-accent/8 active:scale-90"
        style={{ background: "rgb(var(--nada-surface-elevated) / 0.6)" }}
        aria-label="New conversation"
      >
        <Plus className="h-5 w-5 text-nada-secondary/60" />
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
  <div className="flex h-full flex-col overflow-hidden nada-chat-bg">
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
   Empty Chat List State — Refined design
   ───────────────────────────────────────────────────────────── */
export const EmptyChatListState = ({ onAdd }: { onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center py-28 px-10 text-center">
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mb-7 flex h-24 w-24 items-center justify-center rounded-3xl border border-nada-border/[.10] bg-gradient-to-br from-nada-accent/8 to-nada-gold-dark/5"
    >
      <MessageCircle className="h-10 w-10 text-nada-secondary/[.25]" />
    </motion.div>
    <h3 className="mb-2.5 text-lg font-bold text-nada-primary tracking-tight">No conversations yet</h3>
    <p className="mb-8 text-sm leading-relaxed text-nada-secondary/[.65] max-w-xs">
      Add a contact to start an anonymous, encrypted conversation.
    </p>
    <button
      onClick={onAdd}
      className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-br from-nada-accent to-nada-gold-dark px-6 text-sm font-semibold text-white shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200"
    >
      Add first contact
    </button>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Chat List Skeleton — Refined loading state
   ───────────────────────────────────────────────────────────── */
export const ChatListSkeleton = () => (
  <div className="space-y-0">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className="flex items-center gap-3.5 border-b border-nada-border/[.05] px-5 py-4 animate-pulse">
        <div className="h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br from-nada-surface-elevated to-nada-surface-3" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="h-4 w-1/2 rounded-md bg-gradient-to-r from-nada-surface-elevated to-transparent" />
            <div className="h-3 w-12 rounded-md bg-gradient-to-r from-nada-surface-elevated to-transparent" />
          </div>
          <div className="h-3 w-2/3 rounded-md bg-gradient-to-r from-nada-surface-elevated to-transparent" />
        </div>
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Profile Header — Refined styling
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
  <div className="flex flex-col items-center px-6 py-10 text-center">
    {/* Avatar */}
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative mb-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl font-semibold"
      style={{
        background: "linear-gradient(135deg, rgb(var(--nada-surface-3)), rgb(var(--nada-surface-elevated)))",
        boxShadow: "0 0 0 1px rgb(var(--nada-border) / 0.08), 0 12px 48px rgba(42, 171, 238, 0.1)"
      }}
    >
      {avatar ? (
        <img src={avatar} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-3xl font-bold text-nada-accent/60">{initials}</span>
      )}
    </motion.div>

    <h2 className="text-2xl font-bold text-nada-primary tracking-tight" style={{ letterSpacing: "-0.3px" }}>
      {name}
    </h2>
    {username && (
      <p className="mt-1 text-sm text-nada-secondary/[.60]">{username}</p>
    )}
    {bio && (
      <p className="mt-4 text-sm leading-relaxed text-nada-secondary/[.75] max-w-xs">
        {bio}
      </p>
    )}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Settings Row — Modern interactive design
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
  <motion.button
    onClick={onClick}
    whileHover={{ backgroundColor: "rgba(42, 171, 238, 0.02)" }}
    className="flex w-full items-center gap-3.5 px-5 py-4 border-b border-nada-border/[.05] transition-colors duration-200 active:bg-nada-surface-elevated/40"
  >
    {Icon && (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: danger ? "rgb(255 180 171 / 0.12)" : "rgb(42 171 238 / 0.12)" }}>
        <Icon className={cn("h-5 w-5", danger ? "text-nada-danger" : "text-nada-accent")} />
      </div>
    )}
    <span className={cn("flex-1 text-left text-[15px] font-medium", danger ? "text-nada-danger" : "text-nada-primary")}>
      {label}
    </span>
    {value && (
      <span className="mr-2 text-sm text-nada-secondary/[.45]">{value}</span>
    )}
    <ChevronRight className="h-4 w-4 text-nada-secondary/[.20]" />
  </motion.button>
);
