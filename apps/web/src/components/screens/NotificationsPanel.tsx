"use client";
/* eslint-disable */
import type {
  WhisperNotification,
  WhisperNotificationKind
} from "@/utils/dashboard-types";
import { formatRelativeTime } from "@/utils/helpers";
import { cn } from "@nada/ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellOff,
  CheckCheck,
  MessageCircle,
  CornerDownRight,
  Radio,
  Heart,
  Repeat2,
  AtSign,
  Ghost,
  Loader2
} from "lucide-react";
import { useMemo } from "react";
import { AuthorAvatar } from "./WhispersFeed";

const KIND_META: Record<
  WhisperNotificationKind,
  { icon: typeof Bell; one: string; many: string }
> = {
  reflect: {
    icon: MessageCircle,
    one: "reflected on your Echo",
    many: "reflected on your Echo"
  },
  reply: {
    icon: CornerDownRight,
    one: "replied to your reflection",
    many: "replied to your reflection"
  },
  echo: { icon: Radio, one: "echoed your Echo", many: "echoed your Echo" },
  reflection_echo: {
    icon: Heart,
    one: "echoed your reflection",
    many: "echoed your reflection"
  },
  ripple: { icon: Repeat2, one: "rippled your Echo", many: "rippled your Echo" },
  mention: { icon: AtSign, one: "mentioned you", many: "mentioned you" },
  follow: {
    icon: Ghost,
    one: "is now one of your Ghosts",
    many: "are now your Ghosts"
  }
};

// One rendered row per (target, kind): "quiet.fox reflected on your Echo" or
// "quiet.fox and 11 others reflected on your Echo". Grouping happens here at
// render time so the stored inbox stays a flat, dedupable event log.
type NotificationGroup = {
  actors: string[];
  key: string;
  kind: WhisperNotificationKind;
  latest: WhisperNotification;
  unread: boolean;
};

function groupNotifications(notifications: WhisperNotification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  const ordered = [...notifications].sort((a, b) => b.createdAt - a.createdAt);
  for (const notification of ordered) {
    // Replies/mentions are personal — show them individually. Likes, reflects,
    // ripples and follows aggregate per target.
    const aggregate =
      notification.kind !== "reply" && notification.kind !== "mention";
    const key = aggregate
      ? `${notification.kind}:${notification.echoId ?? "profile"}`
      : `${notification.kind}:${notification.id}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        actors: [notification.actorName],
        key,
        kind: notification.kind,
        latest: notification,
        unread: !notification.read
      });
    } else {
      if (!existing.actors.includes(notification.actorName)) {
        existing.actors.push(notification.actorName);
      }
      existing.unread = existing.unread || !notification.read;
    }
  }
  return Array.from(groups.values());
}

function groupLabel(group: NotificationGroup): string {
  const meta = KIND_META[group.kind];
  if (group.actors.length === 1) return `${group.actors[0]} ${meta.one}`;
  if (group.actors.length === 2) {
    return `${group.actors[0]} and ${group.actors[1]} ${meta.many}`;
  }
  return `${group.actors[0]} and ${group.actors.length - 1} others ${meta.many}`;
}

function NotificationSkeleton(): JSX.Element {
  return (
    <div aria-hidden className="space-y-2">
      {[0, 1, 2, 3].map((index) => (
        <div
          className="flex items-start gap-3 rounded-2xl border border-nada-border/10 bg-nada-surface-elevated/40 p-3.5"
          key={index}
        >
          <div className="h-10 w-10 shrink-0 rounded-2xl nada-skeleton" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-3 w-2/3 rounded nada-skeleton" />
            <div className="h-2.5 w-1/3 rounded nada-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationsPanel({
  loading,
  notifications,
  onMarkAllRead,
  onOpenNotification,
  relayConfigured,
  unreadCount
}: {
  loading: boolean;
  notifications: WhisperNotification[];
  onMarkAllRead: () => void;
  onOpenNotification: (notification: WhisperNotification) => void;
  relayConfigured: boolean;
  unreadCount: number;
}): JSX.Element {
  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      <div className="nada-premium-card mb-5 p-5">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-nada-accent/14 text-nada-accent">
          <Bell size={24} />
        </div>
        <p className="text-[11px] font-bold uppercase text-nada-accent">Alerts</p>
        <h2 className="mt-1 text-[20px] font-bold text-nada-primary">
          Every ripple back to you.
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-nada-text-muted">
          Reflections, echoes, ripples, mentions and new Ghosts — collected here
          in real time, tied only to your anonymous key.
        </p>
        {unreadCount > 0 ? (
          <button
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-nada-accent/12 px-4 text-[12.5px] font-bold text-nada-accent transition hover:bg-nada-accent/20"
            onClick={onMarkAllRead}
            type="button"
          >
            <CheckCheck size={15} />
            Mark all as read
            <span className="tabular-nums">({unreadCount})</span>
          </button>
        ) : null}
      </div>

      {loading && notifications.length === 0 ? (
        <NotificationSkeleton />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-nada-border/10 bg-nada-surface-elevated/35 px-4 py-10 text-center">
          <BellOff className="mx-auto mb-3 h-7 w-7 text-nada-secondary/35" />
          <p className="text-[14px] font-bold text-nada-primary">
            {relayConfigured ? "Nothing yet" : "Alerts need a relay"}
          </p>
          <p className="mt-1 text-[12.5px] text-nada-text-muted">
            {relayConfigured
              ? "When someone reflects, echoes or ripples your whispers, it shows up here."
              : "Connect NADA to a relay to receive activity from other ghosts."}
          </p>
        </div>
      ) : (
        <section aria-label="Notifications" className="grid gap-2">
          <AnimatePresence initial={false}>
            {groups.map((group) => {
              const Icon = KIND_META[group.kind].icon;
              return (
                <motion.button
                  layout
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition",
                    group.unread
                      ? "border-nada-accent/25 bg-nada-accent/[0.06] hover:bg-nada-accent/[0.10]"
                      : "border-nada-border/10 bg-nada-surface-elevated/40 hover:bg-nada-surface-elevated/70"
                  )}
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0, y: 8 }}
                  key={group.key}
                  onClick={() => onOpenNotification(group.latest)}
                  type="button"
                >
                  <div className="relative shrink-0">
                    <AuthorAvatar name={group.latest.actorName} />
                    <span
                      className={cn(
                        "absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-nada-surface",
                        group.unread
                          ? "bg-nada-accent text-white"
                          : "bg-nada-muted text-nada-secondary"
                      )}
                    >
                      <Icon size={10} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[13.5px] leading-snug",
                        group.unread
                          ? "font-bold text-nada-primary"
                          : "font-semibold text-nada-primary/80"
                      )}
                    >
                      {groupLabel(group)}
                    </p>
                    {group.latest.preview ? (
                      <p className="mt-0.5 truncate text-[12px] text-nada-text-muted">
                        “{group.latest.preview}”
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10.5px] text-nada-secondary/45">
                      {formatRelativeTime(group.latest.createdAt)}
                    </p>
                  </div>
                  {group.unread ? (
                    <span
                      aria-label="Unread"
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-nada-accent shadow-accent-glow"
                    />
                  ) : null}
                </motion.button>
              );
            })}
          </AnimatePresence>
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-nada-secondary/50" />
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
