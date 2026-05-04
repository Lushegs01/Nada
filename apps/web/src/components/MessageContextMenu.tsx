"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@nada/ui";

export interface ContextMenuAction {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface MessageContextMenuProps {
  open: boolean;
  // Anchor point in viewport coordinates (e.g. cursor position or touch point).
  position: { x: number; y: number } | null;
  // Direction of the bubble — used to bias menu placement to the bubble side.
  origin?: "left" | "right" | undefined;
  reactions?: string[];
  onPickReaction?: (emoji: string) => void;
  actions: ContextMenuAction[];
  onClose: () => void;
}

const MENU_WIDTH = 232;
const MENU_MARGIN = 12;
const REACTIONS_DEFAULT = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function MessageContextMenu({
  open,
  position,
  origin = "left",
  reactions = REACTIONS_DEFAULT,
  onPickReaction,
  actions,
  onClose
}: MessageContextMenuProps): JSX.Element | null {
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [resolved, setResolved] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Compute clamped placement once we know the rendered menu size.
  useLayoutEffect(() => {
    if (!open || !position) {
      setResolved(null);
      return;
    }
    const el = menuRef.current;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 768;
    const width = el?.offsetWidth ?? MENU_WIDTH;
    const height = el?.offsetHeight ?? 280;

    let left = origin === "right" ? position.x - width : position.x;
    let top = position.y;

    // Clamp horizontally.
    if (left + width + MENU_MARGIN > vw) left = vw - width - MENU_MARGIN;
    if (left < MENU_MARGIN) left = MENU_MARGIN;

    // If it would overflow the bottom, flip above the anchor.
    if (top + height + MENU_MARGIN > vh) {
      top = position.y - height;
    }
    if (top < MENU_MARGIN) top = MENU_MARGIN;

    setResolved({ left, top });
  }, [open, position, origin, actions.length, reactions.length]);

  const transformOrigin = useMemo(() => {
    if (!position || !resolved) return "top left";
    const fromLeft = position.x - resolved.left;
    const fromTop = position.y - resolved.top;
    return `${Math.max(0, Math.min(MENU_WIDTH, fromLeft))}px ${Math.max(0, fromTop)}px`;
  }, [position, resolved]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && position ? (
        <motion.div
          key="ctx-backdrop"
          className="fixed inset-0 z-[800]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
          style={{ background: "rgba(6, 8, 18, 0.42)", backdropFilter: "blur(2px)" }}
        >
          <motion.div
            key="ctx-menu"
            ref={menuRef}
            role="menu"
            aria-label="Message actions"
            className={cn(
              "nada-context-menu absolute flex flex-col overflow-hidden",
              resolved == null && "opacity-0 pointer-events-none"
            )}
            style={{
              width: MENU_WIDTH,
              left: resolved?.left ?? position.x,
              top: resolved?.top ?? position.y,
              transformOrigin
            }}
            initial={{ opacity: 0, scale: 0.86, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -2 }}
            transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.6 }}
            onClick={(e) => e.stopPropagation()}
          >
            {onPickReaction ? (
              <div className="nada-context-menu-reactions">
                {reactions.map((emoji, i) => (
                  <motion.button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    aria-label={`React with ${emoji}`}
                    className="nada-context-menu-reaction"
                    initial={{ opacity: 0, scale: 0.4, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      delay: 0.04 + i * 0.025,
                      type: "spring",
                      stiffness: 520,
                      damping: 24
                    }}
                    whileHover={{ scale: 1.22, y: -2 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      onPickReaction(emoji);
                      onClose();
                    }}
                  >
                    <span aria-hidden>{emoji}</span>
                  </motion.button>
                ))}
              </div>
            ) : null}
            <div className="nada-context-menu-actions">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  className={cn(
                    "nada-context-menu-item",
                    action.destructive && "nada-context-menu-item-danger",
                    action.disabled && "opacity-40 cursor-not-allowed"
                  )}
                  onClick={() => {
                    if (action.disabled) return;
                    action.onSelect();
                    onClose();
                  }}
                >
                  <span className="nada-context-menu-icon" aria-hidden>
                    {action.icon}
                  </span>
                  <span className="flex-1 text-left">{action.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
