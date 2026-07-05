"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Users, Archive, Trash2, Pin, Check, CheckCheck } from "lucide-react";
import { IdentityOrb } from "@nada/ui";

/* Detect desktop so mobile gets swipe gestures, desktop gets hover buttons */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

/* ─────────────────────────────────────────────────────────────
   ChatListItem — single row in the sidebar chat list.
   48 px avatar · online dot · group badge · unread badge ·
   subtle tap scale via framer-motion · memoised for perf.
   ───────────────────────────────────────────────────────────── */

interface ChatListItemProps {
  avatar?: string | undefined;
  isDesktop?: boolean | undefined;
  name: string;
  preview: string;
  status?: "sent" | "delivered" | "read" | undefined;
  timestamp: string;
  unreadCount: number;
  isMuted?: boolean | undefined;
  isPinned?: boolean | undefined;
  isOnline?: boolean | undefined;
  isSelected?: boolean | undefined;
  archiveLabel?: string | undefined;
  deleteLabel?: string | undefined;
  onArchive?: (() => void) | undefined;
  onClick: () => void;
  onDelete?: (() => void) | undefined;
  initials: string;
  isGroup?: boolean | undefined;
}

export const ChatListItem = memo(function ChatListItem({
  avatar,
  isDesktop: isDesktopProp,
  name,
  preview,
  status,
  timestamp,
  unreadCount,
  isMuted = false,
  isPinned = false,
  isOnline = false,
  isSelected = false,
  archiveLabel = "Archive",
  deleteLabel = "Delete",
  onArchive,
  onClick,
  onDelete,
  isGroup = false,
}: ChatListItemProps) {
  const detectedDesktop = useIsDesktop();
  const isDesktop = isDesktopProp ?? detectedDesktop;
  const hasUnread = unreadCount > 0;
  const dragEnabled = !isDesktop && Boolean(onArchive || onDelete);

  // Drag position drives the swipe-action reveal — at rest (x=0) the
  // Archive/Delete backgrounds are fully transparent, so they only appear
  // while the user is actually swiping.
  const x = useMotionValue(0);
  const archiveOpacity = useTransform(x, [0, 24, 96], [0, 0.9, 1]);
  const deleteOpacity = useTransform(x, [-96, -24, 0], [1, 0.9, 0]);
  const didDragRef = useRef(false);
  const lastOpenRef = useRef(0);

  // Opening is handled via framer's onTap (reliable alongside drag, unlike a
  // raw onClick which the drag gesture swallows on touch). Guarded so a swipe
  // never counts as a tap, and de-duped against double-fire.
  const open = useCallback(() => {
    if (didDragRef.current) return;
    const now = Date.now();
    if (now - lastOpenRef.current < 400) return;
    lastOpenRef.current = now;
    onClick();
  }, [onClick]);

  /* Build root className */
  const rootClass = [
    "nada-chat-item w-full text-left",
    isSelected && "active",
    hasUnread && "unread",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative group/row w-full overflow-hidden">
      {/* Swipe-left → Archive (accent) — mobile only, revealed only while swiping */}
      {onArchive && dragEnabled && (
        <motion.div
          style={{ opacity: archiveOpacity, background: "var(--n-accent-gradient-subtle)" }}
          className="pointer-events-none absolute inset-y-0 left-0 flex w-28 items-center justify-start pl-5 text-n-accent"
        >
          <div className="flex flex-col items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]">
            <Archive size={18} />
            {archiveLabel}
          </div>
        </motion.div>
      )}
      {/* Swipe-right → Delete (danger) — mobile only, revealed only while swiping */}
      {onDelete && dragEnabled && (
        <motion.div
          style={{ opacity: deleteOpacity }}
          className="pointer-events-none absolute inset-y-0 right-0 flex w-28 items-center justify-end bg-n-danger/15 pr-5 text-n-danger"
        >
          <div className="flex flex-col items-center gap-1 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]">
            <Trash2 size={18} />
            {deleteLabel}
          </div>
        </motion.div>
      )}
      <motion.button
        type="button"
        className={rootClass}
        drag={dragEnabled ? "x" : false}
        dragConstraints={{ left: onDelete ? -112 : 0, right: onArchive ? 112 : 0 }}
        dragDirectionLock
        dragElastic={0.12}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 500, bounceDamping: 40 }}
        onDragStart={() => { didDragRef.current = true; }}
        onDragEnd={(_event, info) => {
          if (info.offset.x > 88) onArchive?.();
          else if (info.offset.x < -88) onDelete?.();
          // clear after the click/tap has had a chance to be suppressed
          requestAnimationFrame(() => requestAnimationFrame(() => { didDragRef.current = false; }));
        }}
        onTap={() => open()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
        }}
        whileTap={{ scale: 0.99 }}
        style={{ x, background: isSelected ? "rgb(var(--n-s3))" : "rgb(var(--n-base))" }}
        aria-selected={isSelected}
        aria-label={`Chat with ${name}`}
      >
        {/* ── Identity orb ──────────────────────────────── */}
        <div className="nada-avatar">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              draggable={false}
              className="nada-avatar-img h-full w-full object-cover"
            />
          ) : (
            <IdentityOrb seed={name} size="lg" label={name} className="!h-[48px] !w-[48px]" />
          )}

          {isOnline && (
            <span className="nada-online-dot" aria-label="Online" />
          )}

          {isGroup && (
            <span className="nada-group-indicator absolute -bottom-0.5 -left-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-n-base bg-n-s3 text-n-accent" aria-label="Group chat">
              <Users size={9} strokeWidth={2.5} />
            </span>
          )}
        </div>

        {/* ── Content ───────────────────────────────────── */}
        <div className="nada-chat-content">
          {/* Top row: name + timestamp */}
          <div className="nada-chat-row flex items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
              <span className="nada-chat-name truncate">{name}</span>
              {isPinned && (
                <Pin size={12} className="text-nada-accent/70 shrink-0 transform -rotate-45" />
              )}
            </div>
            <span className="nada-chat-time shrink-0 transition-opacity duration-150 md:group-hover/row:opacity-0">
              {timestamp}
            </span>
          </div>

          {/* Bottom row: preview + unread badge */}
          <div className="nada-chat-row flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {status && (
                <span className={`shrink-0 ${status === "read" ? "text-nada-accent" : "text-nada-secondary/40"}`}>
                  {status === "sent" ? <Check size={13} /> : <CheckCheck size={13} />}
                </span>
              )}
              <span className="nada-chat-preview truncate">{preview}</span>
            </div>

            {hasUnread && (
              <span
                className={`nada-unread-badge${isMuted ? " muted" : ""}`}
                aria-label={`${unreadCount} unread message${unreadCount !== 1 ? "s" : ""}`}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
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
                background: "rgb(var(--n-s3) / 0.95)",
                border: "1px solid rgb(var(--n-edge) / 0.08)",
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
              className="grid h-7 w-7 place-items-center rounded-full text-nada-secondary transition-colors hover:text-red-400"
              style={{
                background: "rgb(var(--n-s3) / 0.95)",
                border: "1px solid rgb(var(--n-edge) / 0.08)",
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
});
