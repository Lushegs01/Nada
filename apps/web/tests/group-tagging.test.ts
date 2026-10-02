import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import type { ReplyToMessage, WhisperMention } from "@nada/types";

import {
  getChatPref,
  nadaDb,
  rememberGroupMemberName,
  setChatPref
} from "../src/lib/db";
import {
  ghostHandle,
  groupMentionCandidates,
  learnMemberName,
  memberLabel,
  memberTagName,
  type MemberNames
} from "../src/lib/group-members";
import {
  bodyTags,
  buildTextPayload,
  decodeMessagePayload,
  encodeMessagePayload,
  forwardedBody
} from "../src/lib/media-message";

const me = "a".repeat(64);
const bob = "b".repeat(64);
const carol = "c".repeat(64);
const dave = "d".repeat(64);

describe("group member names", () => {
  it("keeps the newest name a member gave, whatever order messages arrive in", () => {
    const first = learnMemberName(undefined, bob, " Bob Ghost ", 100);
    expect(first).toEqual({ [bob]: { at: 100, name: "Bob Ghost" } });
    // An older message replayed after reconnect does not roll the name back.
    expect(learnMemberName(first!, bob, "Old Bob", 50)).toBeNull();
    // The same name again changes nothing.
    expect(learnMemberName(first!, bob, "Bob Ghost", 200)).toBeNull();
    expect(learnMemberName(first!, bob, "Bobby", 200)?.[bob]?.name).toBe("Bobby");
    expect(learnMemberName(first!, bob, "   ", 300)).toBeNull();
    expect(
      learnMemberName(undefined, bob, "x".repeat(200), 1)?.[bob]?.name
    ).toHaveLength(80);
  });

  it("labels members with your contact name, but tags never use it", () => {
    const names: MemberNames = { [bob]: { at: 1, name: "Bob Ghost" } };
    expect(memberLabel(bob, names, "Mom")).toBe("Mom");
    expect(memberLabel(bob, names)).toBe("Bob Ghost");
    // "Mom" is what you call them. Everyone else would read it in the tag.
    expect(memberTagName(bob, names)).toBe("Bob Ghost");
    expect(memberTagName(carol, names)).toBe(ghostHandle(carol));
    expect(memberLabel(carol, names)).toBe(`ghost·${carol.slice(0, 10)}`);
  });
});

describe("the group @ picker", () => {
  const names: MemberNames = {
    [bob]: { at: 1, name: "Bob Ghost" },
    [carol]: { at: 1, name: "Carol Key" }
  };
  const base = {
    contactNames: { [dave]: "Uncle Dave", [bob]: "Bob Ghost" },
    me,
    members: [me, bob, carol, dave],
    names
  };

  it("offers everyone the message goes to except you, named members first", () => {
    const all = groupMentionCandidates({ ...base, query: "" });
    expect(all.map((c) => c.pubkeyHash)).toEqual([bob, carol, dave]);
  });

  it("finds members by either name, from the start of any word", () => {
    expect(
      groupMentionCandidates({ ...base, query: "key" }).map((c) => c.pubkeyHash)
    ).toEqual([carol]);
    // Dave never named himself: he is found by your name for him, but the
    // tag shows his ghost handle, and your name for him is only a hint.
    expect(groupMentionCandidates({ ...base, query: "dav" })).toEqual([
      { displayName: ghostHandle(dave), hint: "Uncle Dave", pubkeyHash: dave }
    ]);
    // No hint when your name for them is the name they gave.
    expect(groupMentionCandidates({ ...base, query: "bob" })).toEqual([
      { displayName: "Bob Ghost", pubkeyHash: bob }
    ]);
    expect(groupMentionCandidates({ ...base, query: "ost" })).toEqual([]);
  });
});

describe("group message payloads", () => {
  const tag: WhisperMention = { name: "Bob Ghost", pubkeyHash: bob };

  it("carry the sender's name and tags through encoding", () => {
    const body = encodeMessagePayload(
      buildTextPayload({ mentions: [tag], senderName: "Me", text: "hi @Bob Ghost" })
    );
    const payload = decodeMessagePayload(body);
    expect(payload?.senderName).toBe("Me");
    expect(payload?.mentions).toEqual([tag]);
    expect(bodyTags(body, bob)).toBe(true);
    expect(bodyTags(body, carol)).toBe(false);
    expect(bodyTags("a legacy plain body", bob)).toBe(false);
  });

  it("forward as the forwarder's own message, without the original's quote, name or tags", () => {
    const replyTo: ReplyToMessage = {
      createdAt: 1,
      messageId: "11111111-1111-4111-8111-111111111111",
      senderId: carol,
      senderName: "Carol",
      type: "text"
    };
    const original = encodeMessagePayload(
      buildTextPayload({
        mentions: [tag],
        replyTo,
        senderName: "Bob Ghost",
        text: "hi @Bob Ghost"
      })
    );

    const intoGroup = decodeMessagePayload(forwardedBody(original, "Me"));
    expect(intoGroup).toEqual({
      text: "hi @Bob Ghost",
      senderName: "Me",
      type: "text",
      version: 1
    });
    const intoDirect = decodeMessagePayload(forwardedBody(original));
    expect(intoDirect?.senderName).toBeUndefined();
    expect(intoDirect?.mentions).toBeUndefined();
    expect(forwardedBody("plain legacy text", "Me")).toBe("plain legacy text");
  });
});

describe("remembering names on this device", () => {
  const groupId = "group-1";

  beforeEach(async () => {
    await nadaDb.chatPrefs.clear();
  });

  it("stores the newest name per member and says when it changed", async () => {
    expect(await rememberGroupMemberName(groupId, bob, "Bob Ghost", 10)).toBe(true);
    expect(await rememberGroupMemberName(groupId, bob, "Bob Ghost", 20)).toBe(false);
    expect(await rememberGroupMemberName(groupId, bob, "Earlier Bob", 5)).toBe(false);
    expect((await getChatPref(groupId)).memberNames).toEqual({
      [bob]: { at: 10, name: "Bob Ghost" }
    });
  });

  it("never loses a learned name to a mute toggled at the same moment", async () => {
    // Names are written in the background as messages arrive; without one
    // transaction per read-modify-write, either write could erase the other.
    await Promise.all([
      setChatPref(groupId, { mutedUntil: null }),
      rememberGroupMemberName(groupId, bob, "Bob Ghost", 1),
      rememberGroupMemberName(groupId, carol, "Carol Key", 1),
      setChatPref(groupId, { pinnedMessageId: "m1" })
    ]);
    const pref = await getChatPref(groupId);
    expect(pref.mutedUntil).toBeNull();
    expect(pref.pinnedMessageId).toBe("m1");
    expect(Object.keys(pref.memberNames ?? {}).sort()).toEqual([bob, carol]);
  });
});
