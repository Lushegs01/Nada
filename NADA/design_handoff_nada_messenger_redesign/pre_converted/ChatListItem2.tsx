"use client";

/* ─────────────────────────────────────────────────────────────
   ChatListItem — drop-in replacement.
   Same prop signature as the one in NadaMobileUI.tsx; new visual
   treatment: 3px accent left rail on active, 42px round avatar
   with online dot, verified shield + mute icons, accent unread
   badge. Mobile swipe-to-archive layer preserved.
   ───────────────────────────────────────────────────────────── */

import { motion } from "framer-motion";
import {
  Archive,
  Check,
  CheckCheck,
  Pin,
  ShieldCheck,
  Trash2,
  VolumeX
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@nada/ui";

/* Local mq hook — mirrors the private one inside NadaMobileUI.tsx so this
   file is self-contained and can replace the existing export without
   importing internals. */
function useIsDesktop(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 768px)");
    const apply = () => setV(mql.matches);
    apply();
    mql.addEventListener?.("change", apply);
    return () => mql.removeEventListener?.("change", apply);
  }, []);
  return v;
}

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
}) => {
  const isDesktop = useIsDesktop();
  const dragEnabled = !isDesktop && Boolean(onArchive || onDelete);
  const hasUnread = unreadCount > 0;

  return (
    <div
      className={cn(
        "group/row relative mx-1.5 my-0.5 overflow-hidden rounded-[12px]",
        isSelected && "nada-row-active"
      )}
    >
      {/* Mobile swipe action layers — kept identical to the original */}
      {onArchive && !isDesktop && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 flex w-28 items-center justify-start pl-5"
          style={{ background: "rgb(var(--nada-accent) / 0.20)", color: "rgb(var(--nada-accent))" }}
        >
          <div className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
            <Archive size={18} />
            {archiveLabel}
          </div>
        </div>
      )}
      {onDelete && !isDesktop && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-28 items-center justify-end bg-red-500/20 pr-5 text-red-300">
          <div className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
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
        whileTap={{ scale: 0.995 }}
        type="button"
        className={cn(
          "group relative z-10 flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors tap-highlight-none",
          !isSelected && "hover:bg-white/[0.025]"
        )}
        style={{ background: isSelected ? "transparent" : "transparent" }}
      >
        {/* Avatar — 42px round, online dot bottom-right */}
        <div className="relative shrink-0">
          <div
            className="flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-full font-semibold"
            style={{
              background: "linear-gradient(135deg, rgb(var(--nada-surface-3)), rgb(var(--nada-surface-elevated)))",
              boxShadow: "inset 0 0 0 1px rgb(var(--nada-border) / 0.10)",
              color: hasUnread ? "rgb(var(--nada-accent))" : "rgb(var(--nada-primary) / 0.85)",
              fontSize: 14,
              letterSpacing: "0.02em"
            }}
          >
            {avatar ? (
              <img src={avatar} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="font-bold">{initials}</span>
            )}
          </div>
          {isOnline && (
            <span
              className="absolute bottom-0 right-0 block h-[10px] w-[10px] rounded-full"
              style={{
                background: "rgb(var(--nada-accent))",
                boxShadow: "0 0 0 2px rgb(var(--nada-bg)), 0 0 10px rgb(var(--nada-accent) / 0.65)"
              }}
            />
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "truncate text-[14px]",
                  hasUnread ? "font-bold text-nada-primary" : "font-semibold text-nada-primary/95"
                )}
                style={{ letterSpacing: "-0.005em" }}
              >
                {name}
              </span>
              {/* verified-key shield — always shown; this UI assumes verified peers */}
              <ShieldCheck
                size={11}
                strokeWidth={2.2}
                className="shrink-0"
                style={{ color: "rgb(var(--nada-accent))" }}
                aria-label="Verified key"
              />
              {isMuted && (
                <VolumeX
                  size={11}
                  className="shrink-0 text-nada-secondary/45"
                  aria-label="Muted"
                />
              )}
              {isPinned && (
                <Pin
                  size={11}
                  className="shrink-0 -rotate-45"
                  style={{ color: "rgb(var(--nada-accent) / 0.7)" }}
                  aria-label="Pinned"
                />
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-[11px] font-mono",
                hasUnread ? "text-nada-accent" : "text-nada-secondary/50"
              )}
            >
              {timestamp}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {status && (
                <span
                  className="shrink-0"
                  style={{
                    color:
                      status === "read"
                        ? "rgb(var(--nada-accent))"
                        : "rgb(var(--nada-secondary) / 0.45)"
                  }}
                >
                  {status === "sent" ? <Check size={12} /> : <CheckCheck size={12} />}
                </span>
              )}
              <p
                className={cn(
                  "truncate text-[12.5px] leading-snug",
                  hasUnread
                    ? "font-medium text-nada-primary/85"
                    : "text-nada-secondary/60"
                )}
              >
                {preview}
              </p>
            </div>

            {hasUnread && (
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-extrabold"
                style={{
                  background: isMuted
                    ? "rgb(var(--nada-secondary) / 0.35)"
                    : "rgb(var(--nada-accent))",
                  color: isMuted ? "rgb(var(--nada-bg))" : "#051A11",
                  boxShadow: isMuted ? "none" : "0 2px 12px rgb(var(--nada-accent) / 0.55)",
                  letterSpacing: "-0.02em"
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            )}
          </div>
        </div>
      </motion.button>

      {/* Desktop hover actions — Archive / Delete on right edge */}
      {isDesktop && (onArchive || onDelete) && (
        <div className="pointer-events-none absolute inset-y-0 right-2 z-20 hidden items-center gap-1 opacity-0 transition-opacity duration-150 md:flex group-hover/row:pointer-events-auto group-hover/row:opacity-100">
          {onArchive && (
            <button
              aria-label={archiveLabel}
              title={archiveLabel}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              className="grid h-7 w-7 place-items-center rounded-full text-nada-secondary transition-colors hover:text-nada-accent"
              style={{
                background: "rgb(var(--nada-surface-elevated) / 0.95)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)"
              }}
            >
              <Archive size={13} strokeWidth={2.2} />
            </button>
          )}
          {onDelete && (
            <button
              aria-label={deleteLabel}
              title={deleteLabel}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="grid h-7 w-7 place-items-center rounded-full text-nada-secondary transition-colors hover:text-red-300"
              style={{
                background: "rgb(var(--nada-surface-elevated) / 0.95)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)"
              }}
            >
              <Trash2 size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
