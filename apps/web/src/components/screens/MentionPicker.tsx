"use client";
// The "@" tag picker shared by the Echo and Reflection composers.
//
// `useMentionPicker` owns everything about tagging in one text field: which
// "@query" is being typed, the suggestions for it, keyboard selection, and the
// list of ghosts picked so far. The composer keeps owning its text and passes
// the picker's handlers to its input. `MentionSuggestions` renders the list in
// a portal with fixed positioning, because the Reflection composer sits inside
// an overflow-hidden thread that would clip anything positioned within it.
import {
  activeMentionQuery,
  insertMention,
  rememberMention,
  type MentionQuery
} from "@/lib/mention-draft";
import type { WhisperMention, WhisperMentionCandidate } from "@/utils/dashboard-types";
import { WHISPER_MAX_MENTIONS, mentionsInText } from "@nada/types";
import { cn } from "@nada/ui";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from "react";
import { createPortal } from "react-dom";
import { AuthorAvatar } from "./AuthorAvatar";

/** Suggestions for the text typed after "@" (empty: the viewer's connections). */
export type MentionSearch = (query: string) => Promise<WhisperMentionCandidate[]>;

type TextField = HTMLInputElement | HTMLTextAreaElement;

const SEARCH_DEBOUNCE_MS = 120;

export interface MentionPicker<T extends TextField> {
  /** The text field's change handler: updates the text and the active query. */
  handleChange: (event: ChangeEvent<T>) => void;
  /** Call first from the field's onKeyDown; true means the picker used the key. */
  handleKeyDown: (event: KeyboardEvent<T>) => boolean;
  /** Spread onto the text field. */
  inputProps: {
    "aria-activedescendant": string | undefined;
    "aria-autocomplete": "list";
    "aria-controls": string | undefined;
    "aria-expanded": boolean;
    onBlur: () => void;
    onSelect: () => void;
    ref: (node: T | null) => void;
    role: "combobox";
  };
  /**
   * What the post tags: ghosts picked from the list whose "@name" is still in
   * the text, in the order they appear. Deleting a tag's text untags them;
   * typing a name by hand never tags anyone.
   */
  tagged: WhisperMention[];
  /** Forget picks after the post is sent. */
  reset: () => void;
  /** Everything the suggestion list needs. */
  suggestions: MentionSuggestionsState;
}

export interface MentionSuggestionsState {
  activeIndex: number;
  anchor: TextField | null;
  atLimit: boolean;
  candidates: WhisperMentionCandidate[];
  choose: (candidate: WhisperMentionCandidate) => void;
  listId: string;
  open: boolean;
  setActiveIndex: (index: number) => void;
}

export function useMentionPicker<T extends TextField>({
  maxLength,
  search,
  setText,
  text
}: {
  maxLength: number;
  /** Absent when tagging is unavailable; the field then behaves as before. */
  search: MentionSearch | undefined;
  setText: (text: string) => void;
  text: string;
}): MentionPicker<T> {
  const [anchor, setAnchor] = useState<T | null>(null);
  const [chosen, setChosen] = useState<WhisperMention[]>([]);
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [candidates, setCandidates] = useState<WhisperMentionCandidate[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  // Escape closes the picker for the "@" it was opened on, not for good.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const blurTimer = useRef<number | null>(null);
  // Where the caret goes once a pick's text is on screen.
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();

  // Runs right after React writes the new value, before the browser handles
  // another keystroke. Writing a value moves the caret to the end, so waiting
  // any longer (a frame, a timeout) lets fast typing land after the text and
  // then jumps the caret back into the middle of it.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !anchor) return;
    pendingCaret.current = null;
    anchor.focus();
    anchor.setSelectionRange(caret, caret);
  }, [anchor, text]);

  const syncQuery = useCallback(
    (value: string, caret: number | null, selectionEnd: number | null): void => {
      if (!search || caret === null || caret !== selectionEnd) {
        setQuery(null);
        return;
      }
      const next = activeMentionQuery(value, caret, chosen);
      setQuery((current) =>
        current && next && current.start === next.start && current.query === next.query
          ? current
          : next
      );
      if (!next) setDismissedAt(null);
    },
    [chosen, search]
  );

  const tagged = mentionsInText(text, chosen);
  const atLimit = tagged.length >= WHISPER_MAX_MENTIONS;
  const searching = Boolean(search && query && query.start !== dismissedAt && !atLimit);

  useEffect(() => {
    if (!searching || !search || !query) {
      setCandidates([]);
      return;
    }
    let current = true;
    const timer = window.setTimeout(
      () => {
        void search(query.query).then((found) => {
          if (!current) return;
          setCandidates(found);
          setActiveIndex(0);
        });
      },
      query.query ? SEARCH_DEBOUNCE_MS : 0
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query, search, searching]);

  const open =
    Boolean(query) &&
    query?.start !== dismissedAt &&
    (atLimit || candidates.length > 0);

  const choose = useCallback(
    (candidate: WhisperMentionCandidate): void => {
      if (!query) return;
      const inserted = insertMention(text, query, candidate.displayName, maxLength);
      if (!inserted) return;
      setChosen((current) =>
        rememberMention(current, {
          name: candidate.displayName,
          pubkeyHash: candidate.pubkeyHash
        })
      );
      pendingCaret.current = inserted.caret;
      setText(inserted.text);
      setQuery(null);
      setCandidates([]);
    },
    [maxLength, query, setText, text]
  );

  const handleKeyDown = (event: KeyboardEvent<T>): boolean => {
    // Enter or arrows mid-composition belong to the input method (Japanese,
    // Chinese, Korean…), not to the list.
    if (!open || !query || event.nativeEvent.isComposing) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedAt(query.start);
      return true;
    }
    if (candidates.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + step + candidates.length) % candidates.length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const candidate = candidates[activeIndex];
      if (!candidate) return false;
      event.preventDefault();
      choose(candidate);
      return true;
    }
    return false;
  };

  useEffect(
    () => () => {
      if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    },
    []
  );

  const activeOption =
    open && candidates[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  return {
    handleChange: (event) => {
      const field = event.currentTarget;
      setText(field.value);
      syncQuery(field.value, field.selectionStart, field.selectionEnd);
    },
    handleKeyDown,
    inputProps: {
      "aria-activedescendant": activeOption,
      "aria-autocomplete": "list",
      "aria-controls": open ? listId : undefined,
      "aria-expanded": open,
      // Options keep focus in the field (see MentionSuggestions), so a blur
      // means the writer left. The delay lets a tap that does blur first land.
      onBlur: () => {
        blurTimer.current = window.setTimeout(() => setQuery(null), 150);
      },
      onSelect: () => {
        if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
        if (anchor) syncQuery(anchor.value, anchor.selectionStart, anchor.selectionEnd);
      },
      ref: setAnchor,
      role: "combobox"
    },
    tagged,
    reset: () => {
      setChosen([]);
      setQuery(null);
      setCandidates([]);
    },
    suggestions: {
      activeIndex,
      anchor,
      atLimit,
      candidates,
      choose,
      listId,
      open,
      setActiveIndex
    }
  };
}

