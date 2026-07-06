"use client";
/* eslint-disable */
import type { WhisperEcho, WhisperProfile } from "@/utils/dashboard-types";
import { formatRelativeTime } from "@/utils/helpers";
import { cn } from "@nada/ui";
import { motion } from "framer-motion";
import {
  X,
  Ghost,
  UserPlus,
  UserCheck,
  Share2,
  Pencil,
  Check,
  CalendarDays,
  Building2,
  Radio,
  MessageCircle,
  Heart,
  Loader2,
  EyeOff,
  Waves
} from "lucide-react";
import { useEffect, useState } from "react";
import { authorGradient } from "../screens/WhispersFeed";
import { Sheet } from "./Sheet";

function joinedLabel(joinedAt: number | null): string {
  if (!joinedAt) return "New ghost";
  return `Joined ${new Date(joinedAt).toLocaleDateString([], {
    month: "long",
    year: "numeric"
  })}`;
}

function StatBlock({
  label,
  value
}: {
  label: string;
  value: number;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-nada-surface/60 px-2 py-2.5">
      <span className="text-[16px] font-extrabold tabular-nums text-nada-primary">
        {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
      </span>
      <span className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wider text-nada-secondary/50">
        {label}
      </span>
    </div>
  );
}

function ProfileSkeleton(): JSX.Element {
  return (
    <div aria-hidden className="space-y-4 py-4">
      <div className="mx-auto h-24 w-24 rounded-[30px] nada-skeleton" />
      <div className="mx-auto h-4 w-1/2 rounded nada-skeleton" />
      <div className="mx-auto h-3 w-1/3 rounded nada-skeleton" />
      <div className="grid grid-cols-5 gap-1.5">
        {[0, 1, 2, 3, 4].map((index) => (
          <div className="h-16 rounded-2xl nada-skeleton" key={index} />
        ))}
      </div>
    </div>
  );
}

export type WhisperProfileDraft = {
  bio: string;
  displayName: string;
  institution: string;
  showActivity: boolean;
};

export function WhisperProfileSheet({
  echoes,
  echoesHasMore,
  echoesLoading,
  fallbackName,
  isSelf,
  loading,
  onClose,
  onLoadMoreEchoes,
  onOpenEcho,
  onSaveProfile,
  onShareProfile,
  onToggleFollow,
  profile,
  relayConfigured
}: {
  echoes: WhisperEcho[];
  echoesHasMore: boolean;
  echoesLoading: boolean;
  fallbackName: string;
  isSelf: boolean;
  loading: boolean;
  onClose: () => void;
  onLoadMoreEchoes: () => void;
  onOpenEcho: (echo: WhisperEcho) => void;
  onSaveProfile: (draft: WhisperProfileDraft) => void;
  onShareProfile: () => void;
  onToggleFollow: () => void;
  profile: WhisperProfile | null;
  relayConfigured: boolean;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WhisperProfileDraft>({
    bio: "",
    displayName: "",
    institution: "",
    showActivity: true
  });

  const name = profile?.displayName || fallbackName;
  const anonymousHandle = profile
    ? `ghost·${profile.pubkeyHash.slice(0, 10)}`
    : "ghost·…";
  const activityVisible = isSelf || (profile?.showActivity ?? true);

  useEffect(() => {
    if (profile) {
      setDraft({
        bio: profile.bio,
        displayName: profile.displayName || fallbackName,
        institution: profile.institution,
        showActivity: profile.showActivity
      });
    }
  }, [profile, fallbackName]);

  return (
    <Sheet onClose={onClose}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-nada-primary">
          {isSelf ? "Your profile" : "Ghost profile"}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            aria-label="Share profile link"
            className="grid h-9 w-9 place-items-center rounded-2xl bg-nada-muted text-nada-secondary transition hover:text-nada-accent"
            onClick={onShareProfile}
            title="Share profile link"
            type="button"
          >
            <Share2 size={15} />
          </button>
          {isSelf && !editing ? (
            <button
              aria-label="Edit profile"
              className="grid h-9 w-9 place-items-center rounded-2xl bg-nada-muted text-nada-secondary transition hover:text-nada-accent"
              onClick={() => setEditing(true)}
              title="Edit profile"
              type="button"
            >
              <Pencil size={15} />
            </button>
          ) : null}
          <button
            aria-label="Close profile"
            className="grid h-9 w-9 place-items-center rounded-2xl bg-nada-muted text-nada-secondary transition hover:text-nada-primary"
            onClick={onClose}
            type="button"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {loading && !profile ? (
        <ProfileSkeleton />
      ) : (
        <>
          {/* Identity header */}
          <div className="flex flex-col items-center px-2 py-5 text-center">
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="relative mb-4"
              initial={{ opacity: 0, scale: 0.9 }}
            >
              <div
                aria-hidden
                className="absolute inset-0 rounded-[30px] opacity-45 blur-2xl"
                style={{ backgroundImage: authorGradient(name) }}
              />
              <span
                className="relative grid h-24 w-24 place-items-center rounded-[30px] text-[34px] font-extrabold text-white shadow-inner"
                style={{ backgroundImage: authorGradient(name) }}
              >
                {(name.trim()[0] ?? "?").toUpperCase()}
              </span>
            </motion.div>
            <p className="mb-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-nada-accent/80">
              Ghost ID
            </p>

            {editing ? (
              <input
                aria-label="Display name"
                className="nada-input-dark h-10 w-full max-w-[240px] text-center text-[15px] font-bold"
                maxLength={80}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, displayName: event.target.value }))
                }
                value={draft.displayName}
              />
            ) : (
              <h3 className="text-[20px] font-extrabold tracking-tight text-nada-primary">
                {name}
              </h3>
            )}
            <p className="mt-1 font-mono text-[11.5px] text-nada-secondary/60">
              {anonymousHandle}
            </p>

            {editing ? (
              <textarea
                aria-label="Bio"
                className="nada-input-dark mt-3 min-h-[64px] w-full resize-none px-3 py-2 text-[13px]"
                maxLength={280}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, bio: event.target.value }))
                }
                placeholder="Say something without saying who you are..."
                value={draft.bio}
              />
            ) : profile?.bio ? (
              <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-nada-secondary/80">
                {profile.bio}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-nada-secondary/55">
              {editing ? (
                <input
                  aria-label="Institution"
                  className="nada-input-dark h-9 w-44 text-center text-[12px]"
                  maxLength={80}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      institution: event.target.value
                    }))
                  }
                  placeholder="Institution (optional)"
                  value={draft.institution}
                />
              ) : profile?.institution ? (
                <span className="inline-flex items-center gap-1">
                  <Building2 size={11} />
                  {profile.institution}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={11} />
                {joinedLabel(profile?.joinedAt ?? null)}
              </span>
            </div>

            {/* Follow / edit actions */}
            {editing ? (
              <div className="mt-4 w-full space-y-3">
                <label className="flex items-center justify-between rounded-2xl bg-nada-surface/60 px-3.5 py-3">
                  <span className="flex items-center gap-2 text-[12.5px] font-semibold text-nada-primary">
                    <EyeOff size={13} className="text-nada-secondary/60" />
                    Show recent activity on profile
                  </span>
                  <input
                    checked={draft.showActivity}
                    className="h-4 w-4 accent-[rgb(var(--nada-accent))]"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        showActivity: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-2xl bg-nada-muted px-4 py-2.5 text-[13px] font-semibold text-nada-secondary"
                    onClick={() => setEditing(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-nada-accent px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-45"
                    disabled={!draft.displayName.trim()}
                    onClick={() => {
                      onSaveProfile({
                        ...draft,
                        displayName: draft.displayName.trim()
                      });
                      setEditing(false);
                    }}
                    type="button"
                  >
                    <Check size={14} />
                    Save profile
                  </button>
                </div>
              </div>
            ) : !isSelf ? (
              <button
                className={cn(
                  "mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-6 text-[13.5px] font-bold transition disabled:opacity-45",
                  profile?.followedByMe
                    ? "bg-nada-muted text-nada-primary hover:bg-red-500/10 hover:text-red-300"
                    : "nada-btn-gold"
                )}
                disabled={!relayConfigured || !profile}
                onClick={onToggleFollow}
                title={
                  relayConfigured
                    ? undefined
                    : "Following needs a relay connection"
                }
                type="button"
              >
                {profile?.followedByMe ? (
                  <>
                    <UserCheck size={15} />
                    Haunting
                  </>
                ) : (
                  <>
                    <UserPlus size={15} />
                    Follow
                  </>
                )}
              </button>
            ) : null}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-1.5">
            <StatBlock label="Echoes" value={profile?.echoCount ?? 0} />
            <StatBlock label="Reflects" value={profile?.reflectionCount ?? 0} />
            <StatBlock label="Likes" value={profile?.likesReceived ?? 0} />
            <StatBlock label="Ghosts" value={profile?.followerCount ?? 0} />
            <StatBlock label="Following" value={profile?.followingCount ?? 0} />
          </div>

          {/* Public Echo timeline */}
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-nada-secondary/50">
              <Waves size={12} />
              Public Echoes
            </p>
            {!activityVisible ? (
              <div className="rounded-2xl border border-dashed border-nada-border/10 px-4 py-8 text-center">
                <EyeOff className="mx-auto mb-2 h-6 w-6 text-nada-secondary/35" />
                <p className="text-[13px] font-bold text-nada-primary">
                  This ghost keeps their activity private
                </p>
                <p className="mt-1 text-[12px] text-nada-text-muted">
                  Their Echoes still appear in the global feed.
                </p>
              </div>
            ) : echoesLoading && echoes.length === 0 ? (
              <div className="space-y-2">
                {[0, 1].map((index) => (
                  <div className="h-20 rounded-2xl nada-skeleton" key={index} />
                ))}
              </div>
            ) : echoes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-nada-border/10 px-4 py-8 text-center">
                <Ghost className="mx-auto mb-2 h-6 w-6 text-nada-secondary/35" />
                <p className="text-[13px] font-bold text-nada-primary">No Echoes yet</p>
                <p className="mt-1 text-[12px] text-nada-text-muted">
                  {isSelf
                    ? "Whisper something to the feed and it will appear here."
                    : "This ghost hasn't whispered anything yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {echoes.map((echo) => (
                  <button
                    className="w-full rounded-2xl border border-nada-border/10 bg-nada-surface/60 px-3.5 py-3 text-left transition hover:border-nada-accent/25 hover:bg-nada-surface"
                    key={echo.id}
                    onClick={() => onOpenEcho(echo)}
                    type="button"
                  >
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-nada-primary/90 line-clamp-3">
                      {echo.body || (echo.rippleOf ? `↻ ${echo.rippleOf.body}` : "")}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[10.5px] text-nada-secondary/50">
                      <span>{formatRelativeTime(echo.createdAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Radio size={10} /> {echo.echoCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle size={10} /> {echo.reflectionCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart size={10} /> {echo.rippleCount}
                      </span>
                    </div>
                  </button>
                ))}
                {echoesHasMore ? (
                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-nada-border/10 px-3 py-2.5 text-[12px] font-bold text-nada-accent transition hover:bg-nada-accent/10 disabled:opacity-50"
                    disabled={echoesLoading}
                    onClick={onLoadMoreEchoes}
                    type="button"
                  >
                    {echoesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Show older Echoes
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
