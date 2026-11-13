// Media on Whispers: photos, GIFs, video and audio attached to an Echo.
//
// Whispers are public, so unlike chat attachments this media is NOT
// end-to-end encrypted: the relay stores it as uploaded and serves it to
// anyone who reads the feed. The rules below are shared by the relay and the
// web client so both agree on which files an Echo may carry and how each one
// renders.
import { z } from "zod";

import { UuidSchema } from "./primitives";

/** Most attachments one Echo can carry. */
export const WHISPER_MAX_MEDIA = 4;

export const WhisperMediaKindSchema = z.enum(["image", "video", "audio"]);
export type WhisperMediaKind = z.infer<typeof WhisperMediaKindSchema>;

/** File formats recognised from a file's first bytes. */
export type MediaContainer =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "isobmff"
  | "matroska"
  | "mp3"
  | "ogg"
  | "wav"
  | "flac"
  | "aac";

export interface WhisperMediaType {
  kind: WhisperMediaKind;
  /** What the file's bytes must actually be for the type to be believed. */
  container: MediaContainer;
  extension: string;
}

/**
 * The MIME types an Echo may carry. Everything here is something a browser
 * renders natively in <img>, <video> or <audio>.
 *
 * Deliberately absent: SVG and HTML (they run script), and documents such as
 * PDF or Word files, whose embedded author fields routinely carry a real name
 * that the browser has no reliable way to scrub before an anonymous upload.
 */
export const WHISPER_MEDIA_TYPES: Readonly<Record<string, WhisperMediaType>> = {
  "image/jpeg": { kind: "image", container: "jpeg", extension: "jpg" },
  "image/png": { kind: "image", container: "png", extension: "png" },
  "image/gif": { kind: "image", container: "gif", extension: "gif" },
  "image/webp": { kind: "image", container: "webp", extension: "webp" },
  "video/mp4": { kind: "video", container: "isobmff", extension: "mp4" },
  "video/quicktime": { kind: "video", container: "isobmff", extension: "mov" },
  "video/webm": { kind: "video", container: "matroska", extension: "webm" },
  "audio/mpeg": { kind: "audio", container: "mp3", extension: "mp3" },
  "audio/mp4": { kind: "audio", container: "isobmff", extension: "m4a" },
  "audio/aac": { kind: "audio", container: "aac", extension: "aac" },
  "audio/ogg": { kind: "audio", container: "ogg", extension: "ogg" },
  "audio/webm": { kind: "audio", container: "matroska", extension: "webm" },
  "audio/wav": { kind: "audio", container: "wav", extension: "wav" },
  "audio/flac": { kind: "audio", container: "flac", extension: "flac" }
};

/** Spellings browsers and operating systems use for the types above. */
const MIME_ALIASES: Readonly<Record<string, string>> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/x-aac": "audio/aac",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-flac": "audio/flac",
  "video/x-m4v": "video/mp4"
};

/**
 * The canonical form of a MIME type: lower-cased, parameters such as
 * `;codecs=opus` dropped, and aliases resolved. Returns null for anything an
 * Echo may not carry.
 */
export function normalizeWhisperMediaMime(mimeType: string | undefined | null): string | null {
  const base = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const canonical = MIME_ALIASES[base] ?? base;
  return canonical in WHISPER_MEDIA_TYPES ? canonical : null;
}

function startsWithAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

/**
 * Identifies a file's format from its signature, or null when it is not one
 * an Echo may carry. The declared MIME type is only believed when the bytes
 * agree with it, so an HTML page labelled `image/png` is refused rather than
 * stored and served.
 */
export function sniffMediaContainer(bytes: Uint8Array): MediaContainer | null {
  const b0 = bytes[0];
  const b1 = bytes[1];
  if (b0 === 0xff && b1 === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    b0 === 0x89 &&
    startsWithAscii(bytes, 1, "PNG") &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (startsWithAscii(bytes, 0, "GIF87a") || startsWithAscii(bytes, 0, "GIF89a")) return "gif";
  if (startsWithAscii(bytes, 0, "RIFF")) {
    if (startsWithAscii(bytes, 8, "WEBP")) return "webp";
    if (startsWithAscii(bytes, 8, "WAVE")) return "wav";
    return null;
  }
  // ISO base media (MP4, MOV, M4A). Most files open with `ftyp`; older
  // QuickTime files open straight into a movie or data atom.
  if (["ftyp", "moov", "mdat", "wide"].some((box) => startsWithAscii(bytes, 4, box))) {
    return "isobmff";
  }
  if (b0 === 0x1a && b1 === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "matroska";
  if (startsWithAscii(bytes, 0, "OggS")) return "ogg";
  if (startsWithAscii(bytes, 0, "fLaC")) return "flac";
  if (startsWithAscii(bytes, 0, "ID3")) return "mp3";
  if (b0 === 0xff && b1 !== undefined) {
    // ADTS AAC: 12-bit sync, then layer bits that are always 00.
    if ((b1 & 0xf6) === 0xf0) return "aac";
    // MPEG audio frame: 11-bit sync, then a layer that is never 00.
    if ((b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0) return "mp3";
  }
  return null;
}

/**
 * The type a file is stored and served as: its declared MIME type, once that
 * type is allowed and its bytes are the format it claims. Null otherwise.
 */
export function resolveWhisperMediaType(
  declaredMime: string | undefined | null,
  bytes: Uint8Array
): { mimeType: string; type: WhisperMediaType } | null {
  const mimeType = normalizeWhisperMediaMime(declaredMime);
  if (!mimeType) return null;
  const type = WHISPER_MEDIA_TYPES[mimeType]!;
  return sniffMediaContainer(bytes) === type.container ? { mimeType, type } : null;
}

/**
 * One attachment as an Echo's author asks to publish it: the uploaded file's
 * id, plus display hints the browser measured. The relay fills in the type
 * and size from what it stored rather than trusting the client for them.
 */
export const WhisperMediaRefSchema = z.object({
  id: UuidSchema,
  width: z.number().int().min(1).max(16384).optional(),
  height: z.number().int().min(1).max(16384).optional(),
  /** Seconds, for video and audio. */
  duration: z.number().positive().max(24 * 60 * 60).optional()
});
export type WhisperMediaRef = z.infer<typeof WhisperMediaRefSchema>;

/** One attachment on a published Echo. */
export const WhisperMediaSchema = WhisperMediaRefSchema.extend({
  kind: WhisperMediaKindSchema,
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive()
});
export type WhisperMedia = z.infer<typeof WhisperMediaSchema>;

export const WhisperMediaUploadResponseSchema = z.object({
  id: UuidSchema,
  kind: WhisperMediaKindSchema,
  mimeType: z.string().min(1).max(120),
  size: z.number().int().positive()
});
export type WhisperMediaUploadResponse = z.infer<typeof WhisperMediaUploadResponseSchema>;

/**
 * Reads a stored or received attachment list, dropping malformed entries
 * rather than failing: one bad row must not blank out an Echo's text.
 */
export function parseWhisperMedia(raw: unknown): WhisperMedia[] {
  if (!Array.isArray(raw)) return [];
  const media: WhisperMedia[] = [];
  for (const entry of raw) {
    const result = WhisperMediaSchema.safeParse(entry);
    if (result.success) media.push(result.data);
    if (media.length === WHISPER_MAX_MEDIA) break;
  }
  return media;
}
