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
   SearchBar — Premium floating glass style
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
  <div className="px-4 py-2.5">
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-3.5 h-[15px] w-[15px] text-nada-secondary/40" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-2xl border border-nada-border/15 pl-10 pr-4 text-[13px] text-nada-primary outline-none placeholder:text-nada-secondary/35 focus:border-nada-accent/35 focus:ring-2 focus:ring-nada-accent/8 transition-all duration-200"
        style={{
          background: "rgb(var(--nada-surface-elevated) / 0.65)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)"
        }}
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Archived Row
   ───────────────────────────────────────────────────────────── */
export const ArchivedRow = ({ count = 0 }: { count?: number }) => (
  <motion.button
    whileTap={{ scale: 0.98 }}
    className="flex w-full items-center justify-between px-4 py-3.5 hover:bg-nada-surface-elevated/30 transition-colors duration-150 border-b border-nada-border/8"
  >
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-nada-border/10"
        style={{ background: "rgb(var(--nada-surface-elevated) / 0.6)" }}
      >
        <Archive className="h-4.5 w-4.5 text-nada-secondary/50" />
      </div>
      <span className="text-[14px] font-semibold text-nada-primary/90">Archived</span>
    </div>
    <div className="flex items-center gap-2">
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-nada-accent px-1.5 text-[10px] font-bold text-white shadow-accent-glow">
          {count}
        </span>
      )}
      <ChevronRight className="h-3.5 w-3.5 text-nada-secondary/20" />
    </div>
  </motion.button>
);

