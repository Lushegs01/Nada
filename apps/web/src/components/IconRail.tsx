"use client";

/* ─────────────────────────────────────────────────────────────
   IconRail — slim vertical icon rail (md+ desktop nav)
   Drop-in replacement for DesktopNavRail from NadaMobileUI.tsx.
   Same prop signature; new visual treatment.
   ───────────────────────────────────────────────────────────── */

import { motion } from "framer-motion";
import {
  CircleDashed,
  MessageCircle,
  Network,
  Settings,
  Users
} from "lucide-react";
import { cn } from "@nada/ui";

type Tab = {
  id: string;
  label: string;
  icon: typeof MessageCircle;
  badge?: number;
};

export const IconRail = ({
  activeTab,
  onTabChange,
  unreadCount = 0
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  unreadCount?: number;
}) => {
  const tabs: Tab[] = [
    { id: "chats",       label: "Chats",     icon: MessageCircle, badge: unreadCount },
    { id: "status",      label: "Status",    icon: CircleDashed },
    { id: "groups",      label: "Groups",    icon: Users },
    { id: "communities", label: "Community", icon: Network }
  ];

  return (
    <nav
      className="hidden h-full w-[68px] shrink-0 flex-col items-center gap-1.5 px-2 py-4 md:flex"
      style={{
        background: "rgb(var(--nada-bg))",
        borderRight: "1px solid rgb(var(--nada-border) / 0.05)"
      }}
      aria-label="Primary navigation"
    >
      {/* Brand mark */}
      <div className="relative mb-5 grid h-10 w-10 place-items-center overflow-hidden rounded-[12px] nada-logo-aura">
        <img src="/logo.png" alt="NADA" className="h-full w-full object-cover" />
      </div>

      {/* Primary tabs */}
      <div className="flex flex-1 flex-col items-center gap-1.5">
        {tabs.map((tab) => (
          <RailButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
          />
        ))}
      </div>

      {/* Settings + user */}
      <div className="flex flex-col items-center gap-2">
        <RailButton
          tab={{ id: "settings", label: "Settings", icon: Settings }}
          isActive={activeTab === "settings"}
          onClick={() => onTabChange("settings")}
        />
      </div>
    </nav>
  );
};

/* Single rail button — handles hover, active, glow indicator, tooltip */
const RailButton = ({
  tab,
  isActive,
  onClick
}: {
  tab: Tab;
  isActive: boolean;
  onClick: () => void;
}) => {
  const Icon = tab.icon;
  const showBadge = tab.badge !== undefined && tab.badge > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={tab.label}
      aria-label={tab.label}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative grid h-11 w-11 place-items-center rounded-[12px] transition-colors duration-150",
        isActive
          ? "text-nada-accent"
          : "text-nada-secondary/65 hover:bg-white/[0.04] hover:text-nada-primary"
      )}
      style={isActive ? { background: "rgb(var(--nada-accent) / 0.10)" } : undefined}
    >
      {isActive && (
        <motion.span
          layoutId="rail-active-indicator"
          className="pointer-events-none absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
          style={{
            background: "rgb(var(--nada-accent))",
            boxShadow: "0 0 12px rgb(var(--nada-accent) / 0.65)"
          }}
          transition={{ type: "spring", stiffness: 480, damping: 34 }}
        />
      )}

      <Icon size={20} strokeWidth={isActive ? 2.2 : 1.85} />

      {showBadge && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black"
          style={{
            background: "rgb(var(--nada-accent))",
            color: "#051A11",
            boxShadow: "0 0 0 2px rgb(var(--nada-bg)), 0 0 12px rgb(var(--nada-accent) / 0.55)",
            letterSpacing: "-0.02em"
          }}
        >
          {tab.badge! > 99 ? "99+" : tab.badge}
        </span>
      )}

      {/* Tooltip */}
      <span
        className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-semibold opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{
          background: "rgb(var(--nada-surface-elevated) / 0.96)",
          borderColor: "rgb(var(--nada-border) / 0.10)",
          color: "rgb(var(--nada-primary))",
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          zIndex: 50
        }}
      >
        {tab.label}
      </span>
    </button>
  );
};
