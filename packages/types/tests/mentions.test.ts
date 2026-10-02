import { describe, expect, it } from "vitest";

import {
  MessagePayloadSchema,
  WhisperMentionsRequestSchema,
  mentionsInText,
  parseMentions,
  segmentMentions,
  type WhisperMention
} from "../src";

const bob: WhisperMention = { name: "Bob", pubkeyHash: "b".repeat(64) };
const silent: WhisperMention = { name: "Silent Key 4F2A", pubkeyHash: "c".repeat(64) };
const silentShort: WhisperMention = { name: "Silent Key", pubkeyHash: "d".repeat(64) };

function tags(text: string, mentions: WhisperMention[]): Array<[string, string]> {
  return segmentMentions(text, mentions).flatMap((segment) =>
    segment.kind === "mention" ? [[segment.text, segment.mention.pubkeyHash]] : []
  ) as Array<[string, string]>;
}

describe("segmentMentions", () => {
  it("keeps the text intact around tags", () => {
    const segments = segmentMentions("hi @Bob, see this", [bob]);
    expect(segments.map((segment) => segment.text).join("")).toBe("hi @Bob, see this");
    expect(segments).toEqual([
      { kind: "text", text: "hi " },
      { kind: "mention", mention: bob, text: "@Bob" },
      { kind: "text", text: ", see this" }
    ]);
  });

  it("matches names with spaces, case-insensitively, as typed", () => {
    expect(tags("cc @silent key 4f2a!", [silent])).toEqual([
      ["@silent key 4f2a", silent.pubkeyHash]
    ]);
  });

  it("prefers the longest tagged name", () => {
    expect(tags("@Silent Key 4F2A and @Silent Key", [silentShort, silent])).toEqual([
      ["@Silent Key 4F2A", silent.pubkeyHash],
      ["@Silent Key", silentShort.pubkeyHash]
    ]);
  });

  it("does not tag inside a longer word or an e-mail address", () => {
    expect(tags("@Bobby", [bob])).toEqual([]);
    expect(tags("mail me@Bob", [bob])).toEqual([]);
    expect(tags("(@Bob)", [bob])).toEqual([["@Bob", bob.pubkeyHash]]);
  });

  it("gives ghosts who share a name their own occurrence, in order", () => {
    const other: WhisperMention = { name: "Bob", pubkeyHash: "e".repeat(64) };
    expect(tags("@Bob and @Bob and @Bob", [bob, other])).toEqual([
      ["@Bob", bob.pubkeyHash],
      ["@Bob", other.pubkeyHash],
      ["@Bob", other.pubkeyHash]
    ]);
  });

  it("returns plain text when nothing is tagged", () => {
    expect(segmentMentions("an @handle", [])).toEqual([
      { kind: "text", text: "an @handle" }
    ]);
    expect(segmentMentions("", [bob])).toEqual([]);
  });
});

describe("mentionsInText", () => {
  it("keeps only visible tags, once each, in the order they appear", () => {
    const hidden: WhisperMention = { name: "Nobody", pubkeyHash: "f".repeat(64) };
    expect(
      mentionsInText("@Silent Key 4F2A then @Bob then @Bob", [bob, hidden, silent])
    ).toEqual([silent, bob]);
  });
});

describe("parseMentions", () => {
  it("drops malformed entries instead of failing", () => {
    expect(
      parseMentions([bob, null, { name: "", pubkeyHash: "x" }, { name: 3 }, "Bob"])
    ).toEqual([bob]);
    expect(parseMentions("not a list")).toEqual([]);
  });
});

describe("WhisperMentionsRequestSchema", () => {
  it("caps how many ghosts one write can tag", () => {
    const hashes = Array.from({ length: 10 }, (_, index) =>
      String(index).padStart(64, "0")
    );
    expect(WhisperMentionsRequestSchema.safeParse(hashes).success).toBe(true);
    expect(
      WhisperMentionsRequestSchema.safeParse([...hashes, "a".repeat(64)]).success
    ).toBe(false);
  });
});

describe("group message payloads", () => {
  const base = { version: 1, type: "text", text: "@Bob hi" } as const;

  it("carries the sender's name and tags inside the payload", () => {
    const parsed = MessagePayloadSchema.parse({
      ...base,
      senderName: "  Silent Key 4F2A ",
      mentions: [bob]
    });
    expect(parsed.senderName).toBe("Silent Key 4F2A");
    expect(parsed.mentions).toEqual([bob]);
  });

  it("still reads payloads from before names and tags existed", () => {
    const parsed = MessagePayloadSchema.parse(base);
    expect(parsed.senderName).toBeUndefined();
    expect(parsed.mentions).toBeUndefined();
    expect(parsed.text).toBe("@Bob hi");
  });

  it("drops a malformed name or tag list instead of failing the message", () => {
    // One member's odd payload must not turn their messages into raw JSON on
    // everyone else's screen.
    const tooMany = Array.from({ length: 11 }, () => bob);
    const parsed = MessagePayloadSchema.safeParse({
      ...base,
      senderName: "x".repeat(81),
      mentions: tooMany
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.senderName).toBeUndefined();
    expect(parsed.data?.mentions).toBeUndefined();
    expect(parsed.data?.text).toBe("@Bob hi");
  });
});
