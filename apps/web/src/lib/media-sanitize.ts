// Removes identifying metadata from media before it is posted to Whispers.
//
// An Echo is public and its author is anonymous, but the files people post
// were made by their phones, and phones write who, where and on what into
// them: a photo's EXIF block carries GPS coordinates; an iPhone or Android
// video stores where it was filmed in its `udta`/`meta` boxes; MP3s carry ID3
// tags. Published as-is, one holiday clip would put a pin on the author's
// house. The relay never sees a file before its author decides to publish it,
// so this has to happen here, in the browser.
//
// Photos (other than GIFs) are cleaned by re-encoding them through a canvas,
// which keeps only pixels — see whisper-media.ts. The functions below handle
// the formats that must keep their bytes: animated GIFs, video and audio.
// They are pure byte transforms so they can be tested without a browser.
//
// What this does NOT remove: telemetry stored as a timed data track inside the
// video itself (action cameras and drones record GPS that way), tags in
// Ogg/FLAC/WAV/WebM audio, and anything visible in the picture or audible in
// the recording.

const decoder = new TextDecoder("latin1");

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return decoder.decode(bytes.subarray(start, start + length));
}

export class MalformedMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedMediaError";
  }
}

// ── GIF ──────────────────────────────────────────────────────────────────────

/** Application extensions an animated GIF needs: they carry its loop count. */
const KEPT_GIF_APPLICATIONS = new Set(["NETSCAPE2.0", "ANIMEXTS1.0"]);

/** Offset just past a run of GIF data sub-blocks starting at `offset`. */
function skipGifSubBlocks(bytes: Uint8Array, offset: number): number {
  let cursor = offset;
  for (;;) {
    const size = bytes[cursor];
    if (size === undefined) throw new MalformedMediaError("GIF ends inside a block.");
    cursor += 1 + size;
    if (size === 0) return cursor;
  }
}

/**
 * A GIF with its comment blocks and metadata application blocks (XMP, ICC
 * and anything else) removed. Frames, timing and loop count are untouched,
 * so an animation still animates.
 */
export function stripGifMetadata(bytes: Uint8Array): Uint8Array {
  const header = ascii(bytes, 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") {
    throw new MalformedMediaError("Not a GIF.");
  }
  const kept: Uint8Array[] = [];
  let cursor = 13;
  const screenFlags = bytes[10];
  if (screenFlags === undefined) throw new MalformedMediaError("GIF header is truncated.");
  if (screenFlags & 0x80) cursor += 3 * 2 ** ((screenFlags & 0x07) + 1);
  kept.push(bytes.subarray(0, cursor));

  for (;;) {
    const marker = bytes[cursor];
    if (marker === 0x3b) {
      kept.push(bytes.subarray(cursor, cursor + 1));
      break;
    }
    if (marker === 0x21) {
      const label = bytes[cursor + 1];
      const end = skipGifSubBlocks(bytes, cursor + 2);
      const keep =
        label === 0xf9 || // graphic control: frame delay and transparency
        label === 0x01 || // plain text: drawn as part of the image
        (label === 0xff &&
          bytes[cursor + 2] === 11 &&
          KEPT_GIF_APPLICATIONS.has(ascii(bytes, cursor + 3, 11)));
      if (keep) kept.push(bytes.subarray(cursor, end));
      cursor = end;
      continue;
    }
    if (marker === 0x2c) {
      const imageFlags = bytes[cursor + 9];
      if (imageFlags === undefined) throw new MalformedMediaError("GIF frame is truncated.");
      let dataStart = cursor + 10;
      if (imageFlags & 0x80) dataStart += 3 * 2 ** ((imageFlags & 0x07) + 1);
      // One byte of LZW code size, then the frame's compressed sub-blocks.
      const end = skipGifSubBlocks(bytes, dataStart + 1);
      kept.push(bytes.subarray(cursor, end));
      cursor = end;
      continue;
    }
    if (marker === undefined) {
      // Plenty of GIFs in the wild omit the trailer; browsers render them.
      kept.push(Uint8Array.of(0x3b));
      break;
    }
    throw new MalformedMediaError("GIF contains an unknown block.");
  }

  const total = kept.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of kept) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

// ── MP4 / MOV / M4A ─────────────────────────────────────────────────────────

