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
  Waves,
  X
} from "lucide-react";
import { cn, IdentityOrb } from "@nada/ui";
import { AnimatePresence, motion } from "framer-motion";

/* Vantage spring presets */
const SPRING = {
  gentle: { type: "spring" as const, stiffness: 200, damping: 26 },
  default: { type: "spring" as const, stiffness: 300, damping: 30 },
  snappy: { type: "spring" as const, stiffness: 500, damping: 35 },
  bouncy: { type: "spring" as const, stiffness: 400, damping: 18 },
  modal: { type: "spring" as const, stiffness: 350, damping: 32 }
};

/* useIsDesktop — true at the md: breakpoint (768px) and above */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

/* Shared tab set — single source of truth for both navigators */
const NAV_TABS = [
  { id: "chats", label: "Chats", icon: MessageCircle },
  { id: "status", label: "Status", icon: CircleDashed },
  { id: "groups", label: "Groups", icon: Users },
  { id: "whispers", label: "Whispers", icon: Waves },
  { id: "settings", label: "Settings", icon: Settings }
] as const;

/* ─────────────────────────────────────────────────────────────
   SearchBar — floating glass pill
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
      <Search className="pointer-events-none absolute left-4 h-[16px] w-[16px] text-n-tx2/70" strokeWidth={2.2} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-full border border-n-edge/[0.06] pl-11 pr-4 text-[14px] font-medium tracking-[-0.006em] text-n-tx1 outline-none placeholder:text-n-tx3 transition-all duration-200 focus:border-n-accent/40 focus:ring-4 focus:ring-n-accent-start/10"
        style={{
          background: "rgb(var(--n-s3) / 0.72)",
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)"
        }}
      />
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   SyncIndicator — connection status, monospace protocol text
   ───────────────────────────────────────────────────────────── */
