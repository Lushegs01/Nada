"use client";
/* eslint-disable */
import type { WhisperEcho, WhisperMention, WhisperReflection } from "@/utils/dashboard-types";
import { WHISPER_THREAD_MAX_VISUAL_DEPTH } from "@/utils/dashboard-types";
import { formatRelativeTime } from "@/utils/helpers";
import type { IdentityRecord } from "@nada/db";
import { WHISPER_MAX_MEDIA, segmentMentions, type WhisperMedia } from "@nada/types";
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
  Globe,
  Heart,
  CornerDownRight,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Loader2,
  Mic,
  UploadCloud,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ConfirmActionDialog } from "../panels/Dialogs";
import {
  WHISPER_MEDIA_ACCEPT,
  WhisperMediaError,
  prepareWhisperMedia,
  type PreparedWhisperMedia
} from "@/lib/whisper-media";
import { AuthorAvatar } from "./AuthorAvatar";
import {
  AttachmentTray,
  EchoMediaGallery,
  RecordingBar,
  describeEchoMedia,
  useVoiceRecorder,
  voiceRecordingSupported
} from "./EchoMedia";
import { MentionSuggestions, useMentionPicker, type MentionSearch } from "./MentionPicker";

export { AuthorAvatar, authorGradient } from "./AuthorAvatar";

function AuthorName({
  name,
  onClick,
  className
}: {
  name: string;
  onClick?: (() => void) | undefined;
  className?: string;
}): JSX.Element {
  if (!onClick) {
    return <span className={cn("truncate font-bold text-nada-primary", className)}>{name}</span>;
  }
  return (
    <button
      className={cn(
        "truncate font-bold text-nada-primary transition hover:text-nada-accent hover:underline",
        className
      )}
      onClick={onClick}
      type="button"
    >
      {name}
    </button>
  );
}

// Renders "@handle" tokens in the accent colour while keeping everything else
// plain text. These are not tags — nothing resolved them to anyone — so they
// stay purely visual: older posts, and names typed without the picker.
const HANDLE_PATTERN = /(@[\w.·-]+)/g;
function HandleText({ text }: { text: string }): JSX.Element {
  const parts = text.split(HANDLE_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("@") ? (
          <span className="font-semibold text-nada-accent" key={index}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

// An Echo or Reflection body. Tags the relay resolved are links to the tagged
// ghost's profile — real links to the ?ghost= deep link, so they wrap with the
// text and open in a new tab like any other link.
function TaggedText({
  mentions,
  onOpenProfile,
  text
}: {
  mentions: WhisperMention[] | undefined;
  onOpenProfile: (authorHash: string, authorName: string) => void;
  text: string;
}): JSX.Element {
  if (!mentions?.length) return <HandleText text={text} />;
  return (
    <>
      {segmentMentions(text, mentions).map((segment, index) =>
        segment.kind === "mention" ? (
          <a
            className="font-semibold text-nada-accent hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-nada-accent"
            href={`/?ghost=${segment.mention.pubkeyHash}`}
            key={index}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              onOpenProfile(segment.mention.pubkeyHash, segment.mention.name);
            }}
          >
            {segment.text}
          </a>
        ) : (
          <HandleText key={index} text={segment.text} />
        )
      )}
    </>
  );
}

type ThreadTree = {
  childrenOf: Map<string, WhisperReflection[]>;
  roots: WhisperReflection[];
};

// Builds the parent→children tree from the flat reflection list. Orphans
// (nested replies whose parent page isn't loaded) are promoted to roots so
// nothing silently disappears. Roots render newest-first (matching thread
// pagination); children oldest-first (conversation order).
function buildThread(reflections: WhisperReflection[]): ThreadTree {
  const ids = new Set(reflections.map((reflection) => reflection.id));
  const childrenOf = new Map<string, WhisperReflection[]>();
  const roots: WhisperReflection[] = [];
  for (const reflection of reflections) {
    if (reflection.parentId && ids.has(reflection.parentId)) {
      const list = childrenOf.get(reflection.parentId) ?? [];
      list.push(reflection);
      childrenOf.set(reflection.parentId, list);
    } else {
      roots.push(reflection);
    }
  }
  roots.sort((a, b) => b.createdAt - a.createdAt);
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt);
  }
  return { childrenOf, roots };
}

const ECHO_MAX_LENGTH = 500;
const REFLECTION_MAX_LENGTH = 280;

