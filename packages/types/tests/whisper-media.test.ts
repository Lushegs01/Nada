import { describe, expect, it } from "vitest";

import {
  WhisperPublishRequestSchema,
  normalizeWhisperMediaMime,
  parseWhisperMedia,
  resolveWhisperMediaType,
  sniffMediaContainer
} from "../src/index";

const bytes = (...values: Array<number | string>): Uint8Array =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value]
    )
  );

describe("sniffMediaContainer", () => {
  it("recognises every format an Echo can carry", () => {
    expect(sniffMediaContainer(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffMediaContainer(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffMediaContainer(bytes("GIF89a"))).toBe("gif");
    expect(sniffMediaContainer(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("webp");
    expect(sniffMediaContainer(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe("wav");
    expect(sniffMediaContainer(bytes(0, 0, 0, 0x18, "ftypmp42"))).toBe("isobmff");
    expect(sniffMediaContainer(bytes(0, 0, 0, 0x08, "wide"))).toBe("isobmff");
    expect(sniffMediaContainer(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("matroska");
    expect(sniffMediaContainer(bytes("OggS"))).toBe("ogg");
    expect(sniffMediaContainer(bytes("fLaC"))).toBe("flac");
    expect(sniffMediaContainer(bytes("ID3", 4, 0))).toBe("mp3");
    expect(sniffMediaContainer(bytes(0xff, 0xfb, 0x90))).toBe("mp3");
    expect(sniffMediaContainer(bytes(0xff, 0xf1, 0x50))).toBe("aac");
  });

  it("recognises nothing else", () => {
    expect(sniffMediaContainer(bytes("<svg"))).toBeNull();
    expect(sniffMediaContainer(bytes("<!doctype html>"))).toBeNull();
    expect(sniffMediaContainer(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffMediaContainer(bytes("RIFF", 0, 0, 0, 0, "AVI "))).toBeNull();
    expect(sniffMediaContainer(new Uint8Array())).toBeNull();
  });
});

describe("resolveWhisperMediaType", () => {
  const png = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a);

  it("believes a declared type only when the bytes agree", () => {
    expect(resolveWhisperMediaType("image/png", png)?.mimeType).toBe("image/png");
    expect(resolveWhisperMediaType("image/jpeg", png)).toBeNull();
    expect(resolveWhisperMediaType("image/svg+xml", bytes("<svg"))).toBeNull();
    expect(resolveWhisperMediaType("application/pdf", bytes("%PDF"))).toBeNull();
  });

  it("canonicalises what browsers and recorders report", () => {
    expect(normalizeWhisperMediaMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeWhisperMediaMime("audio/x-m4a")).toBe("audio/mp4");
    expect(normalizeWhisperMediaMime("IMAGE/JPG")).toBe("image/jpeg");
    expect(normalizeWhisperMediaMime("text/html")).toBeNull();
    expect(normalizeWhisperMediaMime(undefined)).toBeNull();
  });
});

describe("WhisperPublishRequestSchema", () => {
  const base = {
    author: "a".repeat(64),
    authorName: "Ghost",
    id: "10000000-0000-4000-8000-000000000001",
    timestamp: 1,
    proof: { pubkey: "p".repeat(44), pubkeyHash: "a".repeat(64), signature: "s", timestamp: 1 }
  };
  const media = (id: string) => ({ id });

  it("accepts a photo with no caption", () => {
    const result = WhisperPublishRequestSchema.safeParse({
      ...base,
      body: "",
      media: [media("20000000-0000-4000-8000-000000000001")]
    });
    expect(result.success).toBe(true);
  });

  it("refuses an Echo with neither words nor media", () => {
    expect(WhisperPublishRequestSchema.safeParse({ ...base, body: "  " }).success).toBe(false);
    expect(
      WhisperPublishRequestSchema.safeParse({ ...base, body: "", media: [] }).success
    ).toBe(false);
  });

  it("refuses more than four attachments, or one attached twice", () => {
    const ids = [1, 2, 3, 4, 5].map((n) => `20000000-0000-4000-8000-00000000000${n}`);
    expect(
      WhisperPublishRequestSchema.safeParse({ ...base, body: "x", media: ids.map(media) }).success
    ).toBe(false);
    expect(
      WhisperPublishRequestSchema.safeParse({
        ...base,
        body: "x",
        media: [media(ids[0]!), media(ids[0]!)]
      }).success
    ).toBe(false);
  });
});

describe("parseWhisperMedia", () => {
  it("keeps valid attachments and drops malformed ones", () => {
    const good = {
      id: "20000000-0000-4000-8000-000000000001",
      kind: "image",
      mimeType: "image/png",
      size: 10
    };
    expect(parseWhisperMedia([good, { id: "nope" }, null])).toEqual([good]);
    expect(parseWhisperMedia("not a list")).toEqual([]);
  });
});
