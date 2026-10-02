// Text handling behind the "@" tag picker in the Whispers composers. Kept
// free of React so the parts that are easy to get subtly wrong — when the
// picker opens and what a pick replaces — are unit-tested. What a post sends
// is `mentionsInText` from @nada/types, the same rule the relay applies.
import type { WhisperMention } from "@nada/types";

/** Longest run after "@" still treated as a name being typed. */
const MAX_QUERY_LENGTH = 40;
/** Display names run to a few words; past that the writer has moved on. */
const MAX_QUERY_WORDS = 4;

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** The "@name" being typed at the caret: `text.slice(start, end)` is "@" + query. */
export interface MentionQuery {
  end: number;
  query: string;
  start: number;
}

/**
 * Finds a tag being typed at the caret, or null when there isn't one.
 *
 * The "@" must start a word (so an e-mail address does not open the picker),
 * the query cannot cross a line or start with a space, and a tag that is
 * already complete — "@Bob Ghost " with the caret past it — does not reopen
 * the picker for the same name.
 */
export function activeMentionQuery(
  text: string,
  caret: number,
  chosen: readonly WhisperMention[] = []
): MentionQuery | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start === -1) return null;
  const preceding = before[start - 1];
  if (preceding !== undefined && WORD_CHAR.test(preceding)) return null;

  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY_LENGTH) return null;
  if (query.includes("\n") || query.startsWith(" ")) return null;
  if (query.split(" ").length > MAX_QUERY_WORDS) return null;

  const typed = query.toLowerCase();
  const completed = chosen.some((mention) => {
    const name = mention.name.toLowerCase();
    return typed.length > name.length && typed.startsWith(name);
  });
  if (completed) return null;

  return { end: caret, query, start };
}

/**
 * Replaces the query with "@name " and returns the new text and caret, or
 * null when the result would not fit in `maxLength`.
 */
export function insertMention(
  text: string,
  query: MentionQuery,
  name: string,
  maxLength: number
): { caret: number; text: string } | null {
  const head = text.slice(0, query.start);
  const tail = text.slice(query.end);
  const tag = `@${name}`;
  // Always leave a space after the tag so typing carries on as plain text.
  const separator = tail.startsWith(" ") ? "" : " ";
  const next = `${head}${tag}${separator}${tail}`;
  if (next.length > maxLength) return null;
  return { caret: head.length + tag.length + 1, text: next };
}

/** Adds a pick to the chosen list, once per identity. */
export function rememberMention(
  chosen: readonly WhisperMention[],
  mention: WhisperMention
): WhisperMention[] {
  return chosen.some((item) => item.pubkeyHash === mention.pubkeyHash)
    ? [...chosen]
    : [...chosen, mention];
}
