import { describe, expect, it } from "vitest";

import {
  MalformedMediaError,
  neutralizeIsoBmffMetadata,
  sanitizeMediaBytes,
  stripGifMetadata,
  stripId3
} from "@/lib/media-sanitize";

const text = (value: string): number[] => [...value].map((char) => char.charCodeAt(0));
const bytes = (...parts: Array<number | number[] | string>): Uint8Array =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === "string" ? text(part) : Array.isArray(part) ? part : [part]
    )
  );
const contains = (haystack: Uint8Array, needle: string): boolean =>
  new TextDecoder("latin1").decode(haystack).includes(needle);

function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const payload = children.reduce((sum, child) => sum + child.length, 0);
  const out = new Uint8Array(8 + payload);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(text(type), 4);
  let offset = 8;
  for (const child of children) {
    out.set(child, offset);
    offset += child.length;
  }
  return out;
}

describe("stripGifMetadata", () => {
  const header = bytes("GIF89a", 1, 0, 1, 0, 0x80, 0, 0, [0, 0, 0, 255, 255, 255]);
  const loop = bytes(0x21, 0xff, 11, "NETSCAPE2.0", 3, 1, 0, 0, 0);
  const comment = bytes(0x21, 0xfe, 14, "shot at home!!", 0);
  const xmp = bytes(0x21, 0xff, 11, "XMP DataXMP", 9, "GPS 51.5N", 0);
  const timing = bytes(0x21, 0xf9, 4, 0, 10, 0, 0, 0);
  const frame = bytes(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x4c, 0x01, 0);

  it("drops comments and XMP but keeps frames, timing and the loop", () => {
    const input = bytes([...header], [...loop], [...comment], [...xmp], [...timing], [...frame], 0x3b);

    const output = stripGifMetadata(input);

    expect(contains(output, "shot at home")).toBe(false);
    expect(contains(output, "GPS 51.5N")).toBe(false);
    expect(Array.from(output)).toEqual(
      Array.from(bytes([...header], [...loop], [...timing], [...frame], 0x3b))
    );
  });

  it("closes a GIF that ends without its trailer", () => {
    const output = stripGifMetadata(bytes([...header], [...frame]));
    expect(output.at(-1)).toBe(0x3b);
  });

  it("refuses something that is not a GIF", () => {
    expect(() => stripGifMetadata(bytes("<svg>"))).toThrow(MalformedMediaError);
  });
});

describe("neutralizeIsoBmffMetadata", () => {
  const location = "+51.5007-000.1246/";
  const ftyp = box("ftyp", bytes("isom", 0, 0, 2, 0));
  const mvhd = box("mvhd", bytes(0, 0, 0, 0, 1, 2, 3, 4));
  const tkhd = box("tkhd", bytes(0, 0, 0, 7));
  const mdat = box("mdat", bytes("frame-data"));

  const movie = (): Uint8Array => {
    const parts = [
      ftyp,
      box(
        "moov",
        mvhd,
        box("udta", box("©xyz", bytes(location)), box("©mak", bytes("Apple"))),
        box("meta", bytes("com.apple.quicktime.location.ISO6709", location)),
        box("trak", tkhd, box("udta", bytes("Pixel 8")))
      ),
      box("uuid", bytes("xmp:GPSLatitude")),
      mdat
    ];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  };

  it("blanks location, device and XMP metadata without moving a byte", () => {
    const input = movie();

    const output = neutralizeIsoBmffMetadata(input);

    expect(output.length).toBe(input.length);
    for (const leaked of [location, "Apple", "Pixel 8", "com.apple", "GPSLatitude"]) {
      expect(contains(output, leaked)).toBe(false);
    }
    // What a player needs is exactly where it was.
    for (const kept of [ftyp, mvhd, tkhd, mdat]) {
      const at = input.findIndex((_, index) =>
        kept.every((value, offset) => input[index + offset] === value)
      );
      expect(Array.from(output.subarray(at, at + kept.length))).toEqual(Array.from(kept));
    }
    expect(input).toEqual(movie()); // the original is not modified
  });

  it("rejects a box that claims to be bigger than the file", () => {
    const broken = box("moov", mvhd);
    new DataView(broken.buffer).setUint32(0, 9999);
    expect(() => neutralizeIsoBmffMetadata(broken)).toThrow(MalformedMediaError);
  });
});

describe("stripId3", () => {
  const frame = bytes(0xff, 0xfb, 0x90, 0x64, ...new Array(60).fill(0x55));

  it("removes both ID3v2 and ID3v1 tags", () => {
    const v2Body = bytes("TIT2", 0, 0, 0, 9, 0, 0, 0, "Recorded", 0);
    const v2 = bytes("ID3", 4, 0, 0, 0, 0, 0, v2Body.length, [...v2Body]);
    const v1 = bytes("TAG", ...new Array(125).fill(0x41));
    const input = bytes([...v2], [...frame], [...v1]);

    expect(Array.from(stripId3(input))).toEqual(Array.from(frame));
  });

  it("leaves an untagged MP3 alone", () => {
    expect(Array.from(stripId3(frame))).toEqual(Array.from(frame));
  });
});

describe("sanitizeMediaBytes", () => {
  it("passes through formats it has nothing to remove from", () => {
    const wav = bytes("RIFF", 0, 0, 0, 0, "WAVE");
    expect(sanitizeMediaBytes(wav, "audio/wav")).toBe(wav);
  });
});
