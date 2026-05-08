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
  Trash2,
  VolumeX,
  Pin,
  ChevronRight,
  CircleDashed,
  Network
} from "lucide-react";
import { cn } from "@nada/ui";
import { motion } from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   SearchBar — floating glass input
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
      <Search className="pointer-events-none absolute left-3.5 h-[15px] w-[15px] text-nada-secondary/45" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl border border-nada-border/10 pl-10 pr-4 text-[13.5px] text-nada-primary outline-none placeholder:text-nada-secondary/45 transition-all duration-200 focus:border-nada-accent/35 focus:ring-4 focus:ring-nada-accent/10"
        style={{
          background: "rgb(var(--nada-surface-elevated) / 0.7)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)"
        }}
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Archived Row
   ───────────────────────────────────────────────────────────── */
export const ArchivedRow = ({
  count = 0,
  onClick
}: {
  count?: number;
  onClick?: () => void;
}) => (
  <motion.button
    onClick={onClick}
    whileTap={{ scale: 0.985 }}
    className="group flex w-full items-center justify-between border-b border-nada-border/[0.08] px-4 py-3.5 transition-colors duration-150 hover:bg-nada-surface-elevated/30"
  >
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-nada-border/15 transition-colors duration-150 group-hover:border-nada-accent/25"
        style={{ background: "rgb(var(--nada-surface-elevated) / 0.7)" }}
      >
        <Archive className="h-[17px] w-[17px] text-nada-secondary/55" />
      </div>
      <span className="text-[14px] font-semibold text-nada-primary/90">Archived</span>
    </div>
    <div className="flex items-center gap-2">
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-nada-accent px-1.5 text-[10px] font-bold text-nada-bg shadow-accent-glow">
          {count}
        </span>
      )}
      <ChevronRight className="h-3.5 w-3.5 text-nada-secondary/25" />
    </div>
  </motion.button>
);