interface Placement {
  left: number;
  maxHeight: number;
  width: number;
  top?: number;
  bottom?: number;
}

/** Below the field when it fits above the keyboard, otherwise above it. */
function placeAgainst(anchor: TextField): Placement {
  const rect = anchor.getBoundingClientRect();
  const viewport = window.visualViewport;
  const visibleTop = viewport?.offsetTop ?? 0;
  const visibleBottom = viewport
    ? viewport.offsetTop + viewport.height
    : window.innerHeight;
  const width = Math.min(Math.max(rect.width, 240), 360, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const gap = 6;
  const below = visibleBottom - rect.bottom - gap;
  const above = rect.top - visibleTop - gap;
  if (below >= 200 || below >= above) {
    return { left, maxHeight: Math.max(below - 8, 96), top: rect.bottom + gap, width };
  }
  return {
    bottom: window.innerHeight - rect.top + gap,
    left,
    maxHeight: Math.max(above - 8, 96),
    width
  };
}

export function MentionSuggestions({
  state
}: {
  state: MentionSuggestionsState;
}): JSX.Element | null {
  const {
    activeIndex,
    anchor,
    atLimit,
    candidates,
    choose,
    listId,
    open,
    setActiveIndex
  } = state;
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const update = (): void => setPlacement(placeAgainst(anchor));
    update();
    // Capture: the feed scrolls inside its own container, not the window.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [anchor, open]);

  if (!open || !placement || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-[90] overflow-y-auto rounded-2xl border border-nada-border/10 bg-nada-surface-elevated p-1 shadow-[0_18px_44px_rgba(0,0,0,0.46)]"
      data-testid="mention-suggestions"
      // Keep focus in the text field so the field's caret survives a pick.
      onMouseDown={(event) => event.preventDefault()}
      style={placement}
    >
      {atLimit ? (
        <p className="px-3 py-2.5 text-[12px] text-nada-text-muted">
          You can tag up to {WHISPER_MAX_MENTIONS} ghosts in one post.
        </p>
      ) : (
        <ul aria-label="Ghosts you can tag" id={listId} role="listbox">
          {candidates.map((candidate, index) => (
            <li
              aria-selected={index === activeIndex}
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5",
                index === activeIndex ? "bg-nada-accent/12" : "hover:bg-nada-surface/70"
              )}
              id={`${listId}-${index}`}
              key={candidate.pubkeyHash}
              onClick={() => choose(candidate)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              <AuthorAvatar name={candidate.displayName} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-nada-primary">
                {candidate.displayName}
              </span>
              {candidate.followedByViewer ? (
                <span className="shrink-0 rounded-full bg-nada-accent/12 px-2 py-0.5 text-[10px] font-bold text-nada-accent">
                  Following
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body
  );
}