/* ─────────────────────────────────────────────────────────────
   ChatListItem — Premium card design
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
    whileTap={{ scale: 0.985 }}
    className={cn(
      "flex w-full items-center gap-3 border-b border-nada-border/[.06] px-4 py-3.5 text-left transition-all duration-150",
      isSelected
        ? "bg-nada-accent/[.07] border-l-2 border-l-nada-accent"
        : "hover:bg-nada-surface-elevated/25 active:bg-nada-surface-elevated/40"
    )}
  >
    {/* Avatar */}
    <div className="relative shrink-0">
      <div className={cn(
        "flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[18px] font-semibold",
        unreadCount > 0
          ? "ring-2 ring-nada-accent/40"
          : "ring-1 ring-nada-border/10"
      )}
        style={{
          background: unreadCount > 0
            ? "linear-gradient(145deg, rgb(var(--nada-accent) / 0.22), rgb(var(--nada-gold-dark) / 0.15))"
            : "rgb(var(--nada-surface-3))"
        }}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[15px] font-bold text-nada-accent/80">
            {initials}
          </span>
        )}
      </div>
      {isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-nada-bg shadow-sm"
          style={{ background: "rgb(var(--nada-success))" }}
        />
      )}
    </div>

    {/* Content */}
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className={cn(
          "truncate text-[14.5px] tracking-tight",
          unreadCount > 0 ? "font-bold text-nada-primary" : "font-semibold text-nada-primary/80"
        )}>
          {name}
        </h3>
        <span className={cn(
          "shrink-0 text-[11px] tabular-nums font-medium",
          unreadCount > 0 ? "text-nada-accent" : "text-nada-secondary/40"
        )}>
          {timestamp}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {status && (
            <span className={cn(
              "shrink-0",
              status === "read" ? "text-nada-accent" : "text-nada-secondary/22"
            )}>
              {status === "sent" ? <Check size={12} /> : <CheckCheck size={12} />}
            </span>
          )}
          <p className={cn(
            "truncate text-[12.5px] leading-snug",
            unreadCount > 0 ? "font-medium text-nada-primary/80" : "text-nada-secondary/50"
          )}>
            {preview}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isMuted && <VolumeX size={11} className="text-nada-secondary/18" />}
          {isPinned && <Pin size={11} className="text-nada-secondary/22 -rotate-45" />}
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              className="flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1 text-[10px] font-black shadow-accent-glow"
              style={{
                background: "rgb(var(--nada-accent))",
                color: "rgb(10 14 26)"
              }}
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
   Bottom Navigation — Premium pill indicator
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
    { id: "chats",       label: "Chats",    icon: MessageCircle, badge: unreadCount },
    { id: "status",      label: "Status",   icon: CircleDashed },
    { id: "communities", label: "Groups",   icon: Users },
    { id: "settings",    label: "Settings", icon: Settings }
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-header border-t border-white/[0.04] pb-safe-area pl-safe-area pr-safe-area"
      style={{
        background: "linear-gradient(to top, rgba(10, 14, 26, 0.97), rgba(10, 14, 26, 0.75))",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)"
      }}
    >
      <div className="flex h-[60px] items-center justify-around px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all active:scale-90"
            >
              <div className="relative flex items-center justify-center h-8 w-14">
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "rgb(var(--nada-accent) / 0.14)" }}
                    initial={false}
                    transition={{ type: "spring", stiffness: 450, damping: 34 }}
                  />
                )}
                <Icon
                  className={cn(
                    "h-[22px] w-[22px] transition-all duration-250 relative z-10",
                    isActive ? "text-nada-accent" : "text-nada-secondary/32"
                  )}
                  strokeWidth={isActive ? 2.3 : 1.9}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute -top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-black border border-nada-bg z-20"
                    style={{
                      background: "rgb(var(--nada-accent))",
                      color: "rgb(10 14 26)",
                      boxShadow: "0 0 8px rgba(129,140,248,0.5)"
                    }}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </motion.span>
                )}
              </div>
              <span className={cn(
                "text-[9.5px] font-bold tracking-tight transition-all duration-200 leading-none",
                isActive ? "text-nada-accent" : "text-nada-secondary/30"
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
const NadaLogoMark = ({ size = 30 }: { size?: number }) => (
  <motion.div
    whileHover={{ scale: 1.06 }}
    whileTap={{ scale: 0.94 }}
    className="flex items-center justify-center rounded-[10px] overflow-hidden shrink-0 cursor-pointer"
    style={{
      width: size,
      height: size,
      background: "linear-gradient(145deg, rgb(var(--nada-accent)), rgb(var(--nada-gold-dark)))",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 4px 16px rgba(129,140,248,0.3)"
    }}
  >
    <img src="/logo.png" alt="NADA" className="h-full w-full object-cover" />
  </motion.div>
);

/* ─────────────────────────────────────────────────────────────
   Mobile Header
   ───────────────────────────────────────────────────────────── */
const TAB_TITLES: Record<string, string> = {
  chats: "Messages",
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
    className="sticky top-0 z-header flex items-center justify-between px-4 pb-2.5 pt-safe-area pl-safe-area pr-safe-area border-b border-white/[0.03]"
    style={{
      background: "linear-gradient(to bottom, rgba(10,14,26,0.97), rgba(10,14,26,0.82))",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)"
    }}
  >
    <div className="flex items-center gap-2.5 pt-3">
      <NadaLogoMark size={30} />
    </div>

    <div className="absolute left-1/2 -translate-x-1/2 pt-3">
      <h1 className="text-[18px] font-bold tracking-tight text-nada-primary" style={{ letterSpacing: "-0.4px" }}>
        {TAB_TITLES[activeTab] ?? "Messages"}
      </h1>
    </div>

    <div className="pt-3">
      <motion.button
        onClick={onComposeClick}
        whileTap={{ scale: 0.9 }}
        className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-nada-border/12 transition-all duration-150 hover:border-nada-accent/30 active:scale-90"
        style={{ background: "rgb(var(--nada-surface-elevated) / 0.55)" }}
        aria-label="New conversation"
      >
        <Plus className="h-[18px] w-[18px] text-nada-secondary/55" />
      </motion.button>
    </div>
  </header>
);

/* ─────────────────────────────────────────────────────────────
   MobileChatsHome — main shell
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

    <div className="flex-1 overflow-y-auto pb-[72px]">
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
  <div className="flex flex-col items-center justify-center py-24 px-10 text-center">
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="mb-6 relative"
    >
      {/* Glow ring */}
      <div
        className="absolute inset-0 rounded-[28px] opacity-40 blur-xl"
        style={{ background: "radial-gradient(circle, rgba(129,140,248,0.5) 0%, transparent 70%)" }}
      />
      <div
        className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[28px] border border-nada-border/10"
        style={{
          background: "linear-gradient(145deg, rgb(var(--nada-surface-elevated)), rgb(var(--nada-surface-3)))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
        }}
      >
        <MessageCircle className="h-9 w-9 text-nada-accent/35" strokeWidth={1.5} />
      </div>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <h3 className="mb-2 text-[17px] font-bold text-nada-primary tracking-tight">No conversations yet</h3>
      <p className="mb-7 text-[13px] leading-relaxed text-nada-secondary/55 max-w-[220px]">
        Add a contact to start an anonymous, encrypted conversation.
      </p>
      <motion.button
        onClick={onAdd}
        whileTap={{ scale: 0.95 }}
        className="nada-btn-gold inline-flex h-11 items-center justify-center rounded-2xl px-6 text-sm font-semibold text-white"
      >
        Add first contact
      </motion.button>
    </motion.div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Chat List Skeleton — refined shimmer
   ───────────────────────────────────────────────────────────── */
