"use client";

/* ─────────────────────────────────────────────────────────────
   IconRail — 68px vertical navigation rail for desktop layout.
   Sits as column 1 of the NadaApp desktop shell.
   ───────────────────────────────────────────────────────────── */

import { memo, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  MessageCircle,
  Phone,
  Settings,
  Users,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────── */

interface IconRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  totalUnreadCount: number;
  onNewChat: () => void;
  onSettings: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof MessageCircle;
}

/* ── Constants ──────────────────────────────────────────────── */

const NAV_ITEMS: NavItem[] = [
  { id: "chats",         label: "Chats",         icon: MessageCircle },
  { id: "calls",         label: "Calls",         icon: Phone },
  { id: "communities",   label: "Communities",    icon: Users },
  { id: "notifications", label: "Notifications",  icon: Bell },
];

/* ── Main Component ─────────────────────────────────────────── */

export function IconRail({
  activeTab,
  onTabChange,
  totalUnreadCount,
  onNewChat,
  onSettings,
}: IconRailProps) {
  const handleSettingsClick = useCallback(() => {
    onTabChange("settings");
    onSettings();
  }, [onTabChange, onSettings]);

  const badgeLabel = useMemo(() => {
    if (totalUnreadCount <= 0) return null;
    return totalUnreadCount > 99 ? "99+" : String(totalUnreadCount);
  }, [totalUnreadCount]);

  return (
    <nav className="nada-rail" aria-label="Primary navigation">
      {/* ── Brand logo ─────────────────────────────────────── */}
      <motion.div
        className="nada-rail-logo"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        role="button"
        tabIndex={0}
        aria-label="NADA home"
        onClick={onNewChat}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onNewChat();
          }
        }}
      >
        <img src="/logo.webp" alt="NADA" draggable={false} />
      </motion.div>

      {/* ── Primary nav items ──────────────────────────────── */}
      <div className="nada-rail-nav" role="tablist" aria-label="Main tabs">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <RailButton
              key={item.id}
              item={item}
              isActive={isActive}
              onClick={() => onTabChange(item.id)}
              badge={item.id === "chats" ? badgeLabel : null}
            />
          );
        })}
      </div>

      {/* ── Spacer pushes settings to bottom ───────────────── */}
      <div className="nada-rail-spacer" aria-hidden="true" />

      {/* ── Settings (pinned to bottom) ────────────────────── */}
      <RailButton
        item={{ id: "settings", label: "Settings", icon: Settings }}
        isActive={activeTab === "settings"}
        onClick={handleSettingsClick}
        badge={null}
      />
    </nav>
  );
}

/* ── Rail Button ────────────────────────────────────────────── */

const RailButton = memo(function RailButton({
  item,
  isActive,
  onClick,
  badge,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
  badge: string | null;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      className={`nada-rail-btn${isActive ? " active" : ""}`}
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      aria-label={badge ? `${item.label}, ${badge} unread` : item.label}
      title={item.label}
    >
      <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />

      {badge && (
        <span className="nada-rail-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
});
