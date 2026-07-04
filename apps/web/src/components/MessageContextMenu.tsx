"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Reply, Copy, Share2, Pin, Edit3, Trash2 } from "lucide-react";

interface MessageContextMenuProps {
  x: number;
  y: number;
  isOwn: boolean;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onReact?: (emoji: string) => void;
  onClose: () => void;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

const MENU_WIDTH = 200;
const MENU_ESTIMATED_HEIGHT = 320;
const VIEWPORT_PADDING = 8;

export function MessageContextMenu({
  x,
  y,
  isOwn,
  onReply,
  onCopy,
  onForward,
  onPin,
  onDelete,
  onEdit,
  onReact,
  onClose,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // Adjust position to prevent viewport overflow
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + MENU_WIDTH + VIEWPORT_PADDING > vw) {
      adjustedX = vw - MENU_WIDTH - VIEWPORT_PADDING;
    }
    if (adjustedX < VIEWPORT_PADDING) {
      adjustedX = VIEWPORT_PADDING;
    }

    if (y + MENU_ESTIMATED_HEIGHT + VIEWPORT_PADDING > vh) {
      adjustedY = vh - MENU_ESTIMATED_HEIGHT - VIEWPORT_PADDING;
    }
    if (adjustedY < VIEWPORT_PADDING) {
      adjustedY = VIEWPORT_PADDING;
    }

    setAdjustedPos({ x: adjustedX, y: adjustedY });
  }, [x, y]);

  // Click outside and Escape key handlers
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  const handleReaction = (emoji: string) => {
    onReact?.(emoji);
    onClose();
  };

  const handleItemClick = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="nada-context-menu nada-scale-in"
      role="menu"
      aria-label="Message actions"
      style={{
        position: "fixed",
        top: adjustedPos.y,
        left: adjustedPos.x,
        zIndex: 9999,
      }}
    >
      {/* Quick reaction bar */}
      {onReact && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "8px 8px 6px",
            }}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                aria-label={`React with ${emoji}`}
                onClick={() => handleReaction(emoji)}
                style={{
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  border: "none",
                  background: "transparent",
                  fontSize: 18,
                  cursor: "pointer",
                  transition: "transform 150ms ease, background 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.25)";
                  e.currentTarget.style.background =
                    "rgba(255, 255, 255, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="nada-dropdown-separator" role="separator" />
        </>
      )}

      {/* Menu items */}
      <div style={{ padding: "4px 0" }}>
        <button
          type="button"
          role="menuitem"
          className="nada-dropdown-item"
          onClick={() => handleItemClick(onReply)}
        >
          <Reply size={16} />
          <span>Reply</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="nada-dropdown-item"
          onClick={() => handleItemClick(onCopy)}
        >
          <Copy size={16} />
          <span>Copy</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="nada-dropdown-item"
          onClick={() => handleItemClick(onForward)}
        >
          <Share2 size={16} />
          <span>Forward</span>
        </button>

        <button
          type="button"
          role="menuitem"
          className="nada-dropdown-item"
          onClick={() => handleItemClick(onPin)}
        >
          <Pin size={16} />
          <span>Pin</span>
        </button>

        {isOwn && onEdit && (
          <button
            type="button"
            role="menuitem"
            className="nada-dropdown-item"
            onClick={() => handleItemClick(onEdit)}
          >
            <Edit3 size={16} />
            <span>Edit</span>
          </button>
        )}

        {isOwn && (
          <>
            <div className="nada-dropdown-separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="nada-dropdown-item danger"
              onClick={() => handleItemClick(onDelete)}
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
