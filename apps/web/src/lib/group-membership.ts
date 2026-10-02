// Who belongs to a group, and which keys a device accepts for it.
//
// The relay holds no group membership. It delivers a group message to
// whatever recipient list its sender names, and any identity that knows a
// group's id can address one. So each device decides for itself, from what a
// message proves, whether its sender belongs and which keys to trust. The
// rules, and what each one stops:
//
// - A key is never accepted for an epoch this device already holds a key for.
//   Otherwise anyone who knows the group id could overwrite it.
// - A key for a new epoch is accepted only from the group's owner, the one
//   member who can reset the key. Otherwise a past member, or whoever holds a
//   revoked invite link, could mint an epoch, seal it to everyone and read
//   every message sent afterwards.
// - A sender joins by writing under the group's current key: the key a
//   current invite link carries. That is how someone who joined through a
//   link reaches members who never saw them join. A message under an older
//   key admits no one — that is a link the owner has revoked — and from a
//   non-member it is not shown either.
// - When the owner resets the key, the member list sent with it replaces the
//   local one, so nobody goes on sealing the new key to someone the owner
//   removed.

export interface GroupKeyState {
  currentEpoch: number;
  currentKey: string | undefined;
  /** Keys this device holds, by epoch, the current one included. */
  heldKeys: ReadonlyMap<number, string>;
  /** Who this device sends the group to. */
  members: readonly string[];
  /** The member who may reset the key and decide who stays. */
  owner: string | undefined;
}

export interface GroupMessageFacts {
  /** A key the message carries: sealed to this device, or a legacy plaintext one. */
  carriedKey: string | undefined;
  /** The epoch the sender says it encrypted under. Absent on the wire means 1. */
  epoch: number;
  /** The relay-authenticated sender. */
  sender: string;
}

export interface KeyCandidate {
  epoch: number;
  key: string;
  /** "owner": a new epoch's key, carried by the owner's message. */
  source: "held" | "owner";
}

/** The keys worth trying on a message, in order. */
export function keysToTry(
  state: GroupKeyState,
  message: GroupMessageFacts
): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  const add = (candidate: KeyCandidate): void => {
    if (!candidates.some((existing) => existing.key === candidate.key)) {
      candidates.push(candidate);
    }
  };
  const labelled =
    message.epoch === state.currentEpoch
      ? state.currentKey
      : state.heldKeys.get(message.epoch);
  if (labelled) add({ epoch: message.epoch, key: labelled, source: "held" });
  // Invite links never said which epoch their key belongs to, so someone who
  // joined after a reset files the current key as epoch 1 and labels their
  // messages that way. The current key still opens them.
  if (state.currentKey) {
    add({ epoch: state.currentEpoch, key: state.currentKey, source: "held" });
  }
  if (
    message.carriedKey &&
    !labelled &&
    message.sender === state.owner &&
    message.epoch > state.currentEpoch
  ) {
    add({ epoch: message.epoch, key: message.carriedKey, source: "owner" });
  }
  return candidates;
}

export interface GroupMessageVerdict {
  /** Store and show the message. */
  accept: boolean;
  /** Add the sender to the member list. */
  admitSender: boolean;
  /** Start using this key, at this epoch, for the group. */
  adopt?: { epoch: number; key: string };
  /** The owner's member list for a new epoch, replacing the local one. */
  members?: string[];
}

/**
 * What to do with a group message, given the key that opened it (null when
 * none did). `ownerMembers` is the member list a message's payload carries;
 * it counts only on the owner's reset. `senderKeyKnown` says whether the
 * sender's identity key is verified, without which the group key could only
 * reach them in the clear.
 */
export function judgeGroupMessage(
  state: GroupKeyState,
  message: GroupMessageFacts,
  openedWith: KeyCandidate | null,
  options: { ownerMembers?: readonly string[] | undefined; senderKeyKnown: boolean }
): GroupMessageVerdict {
  const isMember =
    message.sender === state.owner || state.members.includes(message.sender);
  if (!openedWith) {
    // A member's message this device cannot open is still shown, as
    // undecryptable, so a gap in the conversation is visible.
    return { accept: isMember, admitSender: false };
  }
  if (openedWith.source === "owner") {
    return {
      accept: true,
      admitSender: false,
      adopt: { epoch: openedWith.epoch, key: openedWith.key },
      ...(options.ownerMembers
        ? { members: [...new Set([...options.ownerMembers, message.sender])] }
        : {})
    };
  }
  if (isMember) return { accept: true, admitSender: false };
  if (openedWith.key === state.currentKey) {
    return { accept: true, admitSender: options.senderKeyKnown };
  }
  return { accept: false, admitSender: false };
}
