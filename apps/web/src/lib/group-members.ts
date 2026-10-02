// Names inside a group chat.
//
// Group members never exchange profiles. A member's name reaches the others
// inside the ciphertext of each message they send (`MessagePayload.senderName`)
// and is remembered per group, on this device only (`ChatPrefRecord.memberNames`).
//
// Every member therefore has two names, and keeping them apart is the point of
// this module:
//
//  - the label *you* see: your own saved contact name if you have one, else the
//    name they gave the group, else their ghost handle;
//  - the name a *tag* shows everyone: the name they gave, else their ghost
//    handle — never your contact name, which is private to you. A tag or a
//    reply quote written with "@Mom" would tell the whole group what you call
//    someone.

/** A name a member gave the group, and when the message carrying it was sent. */
export interface LearnedName {
  at: number;
  name: string;
}

/** pubkeyHash → the latest name that member gave this group. */
export type MemberNames = Record<string, LearnedName>;

/** Longest name kept, matching the message payload's limit. */
const MAX_NAME_LENGTH = 80;

/** A stable name anyone can derive from an identity, for members who gave none. */
export function ghostHandle(pubkeyHash: string): string {
  return `ghost·${pubkeyHash.slice(0, 10)}`;
}

/**
 * `names` with `name` recorded for a member, or null when nothing changes.
 * Messages arrive out of order (offline queues, reconnect replay), so a name
 * from a message older than the one already known never overwrites it.
 */
export function learnMemberName(
  names: MemberNames | undefined,
  pubkeyHash: string,
  name: string,
  at: number
): MemberNames | null {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!clean) return null;
  const known = names?.[pubkeyHash];
  if (known && (known.at > at || known.name === clean)) return null;
  return { ...names, [pubkeyHash]: { at, name: clean } };
}

/** The name a tag of this member shows to everyone in the group. */
export function memberTagName(
  pubkeyHash: string,
  names: MemberNames | undefined
): string {
  return names?.[pubkeyHash]?.name ?? ghostHandle(pubkeyHash);
}

/** What this member is called on your screen. */
export function memberLabel(
  pubkeyHash: string,
  names: MemberNames | undefined,
  contactName?: string
): string {
  return contactName?.trim() || memberTagName(pubkeyHash, names);
}

/** A member the "@" picker can offer. */
export interface GroupMentionCandidate {
  /** Inserted after "@": the name everyone sees. */
  displayName: string;
  /** Your saved contact name for them, when it differs. Shown only to you. */
  hint?: string;
  pubkeyHash: string;
}

function matchesWordStart(value: string, needle: string): boolean {
  const lower = value.toLowerCase();
  return lower.startsWith(needle) || lower.includes(` ${needle}`);
}

/**
 * Members the "@" picker offers for `query`: everyone your message goes to,
 * except you, matched from the start of any word of either their tag name or
 * your contact name for them. Members who have named themselves come first,
 * since their tag reads as a name rather than a handle.
 */
export function groupMentionCandidates({
  contactNames,
  limit = 8,
  me,
  members,
  names,
  query
}: {
  contactNames: Readonly<Record<string, string>>;
  limit?: number;
  me: string;
  members: readonly string[];
  names: MemberNames | undefined;
  query: string;
}): GroupMentionCandidate[] {
  const needle = query.trimStart().toLowerCase();
  const candidates: GroupMentionCandidate[] = [];
  for (const pubkeyHash of new Set(members)) {
    if (pubkeyHash === me) continue;
    const displayName = memberTagName(pubkeyHash, names);
    const contactName = contactNames[pubkeyHash]?.trim();
    if (
      needle &&
      !matchesWordStart(displayName, needle) &&
      !(contactName && matchesWordStart(contactName, needle))
    ) {
      continue;
    }
    candidates.push({
      displayName,
      pubkeyHash,
      ...(contactName && contactName.toLowerCase() !== displayName.toLowerCase()
        ? { hint: contactName }
        : {})
    });
  }
  const named = (candidate: GroupMentionCandidate): number =>
    names?.[candidate.pubkeyHash] ? 1 : 0;
  return candidates
    .sort(
      (a, b) =>
        named(b) - named(a) ||
        (a.hint ?? a.displayName).localeCompare(b.hint ?? b.displayName)
    )
    .slice(0, limit);
}
