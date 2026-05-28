"use client";

/* ─────────────────────────────────────────────────────────────
   ChatHeader — chat-arena top bar with security pill.
   NEW component. Drop into NadaApp.tsx where you currently
   render the chat header inline.

   Props mirror the data you already have in scope:
     - title:        chat.title || contact.alias
     - subtitle:     "online · end-to-end" / "12 members · 3 online"
     - avatar:       optional url
     - initials:     fallback initials (e.g. "EC")
     - isOnline:     drives the green online dot
     - verified:     show shield next to title
     - onSearch / onCall / onVideo / onMore: header action callbacks
   ───────────────────────────────────────────────────────────── */

import {
  Lock,
  MoreVertical,
  Phone,
  Search,
  ShieldCheck,
  Video
} from "lucide-react";
import { cn } from "@nada/ui";

export type ChatHeaderProps = {
  title: string;
  subtitle?: string;
  avatar?: string;
  initials?: string;
  isOnline?: boolean;
  verified?: boolean;
  onSearch?: () => void;
  onCall?: () => void;
  onVideo?: () => void;
  onMore?: () => void;
};

export const ChatHeader = ({
  title,
  subtitle,
  avatar,
  initials = "??",
  isOnline = false,
  verified = true,
  onSearch,
  onCall,
  onVideo,
  onMore
}: ChatHeaderProps) => {
  return (
    <header
      className="flex items-center px-6 py-4 shrink-0"
      style={{
        minHeight: 72,
        background: "rgb(var(--nada-bg) / 0.82)",
        backdropFilter: "blur(22px) saturate(145%)",
        WebkitBackdropFilter: "blur(22px) saturate(145%)",
        borderBottom: "1px solid rgb(var(--nada-border) / 0.05)"
      }}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full font-semibold"
          style={{
            background: "linear-gradient(135deg, rgb(var(--nada-surface-3)), rgb(var(--nada-surface-elevated)))",
            boxShadow: "inset 0 0 0 1px rgb(var(--nada-border) / 0.10)",
            color: "rgb(var(--nada-primary) / 0.9)",
            fontSize: 13,
            letterSpacing: "0.02em"
          }}
        >
          {avatar ? (
            <img src={avatar} alt={title} className="h-full w-full object-cover" />
          ) : (
            <span className="font-bold">{initials}</span>
          )}
        </div>
        {isOnline && (
          <span
            className="absolute bottom-0 right-0 block h-[9px] w-[9px] rounded-full"
            style={{
              background: "rgb(var(--nada-accent))",
              boxShadow:
                "0 0 0 2px rgb(var(--nada-bg)), 0 0 10px rgb(var(--nada-accent) / 0.65)"
            }}
          />
        )}
      </div>

      {/* Title + subtitle */}
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h2
            className="truncate text-[15px] font-semibold text-nada-primary"
            style={{ letterSpacing: "-0.01em" }}
          >
            {title}
          </h2>
          {verified && (
            <ShieldCheck
              size={12}
              strokeWidth={2.2}
              style={{ color: "rgb(var(--nada-accent))" }}
              aria-label="Verified key fingerprint"
            />
          )}
        </div>
        {subtitle && (
          <div className="mt-0.5 truncate text-[11.5px] font-mono text-nada-secondary/65">
            {subtitle}
          </div>
        )}
      </div>

      {/* E2E security pill */}
      <div
        className="hidden mr-3 items-center gap-1.5 rounded-full px-2.5 py-1.5 md:flex"
        style={{
          background: "rgb(var(--nada-accent) / 0.08)",
          border: "1px solid rgb(var(--nada-accent) / 0.20)"
        }}
      >
        <Lock size={11} strokeWidth={2.2} style={{ color: "rgb(var(--nada-accent))" }} />
        <span
          className="text-[10.5px] font-bold uppercase"
          style={{ color: "rgb(var(--nada-accent))", letterSpacing: "0.10em" }}
        >
          E2E · Curve25519
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {onSearch && <HeaderButton Icon={Search} label="Search messages" onClick={onSearch} />}
        {onCall   && <HeaderButton Icon={Phone}  label="Voice call"      onClick={onCall} />}
        {onVideo  && <HeaderButton Icon={Video}  label="Video call"      onClick={onVideo} />}
        {onMore   && <HeaderButton Icon={MoreVertical} label="More"      onClick={onMore} />}
      </div>
    </header>
  );
};

const HeaderButton = ({
  Icon,
  label,
  onClick
}: {
  Icon: typeof Search;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={cn(
      "grid h-9 w-9 place-items-center rounded-full text-nada-secondary/85 transition-colors",
      "hover:bg-white/[0.05] hover:text-nada-primary"
    )}
  >
    <Icon size={17} strokeWidth={1.85} />
  </button>
);
