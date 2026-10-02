// Tag ("@name" mention) matching, shared by the relay and the web client.
//
// The relay decides which tags a post keeps — a tag must be visible in the
// text, or it would be a notification with nothing on screen to explain it —
// and the client decides what to draw as a tag. Both run this one function,
// so the text a tag notification points at is exactly the text that renders
// as that tag.

/** One tagged ghost, as stored on an Echo or Reflection. */
export interface WhisperMention {
  /** Identity of the tagged ghost; the tag links to their profile. */
  pubkeyHash: string;
  /** Their public display name when they were tagged: the text after "@". */
  name: string;
}

export type MentionSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; mention: WhisperMention };

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}

/**
 * Splits text into plain runs and tags.
 *
 * A tag is "@" followed by a tagged ghost's name, compared case-insensitively.
 * The "@" has to start a word, so an e-mail address is not a tag, and the name
 * cannot be the front of a longer word, so "@Ann" does not tag inside
 * "@Annabel". Longer names are tried first: "@Silent Key 4F2A" is one tag even
 * when someone called "Silent Key" is tagged too.
 *
 * Display names are not unique. When two tagged ghosts share a name, the
 * first "@name" in the text is the first of them in `mentions`, the second the
 * second, and so on — which is why writers send tags in the order they appear.
 */
export function segmentMentions(
  text: string,
  mentions: readonly WhisperMention[]
): MentionSegment[] {
  const byName = new Map<string, WhisperMention[]>();
  for (const mention of mentions) {
    const key = mention.name.toLowerCase();
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(mention);
    byName.set(key, list);
  }
  if (byName.size === 0 || !text.includes("@")) {
    return text ? [{ kind: "text", text }] : [];
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const used = new Map<string, number>();

  const segments: MentionSegment[] = [];
  let plainStart = 0;
  let index = text.indexOf("@");
  while (index !== -1) {
    let matched: { length: number; mention: WhisperMention } | null = null;
    if (!isWordChar(text[index - 1])) {
      for (const name of names) {
        const end = index + 1 + name.length;
        if (text.slice(index + 1, end).toLowerCase() !== name) continue;
        // A name ending in a letter or digit must end the word too.
        if (isWordChar(name[name.length - 1]) && isWordChar(text[end])) continue;
        const candidates = byName.get(name)!;
        const occurrence = used.get(name) ?? 0;
        used.set(name, occurrence + 1);
        matched = {
          length: 1 + name.length,
          mention: candidates[Math.min(occurrence, candidates.length - 1)]!
        };
        break;
      }
    }
    if (matched) {
      if (index > plainStart) {
        segments.push({ kind: "text", text: text.slice(plainStart, index) });
      }
      segments.push({
        kind: "mention",
        mention: matched.mention,
        text: text.slice(index, index + matched.length)
      });
      plainStart = index + matched.length;
      index = text.indexOf("@", plainStart);
    } else {
      index = text.indexOf("@", index + 1);
    }
  }
  if (plainStart < text.length) {
    segments.push({ kind: "text", text: text.slice(plainStart) });
  }
  return segments;
}

/**
 * The tags from `mentions` that actually appear in `text`, once each, in the
 * order they first appear. A writer sends exactly this list; the relay keeps
 * exactly this list.
 */
export function mentionsInText(
  text: string,
  mentions: readonly WhisperMention[]
): WhisperMention[] {
  const seen = new Set<string>();
  const visible: WhisperMention[] = [];
  for (const segment of segmentMentions(text, mentions)) {
    if (segment.kind !== "mention" || seen.has(segment.mention.pubkeyHash)) continue;
    seen.add(segment.mention.pubkeyHash);
    visible.push(segment.mention);
  }
  return visible;
}

/**
 * Reads a stored or received tag list without trusting its shape. Anything
 * malformed is dropped rather than failing the Echo it rides on.
 */
export function parseMentions(raw: unknown): WhisperMention[] {
  if (!Array.isArray(raw)) return [];
  const mentions: WhisperMention[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { name, pubkeyHash } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof pubkeyHash !== "string") continue;
    if (!name || !pubkeyHash) continue;
    mentions.push({ name, pubkeyHash });
  }
  return mentions;
}