function ReflectionComposer({
  autoFocus = false,
  onCancel,
  onSearchMentions,
  onSubmit,
  placeholder,
  replyToName
}: {
  autoFocus?: boolean;
  onCancel?: (() => void) | undefined;
  onSearchMentions: MentionSearch | undefined;
  onSubmit: (body: string, mentions: WhisperMention[]) => void;
  placeholder: string;
  replyToName?: string | undefined;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const picker = useMentionPicker<HTMLInputElement>({
    maxLength: REFLECTION_MAX_LENGTH,
    search: onSearchMentions,
    setText: setDraft,
    text: draft
  });
  const anchorRef = picker.inputProps.ref;
  const setInput = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      anchorRef(node);
    },
    [anchorRef]
  );

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (): void => {
    const body = draft.trim();
    if (!body) return;
    onSubmit(body, picker.tagged);
    setDraft("");
    picker.reset();
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {replyToName ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-nada-accent/12 px-2.5 py-1 text-[11px] font-bold text-nada-accent">
          @{replyToName}
          {onCancel ? (
            <button
              aria-label="Cancel reply"
              className="grid h-4 w-4 place-items-center rounded-full transition hover:bg-nada-accent/20"
              onClick={onCancel}
              type="button"
            >
              <X size={10} />
            </button>
          ) : null}
        </span>
      ) : null}
      <input
        {...picker.inputProps}
        aria-label={placeholder}
        className="nada-input-dark h-10 min-w-0 flex-1 text-[13px]"
        maxLength={REFLECTION_MAX_LENGTH}
        onChange={picker.handleChange}
        onKeyDown={(event) => {
          if (picker.handleKeyDown(event)) return;
          if (event.key === "Escape" && onCancel) onCancel();
        }}
        placeholder={placeholder}
        ref={setInput}
        value={draft}
      />
      <MentionSuggestions state={picker.suggestions} />
      <button
        aria-label="Send reflection"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-nada-accent text-white transition disabled:opacity-40"
        disabled={!draft.trim()}
        type="submit"
      >
        <Send size={15} />
      </button>
    </form>
  );
}

