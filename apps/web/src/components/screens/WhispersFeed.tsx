"use client";
/* eslint-disable */
import type { WhisperEcho } from "@/utils/dashboard-types";
import { formatRelativeTime } from "@/utils/helpers";
import type { IdentityRecord } from "@nada/db";
import { cn } from "@nada/ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  Waves,
  Radio,
  MessageCircle,
  Repeat2,
  Send,
  Trash2,
  Flag,
  Sparkles,
  Globe
} from "lucide-react";
import { useMemo, useState } from "react";

// A soft gradient avatar derived from the author name so anonymous handles
// still get a stable, recognisable little identity chip.
function authorGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 48) % 360} 68% 42%))`;
}

function AuthorAvatar({ name }: { name: string }): JSX.Element {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-[15px] font-bold text-white shadow-inner"
      style={{ backgroundImage: authorGradient(name) }}
    >
      {initial}
    </span>
  );
}

function EchoCard({
  echo,
  isMine,
  isExpanded,
  reflectionDraft,
  onToggleEcho,
  onToggleReflections,
  onReflectionDraftChange,
  onSubmitReflection,
  onRipple,
  onDelete,
  onReport
}: {
  echo: WhisperEcho;
  isMine: boolean;
  isExpanded: boolean;
  reflectionDraft: string;
  onToggleEcho: () => void;
  onToggleReflections: () => void;
  onReflectionDraftChange: (value: string) => void;
  onSubmitReflection: () => void;
  onRipple: () => void;
  onDelete: () => void;
  onReport: () => void;
}): JSX.Element {
  return (
    <motion.article
      layout
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-nada-border/10 bg-nada-surface-elevated/40 p-4"
      initial={{ opacity: 0, y: 10 }}
    >
      <div className="flex items-start gap-3">
        <AuthorAvatar name={echo.authorName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold text-nada-primary">
              {echo.authorName}
            </span>
            {isMine ? (
              <span className="rounded-full bg-nada-accent/12 px-2 py-0.5 text-[10px] font-bold text-nada-accent">
                You
              </span>
            ) : null}
            <span className="text-[11px] text-nada-secondary/45">
              · {formatRelativeTime(echo.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-nada-secondary/45">Whispered to everyone on NADA</p>
        </div>
        <button
          className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-nada-muted text-nada-secondary transition hover:text-red-300"
          onClick={isMine ? onDelete : onReport}
          title={isMine ? "Delete Echo" : "Report Echo"}
          type="button"
        >
          {isMine ? <Trash2 size={15} /> : <Flag size={15} />}
        </button>
      </div>

      {echo.rippleOf ? (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-nada-accent">
          <Repeat2 size={13} />
          Rippled
        </div>
      ) : null}

      {echo.body ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-nada-primary/90">
          {echo.body}
        </p>
      ) : null}

      {echo.rippleOf ? (
        <div className="mt-3 rounded-2xl border border-nada-border/10 bg-nada-surface/60 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-nada-primary">
              {echo.rippleOf.authorName}
            </span>
            <span className="text-[10px] text-nada-secondary/45">
              · {formatRelativeTime(echo.rippleOf.createdAt)}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-nada-text-muted">
            {echo.rippleOf.body}
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-1 border-t border-nada-border/10 pt-2">
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-[12.5px] font-bold transition",
            echo.echoedByMe
              ? "bg-nada-accent/12 text-nada-accent"
              : "text-nada-secondary/70 hover:bg-nada-surface/70"
          )}
          onClick={onToggleEcho}
          type="button"
        >
          <Radio size={16} className={echo.echoedByMe ? "fill-nada-accent/30" : ""} />
          Echo
          {echo.echoCount > 0 ? (
            <span className="tabular-nums">{echo.echoCount}</span>
          ) : null}
        </button>
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-[12.5px] font-bold transition",
            isExpanded
              ? "bg-nada-surface/70 text-nada-primary"
              : "text-nada-secondary/70 hover:bg-nada-surface/70"
          )}
          onClick={onToggleReflections}
          type="button"
        >
          <MessageCircle size={16} />
          Reflect
          {echo.reflections.length > 0 ? (
            <span className="tabular-nums">{echo.reflections.length}</span>
          ) : null}
        </button>
        <button
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-[12.5px] font-bold transition",
            echo.rippledByMe
              ? "bg-nada-accent/12 text-nada-accent"
              : "text-nada-secondary/70 hover:bg-nada-surface/70"
          )}
          disabled={echo.rippledByMe}
          onClick={onRipple}
          type="button"
        >
          <Repeat2 size={16} />
          Ripple
          {echo.rippleCount > 0 ? (
            <span className="tabular-nums">{echo.rippleCount}</span>
          ) : null}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
          >
            <div className="mt-3 space-y-2">
              {echo.reflections.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-nada-border/10 px-3 py-4 text-center text-[12px] text-nada-text-muted">
                  No reflections yet. Be the first to reflect.
                </p>
              ) : (
                echo.reflections.map((reflection) => (
                  <div className="flex items-start gap-2.5" key={reflection.id}>
                    <AuthorAvatar name={reflection.authorName} />
                    <div className="min-w-0 flex-1 rounded-2xl bg-nada-surface/70 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[12.5px] font-bold text-nada-primary">
                          {reflection.authorName}
                        </span>
                        <span className="text-[10px] text-nada-secondary/45">
                          · {formatRelativeTime(reflection.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-nada-primary/90">
                        {reflection.body}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <form
                className="mt-1 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitReflection();
                }}
              >
                <input
                  className="nada-input-dark h-10 min-w-0 flex-1 text-[13px]"
                  maxLength={280}
                  onChange={(event) => onReflectionDraftChange(event.target.value)}
                  placeholder="Add a reflection..."
                  value={reflectionDraft}
                />
                <button
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-nada-accent text-white disabled:opacity-40"
                  disabled={!reflectionDraft.trim()}
                  type="submit"
                >
                  <Send size={15} />
                </button>
              </form>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}

export function WhispersFeed({
  echoes,
  identity,
  displayName,
  onPostEcho,
  onToggleEcho,
  onAddReflection,
  onRipple,
  onDeleteEcho,
  onReportEcho
}: {
  echoes: WhisperEcho[];
  identity: IdentityRecord;
  displayName: string;
  onPostEcho: (body: string) => void;
  onToggleEcho: (echoId: string) => void;
  onAddReflection: (echoId: string, body: string) => void;
  onRipple: (echoId: string) => void;
  onDeleteEcho: (echoId: string) => void;
  onReportEcho: (echo: WhisperEcho) => void;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reflectionDrafts, setReflectionDrafts] = useState<Record<string, string>>({});

  const sorted = useMemo(
    () => [...echoes].sort((a, b) => b.createdAt - a.createdAt),
    [echoes]
  );

  const submitEcho = (): void => {
    const body = draft.trim();
    if (!body) return;
    onPostEcho(body);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      <div className="nada-premium-card mb-5 p-5">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-nada-accent/14 text-nada-accent">
          <Waves size={24} />
        </div>
        <p className="text-[11px] font-bold uppercase text-nada-accent">Whispers</p>
        <h2 className="mt-1 text-[20px] font-bold text-nada-primary">
          One feed. Everyone on NADA.
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-nada-text-muted">
          Post an Echo and everyone on NADA can see it — no followers, no real
          names, no phone numbers. Reflect, Ripple, and Echo the whispers you like.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="nada-privacy-chip">
            <Globe size={11} className="mr-1 inline" /> Public feed
          </span>
          <span className="nada-privacy-chip">Anonymous profile</span>
          <span className="nada-privacy-chip">No followers</span>
        </div>
      </div>

      {/* Composer — anybody can post anything */}
      <div className="mb-5 rounded-3xl border border-nada-border/10 bg-nada-surface-elevated/40 p-4">
        <div className="flex items-start gap-3">
          <AuthorAvatar name={displayName.trim() || "You"} />
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              submitEcho();
            }}
          >
            <textarea
              className="nada-input-dark min-h-[64px] w-full resize-none px-4 py-3 text-[14px]"
              maxLength={500}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Whisper something to everyone..."
              value={draft}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-nada-secondary/45">
                {draft.length}/500
              </span>
              <button
                className="nada-btn-gold inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-5 text-[13px] font-bold disabled:opacity-45"
                disabled={!draft.trim()}
                type="submit"
              >
                <Sparkles size={15} />
                Echo
              </button>
            </div>
          </form>
        </div>
      </div>

      <section className="grid gap-3">
        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-nada-border/10 bg-nada-surface-elevated/35 px-4 py-10 text-center">
            <Waves className="mx-auto mb-3 h-7 w-7 text-nada-secondary/35" />
            <p className="text-[14px] font-bold text-nada-primary">The feed is quiet</p>
            <p className="mt-1 text-[12.5px] text-nada-text-muted">
              Be the first to whisper something into NADA.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sorted.map((echo) => (
              <EchoCard
                echo={echo}
                isExpanded={expandedId === echo.id}
                isMine={echo.authorHash === identity.pubkeyHash}
                key={echo.id}
                onDelete={() => onDeleteEcho(echo.id)}
                onReflectionDraftChange={(value) =>
                  setReflectionDrafts((prev) => ({ ...prev, [echo.id]: value }))
                }
                onReport={() => onReportEcho(echo)}
                onRipple={() => onRipple(echo.id)}
                onSubmitReflection={() => {
                  const body = (reflectionDrafts[echo.id] ?? "").trim();
                  if (!body) return;
                  onAddReflection(echo.id, body);
                  setReflectionDrafts((prev) => ({ ...prev, [echo.id]: "" }));
                }}
                onToggleEcho={() => onToggleEcho(echo.id)}
                onToggleReflections={() =>
                  setExpandedId((current) => (current === echo.id ? null : echo.id))
                }
                reflectionDraft={reflectionDrafts[echo.id] ?? ""}
              />
            ))}
          </AnimatePresence>
        )}
      </section>
    </div>
  );
}