/* ─────────────────────────────────────────────────────────────
   ChatListItem — refined card with avatar gradient & active rail
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
  onClick,
  onArchive,
  onDelete,
  archiveLabel = "Archive",
  deleteLabel = "Delete"
}: {
  name: string;
  preview: string;
  timestamp: string;
  unreadCount: number;
  avatar?: string | undefined;
  initials?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  isOnline?: boolean | undefined;
  status?: "sent" | "delivered" | "read";
  isSelected?: boolean;
  onClick: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  archiveLabel?: string;
  deleteLabel?: string;
}) => (
  <div className="relative overflow-hidden border-b border-nada-border/[0.06]">
    <div className="absolute inset-y-0 left-0 flex w-28 items-center justify-start bg-nada-accent/15 pl-4 text-nada-accent">
      <div className="flex flex-col items-center gap-1 text-[10px] font-bold">
        <Archive size={18} />
        {archiveLabel}
      </div>
    </div>
    <div className="absolute inset-y-0 right-0 flex w-28 items-center justify-end bg-red-500/15 pr-4 text-red-300">
      <div className="flex flex-col items-center gap-1 text-[10px] font-bold">
        <Trash2 size={18} />
        {deleteLabel}
      </div>
    </div>
    <motion.button
      drag={onArchive || onDelete ? "x" : false}
      dragConstraints={{ left: onDelete ? -96 : 0, right: onArchive ? 96 : 0 }}
      dragElastic={0.08}
      onClick={onClick}
      onDragEnd={(_event, info) => {
        if (info.offset.x > 72) {
          onArchive?.();
        } else if (info.offset.x < -72) {
          onDelete?.();
        }
      }}
      whileTap={{ scale: 0.985 }}
      className={cn(
        "relative z-10 flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all duration-150",
        isSelected
          ? "bg-gradient-to-r from-nada-accent/[0.08] via-nada-accent/[0.04] to-nada-surface"
          : "bg-nada-surface hover:bg-nada-surface-elevated active:bg-nada-surface-elevated/90"
      )}
    >
    {/* Active rail */}
    {isSelected && (
      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full"
        style={{
          background: "linear-gradient(180deg, rgb(var(--nada-accent)), rgb(var(--nada-violet)))",
          boxShadow: "0 0 16px rgba(139,148,252,0.6)"
        }}
      />
    )}

    {/* Avatar */}
    <div className="relative shrink-0">
      <div className={cn(
        "flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[18px] font-semibold transition-all duration-200",
        unreadCount > 0
          ? "ring-2 ring-nada-accent/45"
          : "ring-1 ring-nada-border/20"
      )}
        style={{
          background: unreadCount > 0
            ? "linear-gradient(145deg, rgb(var(--nada-accent) / 0.28), rgb(var(--nada-violet) / 0.18))"
            : "linear-gradient(145deg, rgb(var(--nada-surface-3)), rgb(var(--nada-surface-elevated)))",
          boxShadow: unreadCount > 0 ? "0 4px 16px rgba(139,148,252,0.18)" : undefined
        }}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className={cn(
            "text-[15px] font-bold",
            unreadCount > 0 ? "text-white" : "text-nada-accent/85"
          )}>
            {initials}
          </span>
        )}
      </div>
      {isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-nada-bg"
          style={{
            background: "rgb(var(--nada-success))",
            boxShadow: "0 0 8px rgba(52,211,153,0.55)"
          }}
        />
      )}
    </div>

    {/* Content */}
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className={cn(
          "truncate text-[14.5px] tracking-tight",
          unreadCount > 0 ? "font-bold text-nada-primary" : "font-semibold text-nada-primary/85"
        )}>
          {name}
        </h3>
        <span className={cn(
          "shrink-0 text-[11px] font-medium tabular-nums",
          unreadCount > 0 ? "text-nada-accent" : "text-nada-secondary/45"
        )}>
          {timestamp}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {status && (
            <span className={cn(
              "shrink-0",
              status === "read" ? "text-nada-accent" : "text-nada-secondary/30"
            )}>
              {status === "sent" ? <Check size={12} /> : <CheckCheck size={12} />}
            </span>
          )}
          <p className={cn(
            "truncate text-[12.5px] leading-snug",
            unreadCount > 0 ? "font-medium text-nada-primary/85" : "text-nada-secondary/55"
          )}>
            {preview}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isMuted && <VolumeX size={11} className="text-nada-secondary/22" />}
          {isPinned && <Pin size={11} className="text-nada-secondary/26 -rotate-45" />}
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-black"
              style={{
                background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-violet)))",
                color: "rgb(8 10 22)",
                boxShadow: "0 0 12px rgba(139,148,252,0.45), 0 0 0 2px rgb(var(--nada-bg))"
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </div>
      </div>
    </div>
    </motion.button>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Bottom Navigation — pill indicator with motion layout
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
    { id: "groups",      label: "Groups",   icon: Users },
    { id: "communities", label: "Community", icon: Network },
    { id: "settings",    label: "Settings", icon: Settings }
  ];

  return (
    <div className="absolute bottom-3 left-3 right-3 z-header pb-safe-area pl-safe-area pr-safe-area">
      <div
        className="flex h-[68px] items-center justify-around rounded-[24px] border border-nada-border/[0.08] px-1.5 shadow-2xl"
        style={{
          background: "rgba(13,18,36,0.86)",
          backdropFilter: "blur(24px) saturate(150%)",
          WebkitBackdropFilter: "blur(24px) saturate(150%)"
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 h-full transition-all active:scale-90"
            >
              <div className="relative flex h-9 w-full max-w-[58px] items-center justify-center">
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: "rgb(var(--nada-accent) / 0.16)",
                      boxShadow: "inset 0 0 0 1px rgb(var(--nada-accent) / 0.30)"
                    }}
                    initial={false}
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative z-10 h-[21px] w-[21px] transition-all duration-200",
                    isActive ? "text-nada-accent" : "text-nada-secondary/40"
                  )}
                  strokeWidth={isActive ? 2.4 : 1.9}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute -top-0.5 right-2 z-20 flex h-4 min-w-4 items-center justify-center rounded-full border border-nada-bg px-0.5 text-[9px] font-black"
                    style={{
                      background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-violet)))",
                      color: "rgb(8 10 22)",
                      boxShadow: "0 0 10px rgba(139,148,252,0.55)"
                    }}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </motion.span>
                )}
              </div>
              <span className={cn(
                "text-[9.5px] font-bold leading-none transition-all duration-200",
                isActive ? "text-nada-accent" : "text-nada-secondary/40"
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
const NadaLogoMark = ({ size = 32 }: { size?: number }) => (
  <motion.div
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.94 }}
    className="flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[11px] nada-logo-aura"
    style={{ width: size, height: size }}
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
  groups: "Groups",
  communities: "Communities",
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
    className="sticky top-0 z-header flex items-center justify-between border-b border-nada-border/[0.05] px-4 pb-3 pt-safe-area pl-safe-area pr-safe-area"
    style={{
      background: "linear-gradient(to bottom, rgba(8,10,22,0.98), rgba(8,10,22,0.82))",
      backdropFilter: "blur(28px) saturate(150%)",
      WebkitBackdropFilter: "blur(28px) saturate(150%)"
    }}
  >
    <div className="flex items-center gap-2.5 pt-3">
      <NadaLogoMark size={32} />
    </div>

    <div className="absolute left-1/2 -translate-x-1/2 pt-3">
      <h1 className="text-[18px] font-bold tracking-tight text-nada-primary">
        {TAB_TITLES[activeTab] ?? "Messages"}
      </h1>
    </div>

    <div className="pt-3">
      <motion.button
        onClick={onComposeClick}
        whileTap={{ scale: 0.9 }}
        className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-nada-border/22 transition-all duration-150 hover:border-nada-accent/40 active:scale-90"
        style={{
          background: "rgb(var(--nada-surface-elevated) / 0.7)",
          backdropFilter: "blur(12px)"
        }}
        aria-label="New conversation"
      >
        <Plus className="h-[18px] w-[18px] text-nada-primary/75" strokeWidth={2.2} />
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
  <div className="relative flex h-full flex-col overflow-hidden nada-chat-bg">
    <MobileHeader
      {...headerProps}
      activeTab={headerProps.activeTab ?? activeTab}
      onComposeClick={onComposeClick}
    />
    <SearchBar value={searchQuery} onChange={onSearchChange} />

    <div className="flex-1 overflow-y-auto pb-[84px]">
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
  <div className="flex flex-col items-center justify-center px-10 py-20 text-center">
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="relative mb-7"
    >
      <div className="absolute inset-0 rounded-[28px] opacity-50 blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(139,148,252,0.55) 0%, transparent 70%)" }}
      />
      <div className="relative flex h-[92px] w-[92px] items-center justify-center rounded-[28px] border border-nada-border/22"
        style={{
          background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated)) 0%, rgb(var(--nada-surface-3)) 100%)",
          boxShadow: "inset 0 1px 0 rgb(var(--nada-border) / 0.10), 0 12px 36px rgba(0,0,0,0.32)"
        }}
      >
        <MessageCircle className="h-9 w-9 text-nada-accent/55" strokeWidth={1.6} />
      </div>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <h3 className="mb-2 text-[18px] font-bold tracking-tight text-nada-primary">No conversations yet</h3>
      <p className="mb-7 max-w-[240px] text-[13.5px] leading-relaxed text-nada-secondary/65">
        Add a contact via invite link or QR to start an anonymous, encrypted conversation.
      </p>
      <motion.button
        onClick={onAdd}
        whileTap={{ scale: 0.96 }}
        className="nada-btn-gold inline-flex h-11 items-center justify-center rounded-2xl px-6 text-[13.5px] font-semibold text-white"
      >
        Add first contact
      </motion.button>
    </motion.div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Chat List Skeleton
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
      <div className="absolute inset-0 rounded-[32px] opacity-40 blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(139,148,252,0.65) 0%, transparent 70%)" }}
      />
      <div className="relative flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-[32px] font-semibold"
        style={{
          background: "linear-gradient(155deg, rgb(var(--nada-surface-3)), rgb(var(--nada-surface-elevated)))",
          boxShadow: "0 0 0 2px rgb(var(--nada-bg)), 0 0 0 5px rgb(var(--nada-accent) / 0.35), 0 16px 48px rgba(139,148,252,0.18)"
        }}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[34px] font-bold text-nada-accent/80">{initials}</span>
        )}
      </div>
    </motion.div>

    <h2 className="text-[23px] font-bold tracking-tight text-nada-primary">
      {name}
    </h2>
    {username && (
      <p className="mt-1 text-[13.5px] text-nada-secondary/65">{username}</p>
    )}
    {bio && (
      <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-nada-secondary/80">{bio}</p>
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
    whileTap={{ scale: 0.985 }}
    className="flex w-full items-center gap-3.5 border-b border-nada-border/[.06] px-4 py-3.5 transition-colors duration-150 hover:bg-nada-surface-elevated/30 active:bg-nada-surface-elevated/45"
  >
    {Icon && (
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]"
        style={{
          background: danger ? "rgb(248 113 113 / 0.12)" : "rgb(var(--nada-accent) / 0.12)",
          boxShadow: "inset 0 0 0 1px rgb(var(--nada-border) / 0.08)"
        }}
      >
        <Icon className={cn("h-[18px] w-[18px]", danger ? "text-nada-danger" : "text-nada-accent")} strokeWidth={2} />
      </div>
    )}
    <span className={cn("flex-1 text-left text-[14.5px] font-medium tracking-tight", danger ? "text-nada-danger" : "text-nada-primary")}>
      {label}
    </span>
    {value && (
      <span className="mr-1.5 text-[13px] text-nada-secondary/50">{value}</span>
    )}
    <ChevronRight className="h-3.5 w-3.5 text-nada-secondary/22" />
  </motion.button>
);
