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
  Loader2,
  Network
} from "lucide-react";
import { cn } from "@nada/ui";
import { motion } from "framer-motion";

/* ─────────────────────────────────────────────────────────────
   SearchBar — floating glass input, premium pill style
   ───────────────────────────────────────────────────────────── */
export const SearchBar = ({
  value,
  onChange,
  placeholder = "Search ghosts, chats, invites"
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) => (
  <div className="px-5 pt-3 pb-1.5">
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-4 h-[16px] w-[16px] text-nada-secondary/70" strokeWidth={2.2} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-full border border-nada-border/[0.08] pl-11 pr-4 text-[14px] font-medium text-nada-primary outline-none placeholder:text-nada-secondary/65 transition-all duration-200 focus:border-nada-accent/40 focus:ring-4 focus:ring-nada-accent/10"
        style={{
          background: "rgb(var(--nada-surface-3) / 0.85)",
          backdropFilter: "blur(14px) saturate(140%)",
          WebkitBackdropFilter: "blur(14px) saturate(140%)"
        }}
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   SyncIndicator — inline, sleek connection status
   ───────────────────────────────────────────────────────────── */
export const SyncIndicator = ({
  status
}: {
  status: "connected" | "syncing" | "offline";
}) => {
  const config = {
    connected: {
      text: "Secure connection active",
      color: "text-nada-cyan",
      dotClass: "bg-nada-cyan shadow-[0_0_8px_rgb(var(--nada-cyan)/0.7)]",
      spinning: false
    },
    syncing: {
      text: "Syncing securely",
      color: "text-nada-accent/85",
      dotClass: "bg-nada-accent",
      spinning: true
    },
    offline: {
      text: "Offline mode active",
      color: "text-nada-warning",
      dotClass: "bg-nada-warning",
      spinning: false
    }
  }[status];

  return (
    <div className={cn(
      "flex items-center justify-center gap-1.5 px-5 pb-2 pt-0.5 text-[10.5px] font-semibold tracking-wide",
      config.color
    )}>
      {config.spinning ? (
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.6} />
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
      )}
      <span>{config.text}</span>
    </div>
  );
};

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
    whileHover={{ x: 2 }}
    className="group mx-2 my-1 flex w-[calc(100%-16px)] items-center justify-between rounded-2xl px-3 py-3 transition-colors duration-150 hover:bg-nada-surface-elevated/55"
  >
    <div className="flex items-center gap-3">
      <div
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border border-nada-border/[0.08] transition-colors duration-150 group-hover:border-nada-accent/30"
        style={{ background: "rgb(var(--nada-surface-elevated) / 0.78)" }}
      >
        <Archive className="h-[17px] w-[17px] text-nada-secondary/60" />
      </div>
      <span className="text-[14px] font-bold text-nada-primary/90">Archived</span>
    </div>
    <div className="flex items-center gap-2">
      {count > 0 && (
        <span
          className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black"
          style={{
            background:
              "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-violet)))",
            color: "#051A11",
            boxShadow: "0 0 10px rgba(30,215,130,0.55)"
          }}
        >
          {count}
        </span>
      )}
      <ChevronRight className="h-3.5 w-3.5 text-nada-secondary/30" />
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
  <div className="relative mx-2 my-1 overflow-hidden rounded-2xl">
    {/* Background action layer — left swipe reveals Archive (green) */}
    {onArchive && (
      <div className="pointer-events-none absolute inset-y-0 left-0 flex w-28 items-center justify-start bg-nada-accent/20 pl-5 text-nada-accent">
        <div className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
          <Archive size={18} />
          {archiveLabel}
        </div>
      </div>
    )}
    {/* Background action layer — right swipe reveals Delete (red) */}
    {onDelete && (
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-28 items-center justify-end bg-red-500/20 pr-5 text-red-300">
        <div className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
          <Trash2 size={18} />
          {deleteLabel}
        </div>
      </div>
    )}
    <motion.button
      drag={onArchive || onDelete ? "x" : false}
      dragConstraints={{ left: onDelete ? -112 : 0, right: onArchive ? 112 : 0 }}
      dragElastic={0.15}
      dragSnapToOrigin
      dragTransition={{ bounceStiffness: 500, bounceDamping: 32 }}
      onClick={onClick}
      onDragEnd={(_event, info) => {
        if (info.offset.x > 96) {
          onArchive?.();
        } else if (info.offset.x < -96) {
          onDelete?.();
        }
      }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "group relative z-10 flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-200 tap-highlight-none",
        isSelected
          ? "bg-gradient-to-r from-nada-accent/[0.10] via-nada-accent/[0.04] to-transparent ring-1 ring-nada-accent/30"
          : "hover:bg-nada-surface-elevated/55"
      )}
      style={{
        background: isSelected
          ? undefined
          : "rgb(var(--nada-bg))"
      }}
    >
    {/* Active rail */}
    {isSelected && (
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full"
        style={{
          background: "linear-gradient(180deg, rgb(var(--nada-accent)), rgb(var(--nada-violet)))",
          boxShadow: "0 0 16px rgba(30,215,130,0.7)"
        }}
      />
    )}

    {/* Avatar — premium rounded square */}
    <div className="relative shrink-0">
      <div className={cn(
        "flex h-[54px] w-[54px] items-center justify-center overflow-hidden rounded-[18px] font-semibold transition-all duration-200",
        unreadCount > 0
          ? "ring-2 ring-nada-accent/55"
          : "ring-1 ring-nada-border/[0.08] group-hover:ring-nada-accent/30"
      )}
        style={{
          background: unreadCount > 0
            ? "linear-gradient(145deg, rgb(var(--nada-accent) / 0.32), rgb(var(--nada-violet) / 0.20))"
            : "linear-gradient(145deg, rgb(var(--nada-surface-3)), rgb(var(--nada-surface-elevated)))",
          boxShadow: unreadCount > 0
            ? "0 6px 20px rgba(30,215,130,0.28), inset 0 1px 0 rgba(255,255,255,0.08)"
            : "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.30)"
        }}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className={cn(
            "text-[16px] font-extrabold",
            unreadCount > 0 ? "text-nada-bg" : "text-nada-accent/85"
          )}>
            {initials}
          </span>
        )}
      </div>
      {isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-nada-bg animate-breathe"
          style={{
            background: "rgb(var(--nada-accent))",
            boxShadow: "0 0 10px rgba(30,215,130,0.78)"
          }}
        />
      )}
    </div>

    {/* Content */}
    <div className="min-w-0 flex-1">
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <h3 className={cn(
          "truncate text-[15px] tracking-tight",
          unreadCount > 0 ? "font-extrabold text-nada-primary" : "font-bold text-nada-primary/90"
        )}>
          {name}
        </h3>
        <span className={cn(
          "shrink-0 text-[11px] font-semibold tabular-nums",
          unreadCount > 0 ? "text-nada-accent" : "text-nada-secondary/50"
        )}>
          {timestamp}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {status && (
            <span className={cn(
              "shrink-0",
              status === "read" ? "text-nada-accent" : "text-nada-secondary/35"
            )}>
              {status === "sent" ? <Check size={12} /> : <CheckCheck size={12} />}
            </span>
          )}
          <p className={cn(
            "truncate text-[12.5px] leading-snug",
            unreadCount > 0 ? "font-medium text-nada-primary/85" : "text-nada-secondary/60"
          )}>
            {preview}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isMuted && <VolumeX size={11} className="text-nada-secondary/26" />}
          {isPinned && <Pin size={11} className="-rotate-45 text-nada-accent/55" />}
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-black"
              style={{
                background: "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-violet)))",
                color: "#051A11",
                boxShadow: "0 0 14px rgba(30,215,130,0.65), 0 0 0 2px rgb(var(--nada-bg))"
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
        className="flex h-[66px] items-center justify-around rounded-full border border-nada-border/[0.06] px-1.5"
        style={{
          background: "rgba(14,15,18,0.92)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 50px rgba(0,0,0,0.55), 0 0 60px rgba(30,215,130,0.05)"
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 h-full transition-all active:scale-90 tap-highlight-none"
            >
              <div className="relative flex h-9 w-full max-w-[58px] items-center justify-center">
                {isActive && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "linear-gradient(135deg, rgb(var(--nada-accent) / 0.22), rgb(var(--nada-violet) / 0.14))",
                      boxShadow:
                        "inset 0 0 0 1px rgb(var(--nada-accent) / 0.42), 0 0 18px rgba(30,215,130,0.30)"
                    }}
                    initial={false}
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative z-10 h-[21px] w-[21px] transition-all duration-200",
                    isActive
                      ? "text-nada-accent drop-shadow-[0_0_8px_rgba(30,215,130,0.7)]"
                      : "text-nada-secondary/45"
                  )}
                  strokeWidth={isActive ? 2.5 : 1.9}
                />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute -top-0.5 right-2 z-20 flex h-4 min-w-4 items-center justify-center rounded-full border border-nada-bg px-0.5 text-[9px] font-black"
                    style={{
                      background:
                        "linear-gradient(135deg, rgb(var(--nada-accent)), rgb(var(--nada-violet)))",
                      color: "#051A11",
                      boxShadow: "0 0 12px rgba(30,215,130,0.75)"
                    }}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </motion.span>
                )}
              </div>
              <span
                className={cn(
                  "text-[9.5px] font-bold leading-none transition-all duration-200 tracking-wide",
                  isActive ? "text-nada-accent" : "text-nada-secondary/45"
                )}
              >
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
  displayName,
  activeTab = "chats",
  onComposeClick
}: {
  displayName: string;
  activeTab?: string;
  onCameraClick: () => void;
  onMoreClick: () => void;
  onComposeClick?: () => void;
}) => {
  const greeting = activeTab === "chats" ? `Welcome back` : TAB_TITLES[activeTab] ?? "NADA";
  const subtitle = activeTab === "chats" ? displayName || "Ghost" : null;

  return (
    <header
      className="sticky top-0 z-header flex items-center justify-between gap-3 border-b border-nada-border/[0.04] px-5 pb-5 pt-[max(env(safe-area-inset-top),20px)] pl-safe-area pr-safe-area"
      style={{
        background: "linear-gradient(to bottom, rgba(8,9,11,0.98), rgba(8,9,11,0.78))",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)"
      }}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <NadaLogoMark size={40} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-nada-accent/80">
            {greeting}
          </span>
          <span className="mt-1 truncate text-[19px] font-extrabold tracking-tight text-nada-primary">
            {subtitle ?? TAB_TITLES[activeTab] ?? "Messages"}
          </span>
        </div>
      </div>

      <motion.button
        onClick={onComposeClick}
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-nada-border/[0.08] transition-all duration-150 hover:border-nada-accent/45"
        style={{
          background:
            "linear-gradient(135deg, rgb(var(--nada-surface-elevated) / 0.85), rgb(var(--nada-surface) / 0.85))",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.30)"
        }}
        aria-label="New conversation"
      >
        <Plus className="h-[19px] w-[19px] text-nada-primary/85" strokeWidth={2.4} />
      </motion.button>
    </header>
  );
};

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
  headerProps,
  syncStatus
}: {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  unreadTotal: number;
  onComposeClick: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  syncStatus?: "connected" | "syncing" | "offline";
  headerProps: {
    displayName: string;
    activeTab?: string;
    onCameraClick: () => void;
    onMoreClick: () => void;
  };
}) => (
  <div className="relative flex h-full flex-col overflow-x-hidden overflow-y-hidden nada-chat-bg">
    <MobileHeader
      {...headerProps}
      activeTab={headerProps.activeTab ?? activeTab}
      onComposeClick={onComposeClick}
    />
    <SearchBar value={searchQuery} onChange={onSearchChange} />
    {syncStatus && <SyncIndicator status={syncStatus} />}

    <div className="flex-1 overflow-y-auto overflow-x-hidden pb-[84px]">
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
      <div
        className="absolute inset-0 rounded-[28px] opacity-60 blur-2xl animate-logo-glow"
        style={{
          background:
            "radial-gradient(circle, rgba(30,215,130,0.72) 0%, transparent 70%)"
        }}
      />
      <div
        className="relative flex h-[96px] w-[96px] items-center justify-center rounded-[28px] border border-nada-border/[0.08]"
        style={{
          background:
            "linear-gradient(155deg, rgb(var(--nada-surface-elevated)) 0%, rgb(var(--nada-surface-3)) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 40px rgba(0,0,0,0.42)"
        }}
      >
        <MessageCircle className="h-9 w-9 text-nada-accent" strokeWidth={1.8} />
      </div>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.24em] text-nada-accent/80">
        Silence on this side
      </p>
      <h3 className="mb-2 text-[20px] font-extrabold tracking-tight text-nada-primary">
        No ghosts yet
      </h3>
      <p className="mb-7 max-w-[260px] text-[13.5px] leading-relaxed text-nada-secondary/70">
        Share an invite link or QR code to start an anonymous, end-to-end
        encrypted conversation.
      </p>
      <motion.button
        onClick={onAdd}
        whileTap={{ scale: 0.96 }}
        whileHover={{ y: -1 }}
        className="nada-btn-gold inline-flex h-12 items-center justify-center rounded-full px-7 text-[14px]"
      >
        Invite a ghost
      </motion.button>
    </motion.div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Chat List Skeleton
   ───────────────────────────────────────────────────────────── */