function ReflectionNode({
  collapsed,
  childrenOf,
  depth,
  myPubkeyHash,
  onDelete,
  onOpenProfile,
  onReply,
  onSearchMentions,
  onToggleCollapse,
  onToggleLike,
  reflection,
  replyingToId,
  onCancelReply,
  onSubmitReply
}: {
  collapsed: Set<string>;
  childrenOf: Map<string, WhisperReflection[]>;
  depth: number;
  myPubkeyHash: string;
  onDelete: (reflection: WhisperReflection) => void;
  onOpenProfile: (authorHash: string, authorName: string) => void;
  onReply: (reflection: WhisperReflection) => void;
  onSearchMentions: MentionSearch | undefined;
  onToggleCollapse: (id: string) => void;
  onToggleLike: (reflection: WhisperReflection) => void;
  reflection: WhisperReflection;
  replyingToId: string | null;
  onCancelReply: () => void;
  onSubmitReply: (parent: WhisperReflection, body: string, mentions: WhisperMention[]) => void;
}): JSX.Element {
  const children = childrenOf.get(reflection.id) ?? [];
  const isCollapsed = collapsed.has(reflection.id);
  const isMine = Boolean(myPubkeyHash) && reflection.authorHash === myPubkeyHash;
  // Deep threads stop indenting past a readable depth; the data stays fully
  // nested, only the visual offset is clamped.
  const indent = depth > 0 && depth <= WHISPER_THREAD_MAX_VISUAL_DEPTH;
  const canOpenProfile = Boolean(reflection.authorHash) && !reflection.deleted;

  return (
    <div className={cn(indent && "border-l border-nada-border/10 pl-3 sm:pl-4")}>
      <div className="flex items-start gap-2.5 py-1.5">
        <AuthorAvatar
          name={reflection.deleted ? "×" : reflection.authorName}
          onClick={
            canOpenProfile
              ? () => onOpenProfile(reflection.authorHash, reflection.authorName)
              : undefined
          }
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-nada-surface/70 px-3 py-2">
            <div className="flex items-center gap-2">
              {reflection.deleted ? (
                <span className="text-[12.5px] font-bold text-nada-secondary/50">
                  Removed
                </span>
              ) : (
                <AuthorName
                  className="text-[12.5px]"
                  name={reflection.authorName}
                  onClick={
                    canOpenProfile
                      ? () => onOpenProfile(reflection.authorHash, reflection.authorName)
                      : undefined
                  }
                />
              )}
              {isMine && !reflection.deleted ? (
                <span className="shrink-0 rounded-full bg-nada-accent/12 px-1.5 py-0.5 text-[9px] font-bold text-nada-accent">
                  You
                </span>
              ) : null}
              <span className="shrink-0 text-[10px] text-nada-secondary/45">
                · {formatRelativeTime(reflection.createdAt)}
              </span>
            </div>
            {reflection.deleted ? (
              <p className="mt-0.5 text-[13px] italic leading-relaxed text-nada-secondary/45">
                This reflection was deleted.
              </p>
            ) : (
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-nada-primary/90">
                {reflection.replyToName &&
                !reflection.body
                  .toLowerCase()
                  .startsWith(`@${reflection.replyToName.toLowerCase()}`) ? (
                  <>
                    <span className="font-semibold text-nada-accent">
                      @{reflection.replyToName}
                    </span>{" "}
                  </>
                ) : null}
                <TaggedText
                  mentions={reflection.mentions}
                  onOpenProfile={onOpenProfile}
                  text={reflection.body}
                />
              </p>
            )}
          </div>

          {/* Reply / like / delete row */}
          {!reflection.deleted ? (
            <div className="mt-1 flex items-center gap-1 pl-1">
              <button
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold transition",
                  reflection.likedByMe
                    ? "text-nada-accent"
                    : "text-nada-secondary/55 hover:bg-nada-surface/70 hover:text-nada-primary"
                )}
                aria-pressed={reflection.likedByMe}
                onClick={() => onToggleLike(reflection)}
                type="button"
              >
                <Heart
                  size={12}
                  className={reflection.likedByMe ? "fill-nada-accent" : ""}
                />
                {reflection.likeCount > 0 ? (
                  <span className="tabular-nums">{reflection.likeCount}</span>
                ) : (
                  "Like"
                )}
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-nada-secondary/55 transition hover:bg-nada-surface/70 hover:text-nada-primary"
                onClick={() => onReply(reflection)}
                type="button"
              >
                <CornerDownRight size={12} />
                Reply
              </button>
              {isMine ? (
                <button
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-nada-secondary/55 transition hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => onDelete(reflection)}
                  type="button"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Inline nested-reply composer */}
          {replyingToId === reflection.id && !reflection.deleted ? (
            <div className="mt-1.5">
              <ReflectionComposer
                autoFocus
                onCancel={onCancelReply}
                onSearchMentions={onSearchMentions}
                onSubmit={(body, mentions) => onSubmitReply(reflection, body, mentions)}
                placeholder="Reply to this reflection..."
                replyToName={reflection.authorName}
              />
            </div>
          ) : null}

          {/* Collapse / expand nested replies */}
          {children.length > 0 ? (
            <button
              aria-expanded={!isCollapsed}
              className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-nada-accent transition hover:bg-nada-accent/10"
              onClick={() => onToggleCollapse(reflection.id)}
              type="button"
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              {isCollapsed
                ? `Show ${children.length} ${children.length === 1 ? "reply" : "replies"}`
                : `Hide ${children.length === 1 ? "reply" : "replies"}`}
            </button>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {children.length > 0 && !isCollapsed ? (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
          >
            {children.map((child) => (
              <ReflectionNode
                childrenOf={childrenOf}
                collapsed={collapsed}
                depth={depth + 1}
                key={child.id}
                myPubkeyHash={myPubkeyHash}
                onCancelReply={onCancelReply}
                onDelete={onDelete}
                onOpenProfile={onOpenProfile}
                onReply={onReply}
                onSearchMentions={onSearchMentions}
                onSubmitReply={onSubmitReply}
                onToggleCollapse={onToggleCollapse}
                onToggleLike={onToggleLike}
                reflection={child}
                replyingToId={replyingToId}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ThreadSkeleton(): JSX.Element {
  return (
    <div aria-hidden className="space-y-2 py-2">
      {[0, 1, 2].map((index) => (
        <div className="flex items-start gap-2.5" key={index}>
          <div className="h-8 w-8 shrink-0 rounded-xl nada-skeleton" />
          <div className="min-w-0 flex-1 space-y-1.5 rounded-2xl bg-nada-surface/50 px-3 py-2">
            <div className="h-2.5 w-1/4 rounded nada-skeleton" />
            <div className="h-2.5 w-3/4 rounded nada-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EchoSkeleton(): JSX.Element {
  return (
    <div
      aria-hidden
      className="rounded-3xl border border-nada-border/10 bg-nada-surface-elevated/40 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-2xl nada-skeleton" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <div className="h-3 w-1/3 rounded nada-skeleton" />
          <div className="h-2.5 w-1/4 rounded nada-skeleton" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded nada-skeleton" />
        <div className="h-3 w-2/3 rounded nada-skeleton" />
      </div>
    </div>
  );
}

export type WhisperThreadMeta = {
  hasMore: boolean;
  loaded: boolean;
  loading: boolean;
};

function EchoCard({
  echo,
  isMine,
  isExpanded,
  isFocused,
  myPubkeyHash,
  threadMeta,
  onToggleEcho,
  onToggleReflections,
  onSubmitReflection,
  onToggleReflectionLike,
  onDeleteReflection,
  onLoadOlderReplies,
  onOpenProfile,
  onRipple,
  onDelete,
  onReport,
  onSearchMentions
}: {
  echo: WhisperEcho;
  isMine: boolean;
  isExpanded: boolean;
  isFocused: boolean;
  myPubkeyHash: string;
  threadMeta: WhisperThreadMeta | undefined;
  onToggleEcho: () => void;
  onToggleReflections: () => void;
  onSubmitReflection: (
    body: string,
    mentions: WhisperMention[],
    parent?: { parentId: string; replyToName: string }
  ) => void;
  onToggleReflectionLike: (reflection: WhisperReflection) => void;
  onDeleteReflection: (reflection: WhisperReflection) => void;
  onLoadOlderReplies: () => void;
  onOpenProfile: (authorHash: string, authorName: string) => void;
  onRipple: () => void;
  onDelete: () => void;
  onReport: () => void;
  onSearchMentions: MentionSearch | undefined;
}): JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [replyingToId, setReplyingToId] = useState<string | null>(null);

  const { childrenOf, roots } = useMemo(
    () => buildThread(echo.reflections),
    [echo.reflections]
  );
  const canOpenAuthorProfile = Boolean(echo.authorHash);
  const reflectionCount = Math.max(echo.reflectionCount, 0);

  const toggleCollapse = (id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitNestedReply = (
    parent: WhisperReflection,
    body: string,
    mentions: WhisperMention[]
  ): void => {
    onSubmitReflection(body, mentions, {
      parentId: parent.id,
      replyToName: parent.authorName
    });
    setReplyingToId(null);
  };

  return (
    <motion.article
      layout
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-3xl border border-nada-border/10 bg-nada-surface-elevated/40 p-4 transition-shadow",
        isFocused && "ring-2 ring-nada-accent/60 shadow-accent-glow"
      )}
      initial={{ opacity: 0, y: 10 }}
    >
      <div className="flex items-start gap-3">
        <AuthorAvatar
          name={echo.authorName}
          onClick={
            canOpenAuthorProfile
              ? () => onOpenProfile(echo.authorHash, echo.authorName)
              : undefined
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AuthorName
              className="text-[14px]"
              name={echo.authorName}
              onClick={
                canOpenAuthorProfile
                  ? () => onOpenProfile(echo.authorHash, echo.authorName)
                  : undefined
              }
            />
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
          aria-label={isMine ? "Delete Echo" : "Report Echo"}
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
          <TaggedText mentions={echo.mentions} onOpenProfile={onOpenProfile} text={echo.body} />
        </p>
      ) : null}

      {echo.media?.length ? (
        <div className="mt-3">
          <EchoMediaGallery media={echo.media} />
        </div>
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
          {echo.rippleOf.body ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-nada-text-muted">
              {echo.rippleOf.body}
            </p>
          ) : null}
          {echo.rippleOf.media?.length ? (
            <div className="mt-2">
              <EchoMediaGallery compact media={echo.rippleOf.media} />
            </div>
          ) : null}
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
          aria-pressed={echo.echoedByMe}
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
          aria-expanded={isExpanded}
          onClick={onToggleReflections}
          type="button"
        >
          <MessageCircle size={16} />
          Reflect
          {reflectionCount > 0 ? (
            <span className="tabular-nums">{reflectionCount}</span>
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
            <div className="mt-3 space-y-1">
              {threadMeta?.loading && roots.length === 0 ? (
                <ThreadSkeleton />
              ) : roots.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-nada-border/10 px-3 py-4 text-center text-[12px] text-nada-text-muted">
                  No reflections yet. Be the first to reflect.
                </p>
              ) : (
                <div>
                  {roots.map((reflection) => (
                    <ReflectionNode
                      childrenOf={childrenOf}
                      collapsed={collapsed}
                      depth={0}
                      key={reflection.id}
                      myPubkeyHash={myPubkeyHash}
                      onCancelReply={() => setReplyingToId(null)}
                      onDelete={onDeleteReflection}
                      onOpenProfile={onOpenProfile}
                      onReply={(target) =>
                        setReplyingToId((current) =>
                          current === target.id ? null : target.id
                        )
                      }
                      onSearchMentions={onSearchMentions}
                      onSubmitReply={submitNestedReply}
                      onToggleCollapse={toggleCollapse}
                      onToggleLike={onToggleReflectionLike}
                      reflection={reflection}
                      replyingToId={replyingToId}
                    />
                  ))}
                </div>
              )}

              {threadMeta?.hasMore ? (
                <button
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-nada-border/10 px-3 py-2 text-[12px] font-bold text-nada-accent transition hover:bg-nada-accent/10 disabled:opacity-50"
                  disabled={threadMeta.loading}
                  onClick={onLoadOlderReplies}
                  type="button"
                >
                  {threadMeta.loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Show older reflections
                </button>
              ) : null}

              <div className="pt-1.5">
                <ReflectionComposer
                  onSearchMentions={onSearchMentions}
                  onSubmit={(body, mentions) => onSubmitReflection(body, mentions)}
                  placeholder="Add a reflection..."
                />
              </div>
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
  feedHasMore = false,
  feedLoadingMore = false,
  feedSyncing = false,
  focusedEchoId = null,
  threadMeta,
  onClearFocusedEcho,
  onDeleteEcho,
  onDeleteReflection,
  onLoadMoreFeed,
  onLoadThread,
  onOpenProfile,
  onPostEcho,
  onSearchMentions,
  onUploadMedia,
  onToggleEcho,
  onAddReflection,
  onToggleReflectionLike,
  onRipple,
  onReportEcho
}: {
  echoes: WhisperEcho[];
  identity: IdentityRecord;
  displayName: string;
  feedHasMore?: boolean;
  feedLoadingMore?: boolean;
  feedSyncing?: boolean;
  focusedEchoId?: string | null;
  threadMeta: Record<string, WhisperThreadMeta>;
  onClearFocusedEcho?: () => void;
  onDeleteEcho: (echoId: string) => void;
  onDeleteReflection: (echoId: string, reflectionId: string) => void;
  onLoadMoreFeed?: () => void;
  onLoadThread: (echoId: string, before?: number) => void;
  onOpenProfile: (authorHash: string, authorName: string) => void;
  onPostEcho: (body: string, mentions: WhisperMention[], media: WhisperMedia[]) => void;
  /** Suggestions for the "@" tag picker; absent disables tagging. */
  onSearchMentions?: MentionSearch;
  /**
   * Uploads one attachment, reporting bytes sent; absent disables media —
   * attachments need the relay, so a feed without one is text-only.
   */
  onUploadMedia?: (
    item: PreparedWhisperMedia,
    onProgress: (loaded: number) => void
  ) => Promise<WhisperMedia>;
  onToggleEcho: (echoId: string) => void;
  onAddReflection: (
    echoId: string,
    body: string,
    mentions: WhisperMention[],
    parent?: { parentId: string; replyToName: string }
  ) => void;
  onToggleReflectionLike: (echoId: string, reflection: WhisperReflection) => void;
  onRipple: (echoId: string) => void;
  onReportEcho: (echo: WhisperEcho) => void;
}): JSX.Element {
  const [draft, setDraft] = useState("");
  const echoPicker = useMentionPicker<HTMLTextAreaElement>({
    maxLength: ECHO_MAX_LENGTH,
    search: onSearchMentions,
    setText: setDraft,
    text: draft
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "echo"; echoId: string; title: string }
    | { kind: "reflection"; echoId: string; reflectionId: string; hasReplies: boolean }
    | null
  >(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const sorted = useMemo(
    () => [...echoes].sort((a, b) => b.createdAt - a.createdAt),
    [echoes]
  );

  const expandThread = (echoId: string): void => {
    setExpandedId(echoId);
    const meta = threadMeta[echoId];
    if (!meta?.loaded && !meta?.loading) onLoadThread(echoId);
  };

  // Deep link from a notification: scroll the Echo into view, open its
  // thread, and pulse a highlight ring so the eye lands in the right place.
  useEffect(() => {
    if (!focusedEchoId) return;
    const target = sorted.find((echo) => echo.id === focusedEchoId);
    if (!target) return;
    expandThread(focusedEchoId);
    const node = cardRefs.current.get(focusedEchoId);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timeout = window.setTimeout(() => onClearFocusedEcho?.(), 2600);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedEchoId, sorted.length]);

  // ── Attachments ──────────────────────────────────────────────────────────
  const mediaEnabled = Boolean(onUploadMedia);
  const [attachments, setAttachments] = useState<PreparedWhisperMedia[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [upload, setUpload] = useState<{ loaded: number; total: number } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [canRecord, setCanRecord] = useState(false);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const preparingRef = useRef(0);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  // Files an earlier attempt already uploaded before a later one failed, so
  // retrying does not send (and store) them twice.
  const uploadedRef = useRef(new Map<string, WhisperMedia>());
  const uploading = upload !== null;

  useEffect(() => {
    setCanRecord(voiceRecordingSupported());
    return () => {
      for (const item of attachmentsRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  const addFiles = useCallback(
    async (files: File[], hint: { duration?: number } = {}): Promise<void> => {
      if (!mediaEnabled || files.length === 0) return;
      setMediaError(null);
      const room = WHISPER_MAX_MEDIA - attachmentsRef.current.length - preparingRef.current;
      const accepted = files.slice(0, Math.max(0, room));
      if (accepted.length < files.length) {
        setMediaError(`An Echo can carry up to ${WHISPER_MAX_MEDIA} files.`);
      }
      if (accepted.length === 0) return;

      preparingRef.current += accepted.length;
      setPreparing(preparingRef.current);
      const results = await Promise.allSettled(accepted.map(prepareWhisperMedia));
      preparingRef.current -= accepted.length;
      setPreparing(preparingRef.current);

      const ready: PreparedWhisperMedia[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const item = result.value;
          ready.push(hint.duration && !item.duration ? { ...item, duration: hint.duration } : item);
        } else {
          setMediaError(
            result.reason instanceof WhisperMediaError
              ? result.reason.message
              : `"${accepted[index]!.name}" couldn't be attached.`
          );
        }
      });
      if (ready.length > 0) setAttachments((current) => [...current, ...ready]);
    },
    [mediaEnabled]
  );

  const removeAttachment = (localId: string): void => {
    const item = attachmentsRef.current.find((candidate) => candidate.localId === localId);
    if (item) URL.revokeObjectURL(item.previewUrl);
    uploadedRef.current.delete(localId);
    setAttachments((current) => current.filter((candidate) => candidate.localId !== localId));
    setMediaError(null);
  };

  const recorder = useVoiceRecorder(
    useCallback(
      (file: File, seconds: number) => void addFiles([file], { duration: seconds }),
      [addFiles]
    ),
    useCallback((message: string) => setMediaError(message), [])
  );

  const slotsLeft = WHISPER_MAX_MEDIA - attachments.length - preparing;
  const canPost =
    (draft.trim().length > 0 || attachments.length > 0) &&
    !uploading &&
    preparing === 0 &&
    !recorder.recording;

  const acceptsDraggedFiles = (event: DragEvent): boolean =>
    mediaEnabled && !uploading && Array.from(event.dataTransfer.types).includes("Files");

  const submitEcho = async (): Promise<void> => {
    const body = draft.trim();
    if (!canPost) return;
    const mentions = echoPicker.tagged;
    const media: WhisperMedia[] = [];
    if (attachments.length > 0) {
      if (!onUploadMedia) return;
      const total = attachments.reduce((sum, item) => sum + item.file.size, 0);
      let sent = 0;
      setMediaError(null);
      setUpload({ loaded: 0, total });
      try {
        for (const item of attachments) {
          let uploaded = uploadedRef.current.get(item.localId);
          if (!uploaded) {
            const before = sent;
            uploaded = await onUploadMedia(item, (loaded) =>
              setUpload({ loaded: before + Math.min(loaded, item.file.size), total })
            );
            uploadedRef.current.set(item.localId, uploaded);
          }
          sent += item.file.size;
          setUpload({ loaded: sent, total });
          media.push(uploaded);
        }
      } catch (error) {
        setMediaError(
          error instanceof WhisperMediaError ? error.message : "Upload failed. Try again."
        );
        setUpload(null);
        return;
      }
      setUpload(null);
    }
    onPostEcho(body, mentions, media);
    setDraft("");
    echoPicker.reset();
    for (const item of attachments) URL.revokeObjectURL(item.previewUrl);
    uploadedRef.current.clear();
    setAttachments([]);
  };

  const requestDeleteReflection = (echoId: string, reflection: WhisperReflection): void => {
    setPendingDelete({
      echoId,
      hasReplies: reflection.replyCount > 0,
      kind: "reflection",
      reflectionId: reflection.id
    });
  };

  const confirmPendingDelete = (): void => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "echo") {
      onDeleteEcho(pendingDelete.echoId);
    } else {
      onDeleteReflection(pendingDelete.echoId, pendingDelete.reflectionId);
    }
    setPendingDelete(null);
  };

  const olderReplyCursor = (echo: WhisperEcho): number | undefined => {
    const roots = echo.reflections.filter(
      (reflection) =>
        !reflection.parentId ||
        !echo.reflections.some((item) => item.id === reflection.parentId)
    );
    if (roots.length === 0) return undefined;
    return Math.min(...roots.map((reflection) => reflection.createdAt));
  };

  return (
    <div
      className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in"
      onDragEnter={(event) => {
        if (!acceptsDraggedFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        if (!acceptsDraggedFiles(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDragOver={(event) => {
        if (!acceptsDraggedFiles(event)) return;
        // Without this the browser would open the dropped file in place of NADA.
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (!acceptsDraggedFiles(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragActive(false);
        void addFiles(Array.from(event.dataTransfer.files));
        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }}
    >
      <AnimatePresence>
        {dragActive ? (
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden
            className="pointer-events-none fixed inset-0 z-overlay grid place-items-center bg-nada-surface/70 p-6 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-nada-accent/60 bg-nada-surface-elevated/90 px-10 py-8 text-center shadow-accent-glow">
              <UploadCloud className="text-nada-accent" size={32} />
              <p className="text-[15px] font-bold text-nada-primary">Drop to add to your Echo</p>
              <p className="text-[12px] text-nada-text-muted">
                Photos, GIFs, video or audio · up to {WHISPER_MAX_MEDIA}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="nada-premium-card mb-5 p-5">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-nada-accent/14 text-nada-accent">
          <Waves size={24} />
        </div>
        <p className="text-[11px] font-bold uppercase text-nada-accent">Whispers</p>
        <h2 className="mt-1 text-[20px] font-bold text-nada-primary">
          One feed. Everyone on NADA.
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-nada-text-muted">
          Post an Echo and everyone on NADA can see it — no real names, no phone
          numbers. Reflect, Ripple, and Echo the whispers you like.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="nada-privacy-chip">
            <Globe size={11} className="mr-1 inline" /> Public feed
          </span>
          <span className="nada-privacy-chip">Anonymous profile</span>
          <span className="nada-privacy-chip">Ghosts, not followers</span>
        </div>
      </div>

      {/* Composer — anybody can post anything */}
      <div
        className="mb-5 rounded-3xl border border-nada-border/10 bg-nada-surface-elevated/40 p-4"
        ref={composerRef}
      >
        <div className="flex items-start gap-3">
          <AuthorAvatar name={displayName.trim() || "You"} />
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              void submitEcho();
            }}
          >
            <textarea
              {...echoPicker.inputProps}
              aria-label="Whisper something to everyone"
              className="nada-input-dark min-h-[64px] w-full resize-none px-4 py-3 text-[14px]"
              maxLength={ECHO_MAX_LENGTH}
              onChange={echoPicker.handleChange}
              onKeyDown={(event) => {
                echoPicker.handleKeyDown(event);
              }}
              onPaste={(event) => {
                if (!mediaEnabled || uploading) return;
                const files = Array.from(event.clipboardData.files);
                if (files.length === 0) return;
                event.preventDefault();
                void addFiles(files);
              }}
              placeholder={
                onSearchMentions
                  ? "Whisper something to everyone... type @ to tag a ghost"
                  : "Whisper something to everyone..."
              }
              readOnly={uploading}
              value={draft}
            />
            <MentionSuggestions state={echoPicker.suggestions} />
            <AttachmentTray
              disabled={uploading}
              items={attachments}
              onRemove={removeAttachment}
              preparing={preparing}
            />
            {recorder.recording ? (
              <RecordingBar
                onCancel={recorder.cancel}
                onStop={recorder.stop}
                seconds={recorder.seconds}
              />
            ) : null}
            {upload ? (
              <div className="mt-2" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded-full bg-nada-surface/80">
                  <div
                    className="h-full rounded-full bg-nada-accent transition-[width] duration-200"
                    style={{
                      width: `${upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0}%`
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-nada-secondary/60">
                  Uploading{" "}
                  {upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0}%
                </p>
              </div>
            ) : null}
            {mediaError ? (
              <p className="mt-2 text-[12px] font-medium text-red-300" role="alert">
                {mediaError}
              </p>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                {mediaEnabled ? (
                  <>
                    <button
                      aria-label="Add photos, video or audio"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-nada-secondary/70 transition hover:bg-nada-surface/70 hover:text-nada-accent disabled:opacity-35 disabled:hover:bg-transparent"
                      disabled={uploading || recorder.recording || slotsLeft <= 0}
                      onClick={() => fileInputRef.current?.click()}
                      title="Add photos, video or audio"
                      type="button"
                    >
                      <ImagePlus size={18} />
                    </button>
                    {canRecord ? (
                      <button
                        aria-label="Record audio"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-nada-secondary/70 transition hover:bg-nada-surface/70 hover:text-nada-accent disabled:opacity-35 disabled:hover:bg-transparent"
                        disabled={uploading || recorder.recording || slotsLeft <= 0}
                        onClick={() => void recorder.start()}
                        title="Record audio"
                        type="button"
                      >
                        <Mic size={18} />
                      </button>
                    ) : null}
                    <input
                      accept={WHISPER_MEDIA_ACCEPT}
                      aria-hidden
                      className="hidden"
                      data-testid="echo-media-input"
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.currentTarget.files ?? []);
                        // Clear it so picking the same file again still fires.
                        event.currentTarget.value = "";
                        void addFiles(files);
                      }}
                      ref={fileInputRef}
                      tabIndex={-1}
                      type="file"
                    />
                  </>
                ) : null}
                <span className="ml-1 text-[11px] text-nada-secondary/45">
                  {draft.length}/{ECHO_MAX_LENGTH}
                </span>
              </div>
              <button
                className="nada-btn-gold inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-[13px] font-bold disabled:opacity-45"
                disabled={!canPost}
                type="submit"
              >
                {uploading ? (
                  <Loader2 className="animate-spin" size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
                {uploading ? "Posting" : "Echo"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <section className="grid gap-3">
        {sorted.length === 0 && feedSyncing ? (
          <>
            <EchoSkeleton />
            <EchoSkeleton />
            <EchoSkeleton />
          </>
        ) : sorted.length === 0 ? (
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
              <div
                key={echo.id}
                ref={(node) => {
                  if (node) cardRefs.current.set(echo.id, node);
                  else cardRefs.current.delete(echo.id);
                }}
              >
                <EchoCard
                  echo={echo}
                  isExpanded={expandedId === echo.id}
                  isFocused={focusedEchoId === echo.id}
                  isMine={echo.authorHash === identity.pubkeyHash}
                  myPubkeyHash={identity.pubkeyHash}
                  threadMeta={threadMeta[echo.id]}
                  onDelete={() =>
                    setPendingDelete({
                      echoId: echo.id,
                      kind: "echo",
                      title:
                        echo.body.slice(0, 64) ||
                        describeEchoMedia(echo.media) ||
                        "Ripple"
                    })
                  }
                  onDeleteReflection={(reflection) =>
                    requestDeleteReflection(echo.id, reflection)
                  }
                  onLoadOlderReplies={() =>
                    onLoadThread(echo.id, olderReplyCursor(echo))
                  }
                  onOpenProfile={onOpenProfile}
                  onReport={() => onReportEcho(echo)}
                  onRipple={() => onRipple(echo.id)}
                  onSearchMentions={onSearchMentions}
                  onSubmitReflection={(body, mentions, parent) =>
                    onAddReflection(echo.id, body, mentions, parent)
                  }
                  onToggleEcho={() => onToggleEcho(echo.id)}
                  onToggleReflectionLike={(reflection) =>
                    onToggleReflectionLike(echo.id, reflection)
                  }
                  onToggleReflections={() => {
                    if (expandedId === echo.id) setExpandedId(null);
                    else expandThread(echo.id);
                  }}
                />
              </div>
            ))}
          </AnimatePresence>
        )}

        {sorted.length > 0 && feedHasMore && onLoadMoreFeed ? (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-nada-border/10 bg-nada-surface-elevated/40 px-4 py-3 text-[13px] font-bold text-nada-accent transition hover:bg-nada-accent/10 disabled:opacity-50"
            disabled={feedLoadingMore}
            onClick={onLoadMoreFeed}
            type="button"
          >
            {feedLoadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {feedLoadingMore ? "Loading older Echoes..." : "Show older Echoes"}
          </button>
        ) : null}
      </section>

      <AnimatePresence>
        {pendingDelete ? (
          <ConfirmActionDialog
            confirmLabel="Delete"
            copy={
              pendingDelete.kind === "echo"
                ? "Delete this Echo? It disappears from the global feed for everyone, along with all of its reflections."
                : pendingDelete.hasReplies
                  ? "Delete this reflection? It has replies, so it will show as removed to keep the conversation intact."
                  : "Delete this reflection? This can't be undone."
            }
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmPendingDelete}
            {...(pendingDelete.kind === "echo"
              ? { subtitle: pendingDelete.title }
              : {})}
            title={pendingDelete.kind === "echo" ? "Delete Echo" : "Delete reflection"}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