export const ChatListSkeleton = () => (
  <div className="space-y-0">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className="flex items-center gap-3 border-b border-nada-border/[.05] px-4 py-3.5">
        <div className="h-[52px] w-[52px] shrink-0 rounded-[18px] nada-skeleton" />
        <div className="flex-1 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="h-3.5 w-2/5 rounded-lg nada-skeleton" />
            <div className="h-2.5 w-10 rounded-lg nada-skeleton" />
          </div>
          <div className="h-2.5 w-3/5 rounded-lg nada-skeleton" />
        </div>
      </div>
    ))}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Profile Header
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
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="relative mb-5"
    >
      {/* Glow backdrop */}
      <div
        className="absolute inset-0 rounded-[28px] blur-2xl opacity-35"
        style={{ background: "radial-gradient(circle, rgba(129,140,248,0.6) 0%, transparent 70%)" }}
      />
      <div
        className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] font-semibold"
        style={{
          background: "linear-gradient(145deg, rgb(var(--nada-surface-3)), rgb(var(--nada-surface-elevated)))",
          boxShadow: "0 0 0 2px rgb(var(--nada-bg)), 0 0 0 4px rgb(var(--nada-accent) / 0.3), 0 12px 40px rgba(129,140,248,0.15)"
        }}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl font-bold text-nada-accent/65">{initials}</span>
        )}
      </div>
    </motion.div>

    <h2 className="text-[22px] font-bold text-nada-primary tracking-tight" style={{ letterSpacing: "-0.4px" }}>
      {name}
    </h2>
    {username && (
      <p className="mt-1 text-sm text-nada-secondary/55">{username}</p>
    )}
    {bio && (
      <p className="mt-4 text-sm leading-relaxed text-nada-secondary/70 max-w-xs">{bio}</p>
    )}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Settings Row Item
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
    whileTap={{ scale: 0.98 }}
    className="flex w-full items-center gap-3.5 px-4 py-3.5 border-b border-nada-border/[.06] transition-colors duration-150 hover:bg-nada-surface-elevated/25 active:bg-nada-surface-elevated/40"
  >
    {Icon && (
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
        style={{ background: danger ? "rgb(252 165 165 / 0.1)" : "rgb(var(--nada-accent) / 0.1)" }}
      >
        <Icon className={cn("h-[18px] w-[18px]", danger ? "text-nada-danger" : "text-nada-accent")} />
      </div>
    )}
    <span className={cn("flex-1 text-left text-[14.5px] font-medium", danger ? "text-nada-danger" : "text-nada-primary")}>
      {label}
    </span>
    {value && (
      <span className="mr-1.5 text-[13px] text-nada-secondary/40">{value}</span>
    )}
    <ChevronRight className="h-3.5 w-3.5 text-nada-secondary/18" />
  </motion.button>
);