export const ChatListSkeleton = () => (
  <div className="space-y-0 py-1">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div
        key={i}
        className="mx-2 my-1 flex items-center gap-3 rounded-2xl px-3 py-3"
      >
        <div className="h-[54px] w-[54px] shrink-0 rounded-[18px] nada-skeleton" />
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
   Profile Header — "Ghost ID" card style
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
      <div
        className="absolute inset-0 rounded-[36px] opacity-55 blur-3xl animate-logo-glow"
        style={{
          background:
            "radial-gradient(circle, rgba(30,215,130,0.85) 0%, transparent 70%)"
        }}
      />
      <div
        className="relative flex h-[112px] w-[112px] items-center justify-center overflow-hidden rounded-[36px] font-semibold"
        style={{
          background:
            "linear-gradient(155deg, rgb(var(--nada-surface-3)), rgb(var(--nada-surface-elevated)))",
          boxShadow:
            "0 0 0 2px rgb(var(--nada-bg)), 0 0 0 5px rgb(var(--nada-accent) / 0.45), 0 16px 52px rgba(30,215,130,0.32)"
        }}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[38px] font-extrabold text-nada-accent/85">
            {initials}
          </span>
        )}
      </div>
    </motion.div>

    <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.24em] text-nada-accent/80">
      Ghost ID
    </p>
    <h2 className="text-[24px] font-extrabold tracking-tight text-nada-primary">
      {name}
    </h2>
    {username && (
      <p className="mt-1 text-[13px] font-mono text-nada-secondary/65">
        {username}
      </p>
    )}
    {bio && (
      <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-nada-secondary/80">
        {bio}
      </p>
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
    whileHover={{ x: 2 }}
    className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors duration-150 hover:bg-nada-surface-elevated/45 active:bg-nada-surface-elevated/60"
  >
    {Icon && (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
        style={{
          background: danger
            ? "linear-gradient(135deg, rgb(255 89 103 / 0.18), rgb(255 89 103 / 0.08))"
            : "linear-gradient(135deg, rgb(var(--nada-accent) / 0.20), rgb(var(--nada-violet) / 0.10))",
          boxShadow:
            "inset 0 0 0 1px rgb(var(--nada-border) / 0.08), 0 4px 12px rgba(0,0,0,0.25)"
        }}
      >
        <Icon
          className={cn("h-[18px] w-[18px]", danger ? "text-nada-danger" : "text-nada-accent")}
          strokeWidth={2.2}
        />
      </div>
    )}
    <span
      className={cn(
        "flex-1 text-left text-[14.5px] font-semibold tracking-tight",
        danger ? "text-nada-danger" : "text-nada-primary"
      )}
    >
      {label}
    </span>
    {value && (
      <span className="mr-1.5 text-[12.5px] font-medium text-nada-secondary/55">
        {value}
      </span>
    )}
    <ChevronRight className="h-3.5 w-3.5 text-nada-secondary/30" />
  </motion.button>
);