export const SyncIndicator = ({
  status
}: {
  status: "connected" | "syncing" | "offline";
}) => {
  const config = {
    connected: {
      text: "SECURE CONNECTION ACTIVE",
      color: "text-n-success",
      dotClass: "bg-n-success shadow-[0_0_8px_rgb(var(--n-success)/0.7)]",
      spinning: false
    },
    syncing: {
      text: "SYNCING SECURELY",
      color: "text-n-tx2",
      dotClass: "bg-n-accent",
      spinning: true
    },
    offline: {
      text: "OFFLINE MODE ACTIVE",
      color: "text-n-warning",
      dotClass: "bg-n-warning",
      spinning: false
    }
  }[status];

  return (
    <div className={cn(
      "flex items-center justify-center gap-1.5 px-5 pb-2 pt-0.5 font-mono text-[9.5px] font-medium tracking-[0.08em]",
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
    transition={SPRING.snappy}
    className="group mx-2 my-1 flex w-[calc(100%-16px)] items-center justify-between rounded-2xl px-3 py-3 transition-colors duration-150 hover:bg-n-s2/55"
  >
    <div className="flex items-center gap-3">
      <div
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border border-n-edge/[0.06] transition-colors duration-150 group-hover:border-n-accent/30"
        style={{ background: "rgb(var(--n-s2) / 0.78)" }}
      >
        <Archive className="h-[17px] w-[17px] text-n-tx2/70" />
      </div>
      <span className="text-[14px] font-semibold tracking-[-0.008em] text-n-tx1/90">Archived</span>
    </div>
    <div className="flex items-center gap-2">
      {count > 0 && (
        <span className="nada-unread-badge">{count}</span>
      )}
      <ChevronRight className="h-3.5 w-3.5 text-n-tx3" />
    </div>
  </motion.button>
);

/* ─────────────────────────────────────────────────────────────
   ChatListItem — IdentityOrb + swipe (mobile) / hover actions (desktop)
   ───────────────────────────────────────────────────────────── */
export const ChatListItem = ({
  name,
  preview,
  timestamp,
  unreadCount,
  avatar,
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
}) => {
  const isDesktop = useIsDesktop();
  const dragEnabled = !isDesktop && Boolean(onArchive || onDelete);
  return (
  <div className={cn(
    "group/row relative mx-2 my-1 overflow-hidden rounded-2xl"
  )}>
    {/* Swipe-left → Archive (accent) — mobile only */}
    {onArchive && !isDesktop && (
      <div className="pointer-events-none absolute inset-y-0 left-0 flex w-28 items-center justify-start rounded-2xl pl-5 text-n-accent"
        style={{ background: "var(--n-accent-gradient-subtle)" }}
      >
        <div className="flex flex-col items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]">
          <Archive size={18} />
          {archiveLabel}
        </div>
      </div>
    )}
    {/* Swipe-right → Delete (danger) — mobile only */}
    {onDelete && !isDesktop && (
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-28 items-center justify-end rounded-2xl bg-n-danger/15 pr-5 text-n-danger">
        <div className="flex flex-col items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]">
          <Trash2 size={18} />
          {deleteLabel}
        </div>
      </div>
    )}
    <motion.button
      drag={dragEnabled ? "x" : false}
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
        !isSelected && "hover:bg-n-s2/45",
        isSelected && "nada-chat-item-active"
      )}
      style={{
        background: isSelected ? "rgb(var(--n-s3))" : "rgb(var(--n-base))",
        touchAction: "pan-y"
      }}
    >
      {/* Identity orb — living, seeded from the ghost's name */}
      <div className="relative shrink-0">
        {avatar ? (
          <div
            className={cn(
              "h-[54px] w-[54px] overflow-hidden rounded-[18px] transition-all duration-200",
              unreadCount > 0 ? "ring-2 ring-n-accent/55" : "ring-1 ring-n-edge/[0.08] group-hover:ring-n-accent/30"
            )}
          >
            <img src={avatar} alt={name} className="h-full w-full object-cover" />
          </div>
        ) : (
          <IdentityOrb
            seed={name}
            size="lg"
            label={name}
            className={cn(unreadCount > 0 && "ring-2 ring-n-accent/50 ring-offset-2 ring-offset-transparent")}
          />
        )}
        {isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-n-base animate-breathe"
            style={{
              background: "rgb(var(--n-success))",
              boxShadow: "0 0 10px rgb(var(--n-success) / 0.7)"
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <h3 className={cn(
            "truncate text-[15px] tracking-[-0.012em]",
            unreadCount > 0 ? "font-bold text-n-tx1" : "font-semibold text-n-tx1/90"
          )}>
            {name}
          </h3>
          <span className={cn(
            "shrink-0 font-mono text-[10.5px] font-medium tabular-nums transition-opacity duration-150 md:group-hover/row:opacity-0",
            unreadCount > 0 ? "text-n-accent" : "text-n-tx3"
          )}>
            {timestamp}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {status && (
              <span className={cn(
                "shrink-0",
                status === "read" ? "text-n-accent-end" : "text-n-tx3"
              )}>
                {status === "sent" ? <Check size={12} /> : <CheckCheck size={12} />}
              </span>
            )}
            <p className={cn(
              "truncate text-[12.5px] leading-snug tracking-[-0.003em]",
              unreadCount > 0 ? "font-medium text-n-tx1/85" : "text-n-tx3"
            )}>
              {preview}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {isMuted && <VolumeX size={11} className="text-n-tx3/70" />}
            {isPinned && <Pin size={11} className="-rotate-45 text-n-accent/70" />}
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING.snappy}
                className="nada-unread-badge"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            )}
          </div>
        </div>
      </div>
    </motion.button>

    {/* Desktop hover actions */}
    {isDesktop && (onArchive || onDelete) && (
      <div className="pointer-events-none absolute inset-y-0 right-2 z-20 hidden items-center gap-1 opacity-0 transition-opacity duration-150 md:flex group-hover/row:pointer-events-auto group-hover/row:opacity-100">
        {onArchive && (
          <button
            aria-label={archiveLabel}
            title={archiveLabel}
            type="button"
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            className="grid h-8 w-8 place-items-center rounded-full bg-n-s3/95 text-n-tx2 transition-colors hover:bg-n-accent/20 hover:text-n-accent"
          >
            <Archive size={14} strokeWidth={2.2} />
          </button>
        )}
        {onDelete && (
          <button
            aria-label={deleteLabel}
            title={deleteLabel}
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="grid h-8 w-8 place-items-center rounded-full bg-n-s3/95 text-n-tx2 transition-colors hover:bg-n-danger/20 hover:text-n-danger"
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
        )}
      </div>
    )}
  </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   BottomNavigation → Floating Orb Navigator (signature #5)
   A single identity orb at the bottom-right expands into a radial
   menu. The orb IS the user's own identity (seeded from selfSeed).
   Prop interface preserved; selfSeed is an optional addition.
   ───────────────────────────────────────────────────────────── */
export const BottomNavigation = ({
  activeTab,
  onTabChange,
  unreadCount = 0,
  selfSeed = "nada-you"
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  unreadCount?: number;
  selfSeed?: string;
}) => {
  const [open, setOpen] = React.useState(false);

  const select = (tab: string) => {
    onTabChange(tab);
    setOpen(false);
  };

  return (
    <div className="md:hidden">
      {/* Scrim */}
      <AnimatePresence>
        {open && (
          <motion.button
            aria-label="Close navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
            className="n-orb-nav-scrim"
          />
        )}
      </AnimatePresence>

      <div className="n-orb-nav flex flex-col items-end gap-2.5">
        {/* Radial menu items — fan up from the orb */}
        <AnimatePresence>
          {open && (
            <motion.ul
              className="flex flex-col items-end gap-2.5"
              initial="closed"
              animate="open"
              exit="closed"
              variants={{
                open: { transition: { staggerChildren: 0.045, staggerDirection: -1 } },
                closed: { transition: { staggerChildren: 0.03, staggerDirection: 1 } }
              }}
            >
              {NAV_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const showBadge = tab.id === "chats" && unreadCount > 0;
                return (
                  <motion.li
                    key={tab.id}
                    variants={{
                      open: { opacity: 1, y: 0, scale: 1 },
                      closed: { opacity: 0, y: 16, scale: 0.85 }
                    }}
                    transition={SPRING.bouncy}
                  >
                    <button
                      type="button"
                      onClick={() => select(tab.id)}
                      className={cn("n-orb-nav-item tap-highlight-none", isActive && "active")}
                    >
                      <span className="grid h-6 w-6 place-items-center">
                        <Icon size={17} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-n-accent" : ""} />
                      </span>
                      <span>{tab.label}</span>
                      {showBadge && (
                        <span className="nada-unread-badge ml-1 !h-[18px] !min-w-[18px] text-[9px]">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>

        {/* The orb itself */}
        <motion.button
          type="button"
          aria-label={open ? "Close menu" : "Open navigation"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          whileTap={{ scale: 0.9 }}
          transition={SPRING.snappy}
          className="relative grid h-16 w-16 place-items-center rounded-full tap-highlight-none"
          style={{ pointerEvents: "auto" }}
        >
          {/* pulsing glow bed */}
          <span
            aria-hidden
            className="absolute inset-1 rounded-full opacity-70 blur-md animate-glow-pulse"
            style={{ background: "var(--n-accent-gradient)" }}
          />
          <IdentityOrb seed={selfSeed} size="lg" animate={!open} className="relative shadow-accent" />
          {/* center glyph swaps between menu / close */}
          <span className="absolute inset-0 grid place-items-center">
            <AnimatePresence mode="wait" initial={false}>
              {open ? (
                <motion.span
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={SPRING.snappy}
                >
                  <X size={20} strokeWidth={2.8} className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]" />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
          {/* unread ring on the orb when closed */}
          {!open && unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 z-10 grid h-5 min-w-5 place-items-center rounded-full border-2 border-n-base px-1 font-mono text-[9px] font-semibold text-white"
              style={{ background: "var(--n-accent-gradient)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </motion.button>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   DesktopNavRail — slim vertical icon rail (md+)
   ───────────────────────────────────────────────────────────── */
export const DesktopNavRail = ({
  activeTab,
  onTabChange,
  unreadCount = 0,
  onNewChat
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  unreadCount?: number;
  onNewChat?: () => void;
}) => {
  return (
    <nav
      className="hidden h-full w-[68px] shrink-0 flex-col items-center gap-1.5 border-r border-n-edge/[0.05] px-2 py-4 md:flex"
      style={{
        background: "linear-gradient(180deg, rgb(var(--n-s1) / 0.92), rgb(var(--n-base) / 0.96))"
      }}
    >
      <motion.button
        aria-label="Start a new conversation"
        className="mb-3 grid h-10 w-10 cursor-pointer place-items-center overflow-hidden rounded-[12px] nada-logo-aura focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-n-accent"
        onClick={onNewChat}
        title="New conversation"
        type="button"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
      >
        <img src="/logo.webp" alt="NADA" className="h-full w-full object-cover" />
      </motion.button>
      {NAV_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const badge = tab.id === "chats" ? unreadCount : 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            title={tab.label}
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative grid h-11 w-11 place-items-center rounded-xl transition-colors duration-150",
              isActive
                ? "bg-n-s3/80 text-n-accent"
                : "text-n-tx2/70 hover:bg-n-s2/55 hover:text-n-tx1"
            )}
          >
            {isActive && (
              <motion.span
                layoutId="rail-active-indicator"
                className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                style={{ background: "var(--n-accent-gradient-v)" }}
                transition={SPRING.snappy}
              />
            )}
            <Icon size={20} strokeWidth={isActive ? 2.4 : 1.9} />
            {badge > 0 && (
              <span className="nada-unread-badge absolute -right-0.5 -top-0.5 !h-4 !min-w-4 text-[9px]">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

/* ─────────────────────────────────────────────────────────────
   NADA Logo Mark
   ───────────────────────────────────────────────────────────── */
const NadaLogoMark = ({ size = 32 }: { size?: number }) => (
  <motion.div
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.94 }}
    transition={SPRING.snappy}
    className="flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[11px] nada-logo-aura"
    style={{ width: size, height: size }}
  >
    <img src="/logo.webp" alt="NADA" className="h-full w-full object-cover" />
  </motion.div>
);

/* ─────────────────────────────────────────────────────────────
   Mobile Header — frosted glass
   ───────────────────────────────────────────────────────────── */
const TAB_TITLES: Record<string, string> = {
  chats: "Messages",
  status: "Status",
  groups: "Groups",
  whispers: "Whispers",
  settings: "Settings"
};

export const MobileHeader = ({
  activeTab = "chats",
  onComposeClick,
  ghost = false
}: {
  activeTab?: string;
  onComposeClick?: () => void;
  ghost?: boolean;
}) => {
  const title = activeTab === "chats" ? "NADA" : TAB_TITLES[activeTab] ?? "NADA";

  return (
    <header
      className="sticky top-0 z-header flex items-center justify-between gap-3 border-b border-n-edge/[0.04] pb-5 pt-[max(env(safe-area-inset-top),20px)]"
      style={{
        background: "var(--n-s-glass)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        paddingLeft: "max(env(safe-area-inset-left), 24px)",
        paddingRight: "max(env(safe-area-inset-right), 20px)"
      }}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="md:hidden">
          <NadaLogoMark size={40} />
        </div>
        <span className={cn(
          "truncate text-[24px] font-extrabold tracking-[-0.02em]",
          title === "NADA" ? "text-white" : "text-n-tx1"
        )}>
          {title}
        </span>
        {ghost && <span className="n-ghost-badge n-ghost-reveal">Ghost Mode</span>}
      </div>

      <motion.button
        onClick={onComposeClick}
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
        transition={SPRING.snappy}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-n-edge/[0.08] transition-all duration-150 hover:border-n-accent/45"
        style={{
          background: "linear-gradient(135deg, rgb(var(--n-s2) / 0.85), rgb(var(--n-s1) / 0.85))",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.30)"
        }}
        aria-label="New conversation"
      >
        <Plus className="h-[19px] w-[19px] text-n-tx1/85" strokeWidth={2.4} />
      </motion.button>
    </header>
  );
};

/* ─────────────────────────────────────────────────────────────
   MobileChatsHome — main mobile shell
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
  syncStatus,
  selfSeed,
  ghost
}: {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  unreadTotal: number;
  onComposeClick: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  syncStatus?: "connected" | "syncing" | "offline";
  selfSeed?: string;
  ghost?: boolean;
  headerProps: {
    activeTab?: string;
  };
}) => (
  <div className="relative flex h-full flex-col overflow-x-hidden overflow-y-hidden nada-chat-bg">
    <MobileHeader
      activeTab={headerProps.activeTab ?? activeTab}
      onComposeClick={onComposeClick}
      ghost={ghost ?? false}
    />
    <SearchBar value={searchQuery} onChange={onSearchChange} />
    {syncStatus && <SyncIndicator status={syncStatus} />}

    <div className="flex-1 overflow-y-auto overflow-x-hidden pb-[104px]" style={{ overscrollBehavior: "contain" }}>
      {children}
    </div>

    <BottomNavigation
      activeTab={activeTab}
      onTabChange={onTabChange}
      unreadCount={unreadTotal}
      {...(selfSeed ? { selfSeed } : {})}
    />
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Empty Chat List State — IdentityOrb, not a generic icon
   ───────────────────────────────────────────────────────────── */
export const EmptyChatListState = ({ onAdd }: { onAdd: () => void }) => (
  <div className="flex flex-col items-center justify-center px-10 py-20 text-center">
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={SPRING.default}
      className="relative mb-7"
    >
      <div
        className="absolute inset-0 rounded-full opacity-50 blur-2xl animate-glow-pulse"
        style={{ background: "var(--n-accent-gradient)" }}
      />
      <IdentityOrb seed="nada-empty-invite" size="2xl" className="relative" />
    </motion.div>

    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-n-accent/80">
        Silence on this side
      </p>
      <h3 className="mb-2 text-[22px] font-extrabold tracking-[-0.02em] text-n-tx1">
        No ghosts yet
      </h3>
      <p className="mb-7 max-w-[260px] text-[13.5px] leading-relaxed text-n-tx2/80">
        Share an invite link or QR code to start an anonymous, end-to-end
        encrypted conversation.
      </p>
      <motion.button
        onClick={onAdd}
        whileTap={{ scale: 0.96 }}
        whileHover={{ y: -1 }}
        transition={SPRING.snappy}
        className="nada-btn nada-btn-primary inline-flex h-12 items-center justify-center rounded-full px-7 text-[14px]"
      >
        Invite a ghost
      </motion.button>
    </motion.div>
  </div>
);

/* ─────────────────────────────────────────────────────────────
   Chat List Skeleton — accent shimmer
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
   Profile Header — "Ghost ID" with the user's IdentityOrb
   ───────────────────────────────────────────────────────────── */
export const ProfileHeader = ({
  name,
  username,
  bio,
  avatar
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
      transition={SPRING.default}
      className="relative mb-5"
    >
      <div
        className="absolute inset-0 rounded-full opacity-45 blur-3xl animate-glow-pulse"
        style={{ background: "var(--n-accent-gradient)" }}
      />
      {avatar ? (
        <div
          className="relative h-[112px] w-[112px] overflow-hidden rounded-[36px]"
          style={{
            boxShadow: "0 0 0 2px rgb(var(--n-base)), 0 0 0 5px rgb(var(--n-accent) / 0.45), 0 16px 52px rgb(var(--n-accent) / 0.32)"
          }}
        >
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        </div>
      ) : (
        <IdentityOrb seed={username || name} size="2xl" label={name} className="relative h-[112px] w-[112px]" />
      )}
    </motion.div>

    <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-n-accent/80">
      Ghost ID
    </p>
    <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-n-tx1">
      {name}
    </h2>
    {username && (
      <p className="mt-1 font-mono text-[12.5px] text-n-tx2/70">
        {username}
      </p>
    )}
    {bio && (
      <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-n-tx2/80">
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
    transition={SPRING.snappy}
    className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors duration-150 hover:bg-n-s2/45 active:bg-n-s2/60"
  >
    {Icon && (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
        style={{
          background: danger
            ? "linear-gradient(135deg, rgb(var(--n-danger) / 0.18), rgb(var(--n-danger) / 0.08))"
            : "var(--n-accent-gradient-subtle)",
          boxShadow: "inset 0 0 0 1px rgb(var(--n-edge) / 0.06), 0 4px 12px rgba(0,0,0,0.25)"
        }}
      >
        <Icon
          className={cn("h-[18px] w-[18px]", danger ? "text-n-danger" : "text-n-accent")}
          strokeWidth={2.2}
        />
      </div>
    )}
    <span
      className={cn(
        "flex-1 text-left text-[14.5px] font-semibold tracking-[-0.008em]",
        danger ? "text-n-danger" : "text-n-tx1"
      )}
    >
      {label}
    </span>
    {value && (
      <span className="mr-1.5 text-[12.5px] font-medium text-n-tx2/60">
        {value}
      </span>
    )}
    <ChevronRight className="h-3.5 w-3.5 text-n-tx3" />
  </motion.button>
);
