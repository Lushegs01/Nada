import { mentionsInText, type WhisperMention } from "@nada/types";
import { describe, expect, it } from "vitest";

import {
  activeMentionQuery,
  insertMention,
  rememberMention
} from "../src/lib/mention-draft";

const bob: WhisperMention = { name: "Bob Ghost", pubkeyHash: "b".repeat(64) };

/** The query open at the end of `text`, as when the caret is there. */
function queryAtEnd(text: string, chosen: WhisperMention[] = []) {
  return activeMentionQuery(text, text.length, chosen);
}

describe("when the @ picker opens", () => {
  it("opens on a bare @ and follows what is typed, spaces included", () => {
    expect(queryAtEnd("hi @")).toEqual({ end: 4, query: "", start: 3 });
    expect(queryAtEnd("hi @Bob G")).toEqual({ end: 9, query: "Bob G", start: 3 });
  });

  it("reads the query up to the caret, not the end of the text", () => {
    expect(activeMentionQuery("@Bo and more", 3)).toEqual({
      end: 3,
      query: "Bo",
      start: 0
    });
  });

  it("stays shut for an e-mail address, a new line, or '@ ' on its own", () => {
    expect(queryAtEnd("mail me@host")).toBeNull();
    expect(queryAtEnd("@Bob\nnext line")).toBeNull();
    expect(queryAtEnd("an @ sign")).toBeNull();
    expect(queryAtEnd("no at sign")).toBeNull();
  });

  it("closes once the writer has clearly moved on", () => {
    expect(queryAtEnd("@one two three four five")).toBeNull();
    expect(queryAtEnd(`@${"x".repeat(41)}`)).toBeNull();
  });

  it("does not reopen on a tag that is already complete", () => {
    expect(queryAtEnd("hi @Bob Ghost and", [bob])).toBeNull();
    // Still typing the same name: keep offering it.
    expect(queryAtEnd("hi @Bob Gh", [bob])).not.toBeNull();
  });
});

describe("picking a ghost", () => {
  it("replaces the query with the tag and a space, and moves the caret after it", () => {
    const text = "hi @bo";
    const query = queryAtEnd(text)!;
    expect(insertMention(text, query, "Bob Ghost", 500)).toEqual({
      caret: "hi @Bob Ghost ".length,
      text: "hi @Bob Ghost "
    });
  });

  it("keeps the text after the caret and does not double a space", () => {
    const text = "hi @bo there";
    const query = activeMentionQuery(text, 6)!;
    const inserted = insertMention(text, query, "Bob Ghost", 500);
    expect(inserted).toEqual({
      caret: "hi @Bob Ghost ".length,
      text: "hi @Bob Ghost there"
    });
  });

  it("refuses a pick that would overflow the field", () => {
    const text = `${"x".repeat(270)} @bo`;
    expect(insertMention(text, queryAtEnd(text)!, "Bob Ghost", 280)).toBeNull();
  });

  it("remembers each ghost once", () => {
    expect(rememberMention(rememberMention([], bob), bob)).toEqual([bob]);
  });

  it("untags a ghost whose tag text was deleted, and never tags a typed name", () => {
    // The composer sends mentionsInText(text, picked): the picked ghosts
    // still visible in the text.
    const alice: WhisperMention = { name: "Alice", pubkeyHash: "a".repeat(64) };
    expect(mentionsInText("@Bob Ghost and @Alice", [alice, bob])).toEqual([bob, alice]);
    expect(mentionsInText("@Bob Gh and @Alice", [alice, bob])).toEqual([alice]);
    expect(mentionsInText("@Carol", [alice, bob])).toEqual([]);
  });
});
