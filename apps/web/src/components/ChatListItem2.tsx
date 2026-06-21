"use client";

import { memo, useCallback } from "react";
import { motion } from "framer-motion";
import { Users, Archive, Trash2, Pin, Check, CheckCheck, ShieldCheck } from "lucide-react";

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
  isDesktop = false,
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
  initials,
  isGroup = false,
}: ChatListItemProps) {
  const hasUnread = unreadCount > 0;

  const handleClick = useCallback(() => {
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
    <div className="relative group/row w-full">
      <motion.button
        type="button"
        className={rootClass}
        onClick={handleClick}
        whileTap={{ scale: 0.98 }}
        aria-selected={isSelected}
        aria-label={`Chat with ${name}`}
      >
        {/* ── Avatar ────────────────────────────────────── */}
        <div className="nada-avatar">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              draggable={false}
              className="nada-avatar-img"
            />
          ) : (
            <span className="nada-avatar-initials">{initials}</span>
          )}

          {isOnline && (
            <span className="nada-online-dot" aria-label="Online" />
          )}

          {isGroup && (
            <span className="nada-group-indicator" aria-label="Group chat">
              <Users size={10} strokeWidth={2.5} />
            </span>
          )}
        </div>

        {/* ── Content ───────────────────────────────────── */}
        <div className="nada-chat-content">
          {/* Top row: name + timestamp */}
          <div className="nada-chat-row flex items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
              <span className="nada-chat-name truncate">{name}</span>
              <ShieldCheck size={11} strokeWidth={2.2} className="text-nada-accent shrink-0" aria-label="Verified key" />
              {isPinned && (
                <Pin size={12} className="text-nada-accent/70 shrink-0 transform -rotate-45" />
              )}
            </div>
            <span className="nada-chat-time shrink-0">{timestamp}</span>
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
                background: "var(--nada-surface-elevated)",
                border: "1px solid var(--nada-border)",
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
                background: "var(--nada-surface-elevated)",
                border: "1px solid var(--nada-border)",
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
