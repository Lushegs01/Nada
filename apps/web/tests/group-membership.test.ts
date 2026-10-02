import { describe, expect, it } from "vitest";

import {
  judgeGroupMessage,
  keysToTry,
  type GroupKeyState,
  type GroupMessageFacts,
  type KeyCandidate
} from "../src/lib/group-membership";

const owner = "o".repeat(64);
const member = "m".repeat(64);
const joiner = "j".repeat(64);
const stranger = "s".repeat(64);

// The group is at epoch 3: K1 and K2 are history, K3 is current.
const state: GroupKeyState = {
  currentEpoch: 3,
  currentKey: "K3",
  heldKeys: new Map([
    [1, "K1"],
    [2, "K2"],
    [3, "K3"]
  ]),
  members: [owner, member],
  owner
};

/** Plays a message through the rule, where `openable` says which key truly encrypted it. */
function verdict(
  message: GroupMessageFacts,
  openable: string,
  options: { ownerMembers?: string[]; senderKeyKnown?: boolean } = {}
) {
  const candidates = keysToTry(state, message);
  const openedWith: KeyCandidate | null =
    candidates.find((candidate) => candidate.key === openable) ?? null;
  return {
    openedWith,
    ...judgeGroupMessage(state, message, openedWith, {
      senderKeyKnown: options.senderKeyKnown ?? true,
      ...(options.ownerMembers ? { ownerMembers: options.ownerMembers } : {})
    })
  };
}

describe("joining through an invite link", () => {
  it("admits someone writing under the current key", () => {
    const result = verdict({ carriedKey: undefined, epoch: 3, sender: joiner }, "K3");
    expect(result).toMatchObject({ accept: true, admitSender: true });
  });

  it("admits a joiner whose old-format link filed the current key as epoch 1", () => {
    // Links never said which epoch their key was. Someone who joined after a
    // reset labels the current key "epoch 1"; the current key still opens it.
    const result = verdict({ carriedKey: undefined, epoch: 1, sender: joiner }, "K3");
    expect(result.openedWith).toMatchObject({ key: "K3" });
    expect(result).toMatchObject({ accept: true, admitSender: true });
  });

  it("keeps out — and does not show — someone writing under a key the owner has reset", () => {
    const result = verdict({ carriedKey: undefined, epoch: 2, sender: stranger }, "K2");
    expect(result.openedWith).toMatchObject({ key: "K2" });
    expect(result).toMatchObject({ accept: false, admitSender: false });
  });

  it("shows but does not admit a writer whose identity key it cannot verify", () => {
    // Admitting them would mean sending them the group key in the clear.
    const result = verdict({ carriedKey: undefined, epoch: 3, sender: joiner }, "K3", {
      senderKeyKnown: false
    });
    expect(result).toMatchObject({ accept: true, admitSender: false });
  });

  it("still shows a member's late message from an older epoch", () => {
    const result = verdict({ carriedKey: undefined, epoch: 2, sender: member }, "K2");
    expect(result).toMatchObject({ accept: true, admitSender: false });
  });
});

describe("taking over the group key", () => {
  it("never lets a non-owner introduce a new epoch", () => {
    // A past member mints epoch 4, seals it to everyone and writes under it.
    // Accepting it would hand them every message sent afterwards.
    for (const sender of [stranger, member]) {
      const message = { carriedKey: "EVIL", epoch: 4, sender };
      expect(keysToTry(state, message).map((c) => c.key)).not.toContain("EVIL");
      const result = verdict(message, "EVIL");
      expect(result.openedWith).toBeNull();
      expect(result.adopt).toBeUndefined();
    }
  });

  it("never overwrites a key it already holds, even from the owner", () => {
    const message = { carriedKey: "EVIL", epoch: 3, sender: owner };
    expect(keysToTry(state, message).map((c) => c.key)).toEqual(["K3"]);
    expect(verdict(message, "EVIL")).toMatchObject({ accept: true, openedWith: null });
  });

  it("does not show a stranger's message it cannot open", () => {
    expect(
      verdict({ carriedKey: undefined, epoch: 3, sender: stranger }, "nothing")
    ).toMatchObject({
      accept: false
    });
  });
});

describe("the owner resetting the key", () => {
  it("moves the group to the owner's new key and member list", () => {
    const result = verdict({ carriedKey: "K4", epoch: 4, sender: owner }, "K4", {
      ownerMembers: [member]
    });
    expect(result).toMatchObject({
      accept: true,
      adopt: { epoch: 4, key: "K4" },
      members: [member, owner]
    });
  });

  it("keeps the local member list when a reset names none", () => {
    const result = verdict({ carriedKey: "K4", epoch: 4, sender: owner }, "K4");
    expect(result.adopt).toEqual({ epoch: 4, key: "K4" });
    expect(result.members).toBeUndefined();
  });

  it("ignores a member list from anyone but the owner, or outside a reset", () => {
    expect(
      verdict({ carriedKey: undefined, epoch: 3, sender: member }, "K3", {
        ownerMembers: [member]
      }).members
    ).toBeUndefined();
    expect(
      verdict({ carriedKey: undefined, epoch: 3, sender: owner }, "K3", {
        ownerMembers: [owner]
      }).members
    ).toBeUndefined();
  });
});