/** Boxes whose children are searched for metadata. */
const ISOBMFF_CONTAINERS = new Set(["moov", "trak", "mdia", "minf"]);
/**
 * Boxes that hold descriptive metadata rather than anything a player needs:
 * user data (where `©xyz` location, make and model live), metadata item lists
 * (Apple's `com.apple.quicktime.location.ISO6709`), and extension boxes, where
 * cameras and editors put XMP.
 */
const ISOBMFF_METADATA = new Set(["udta", "meta", "uuid", "XMP_"]);

interface BoxHeader {
  end: number;
  headerSize: number;
  type: string;
}

function readBoxHeader(view: DataView, bytes: Uint8Array, offset: number, limit: number): BoxHeader {
  if (offset + 8 > limit) throw new MalformedMediaError("Box header runs past its parent.");
  const size32 = view.getUint32(offset);
  const type = ascii(bytes, offset + 4, 4);
  let size = size32;
  let headerSize = 8;
  if (size32 === 1) {
    if (offset + 16 > limit) throw new MalformedMediaError("Large box header is truncated.");
    size = Number(view.getBigUint64(offset + 8));
    headerSize = 16;
  } else if (size32 === 0) {
    size = limit - offset;
  }
  if (size < headerSize || offset + size > limit) {
    throw new MalformedMediaError(`Box ${type} has an impossible size.`);
  }
  return { end: offset + size, headerSize, type };
}

/**
 * An ISO base media file (MP4, MOV, M4A) with every metadata box blanked.
 *
 * Boxes are not removed: in most phone videos the movie box sits before the
 * media data, and the sample tables hold absolute byte offsets into it, so
 * shrinking any box would break playback. Each metadata box is instead
 * renamed `free` — padding every player skips — and its contents zeroed,
 * which keeps every offset where it was.
 */
export function neutralizeIsoBmffMetadata(input: Uint8Array): Uint8Array {
  const bytes = input.slice();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const walk = (start: number, end: number): void => {
    let cursor = start;
    while (cursor < end) {
      // A few writers pad the end of a container with fewer than 8 zero bytes.
      if (end - cursor < 8) break;
      const box = readBoxHeader(view, bytes, cursor, end);
      if (ISOBMFF_METADATA.has(box.type)) {
        bytes.set([0x66, 0x72, 0x65, 0x65], cursor + 4); // "free"
        bytes.fill(0, cursor + box.headerSize, box.end);
      } else if (ISOBMFF_CONTAINERS.has(box.type)) {
        walk(cursor + box.headerSize, box.end);
      }
      cursor = box.end;
    }
  };

  walk(0, bytes.length);
  return bytes;
}

// ── MP3 ──────────────────────────────────────────────────────────────────────

function syncsafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! & 0x7f) << 21) |
    ((bytes[offset + 1]! & 0x7f) << 14) |
    ((bytes[offset + 2]! & 0x7f) << 7) |
    (bytes[offset + 3]! & 0x7f)
  );
}

/** An MP3 without its ID3v2 tags (front) or ID3v1 tag (back). */
export function stripId3(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (ascii(bytes, start, 3) === "ID3" && bytes.length >= start + 10) {
    const hasFooter = (bytes[start + 5]! & 0x10) !== 0;
    start += 10 + syncsafe(bytes, start + 6) + (hasFooter ? 10 : 0);
  }
  let end = bytes.length;
  if (end - start >= 128 && ascii(bytes, end - 128, 3) === "TAG") {
    end -= 128;
    // "Enhanced" ID3v1 sits directly in front of the plain tag.
    if (end - start >= 227 && ascii(bytes, end - 227, 4) === "TAG+") end -= 227;
  }
  if (start >= end) throw new MalformedMediaError("MP3 holds nothing but tags.");
  return bytes.slice(start, end);
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * The bytes to upload for a file of `mimeType` (already canonical). Formats
 * with nothing handled here pass through unchanged.
 */
export function sanitizeMediaBytes(bytes: Uint8Array, mimeType: string): Uint8Array {
  switch (mimeType) {
    case "image/gif":
      return stripGifMetadata(bytes);
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4":
      return neutralizeIsoBmffMetadata(bytes);
    case "audio/mpeg":
      return stripId3(bytes);
    default:
      return bytes;
  }
}
