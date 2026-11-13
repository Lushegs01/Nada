// Photos, GIFs, video and audio on Whispers: getting a file ready to post,
// uploading it, and pointing at it once it is published.
//
// Whisper media is public — see packages/types/src/whisper-media.ts — so it is
// uploaded as-is rather than encrypted. What is not public is where and with
// what a file was made, so every file goes through `prepareWhisperMedia`
// before it can be attached, and that is what removes its metadata.
import {
  WHISPER_MEDIA_TYPES,
  WhisperMediaUploadResponseSchema,
  normalizeWhisperMediaMime,
  type WhisperMedia,
  type WhisperMediaKind
} from "@nada/types";

import { MalformedMediaError, sanitizeMediaBytes } from "@/lib/media-sanitize";
import { MAX_MEDIA_BYTES, formatBytes } from "@/lib/media-upload";
import { getRelayHttpBaseUrl } from "@/lib/relay-url";
import { useIdentityStore } from "@/stores/useIdentityStore";

export { WHISPER_MAX_MEDIA } from "@nada/types";

/** What the file picker offers. Anything else dropped or pasted is refused. */
export const WHISPER_MEDIA_ACCEPT = "image/*,video/*,audio/*";

/** Photos are scaled to fit this on their long side before upload. */
const MAX_IMAGE_SIDE = 2048;
const JPEG_QUALITY = 0.88;
/** A lossless re-encode bigger than this is re-done as JPEG. */
const MAX_LOSSLESS_BYTES = 6 * 1024 * 1024;

/**
 * Types to assume when the browser reports none, which some do for .mov,
 * .m4a and recordings saved by other apps.
 */
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  aac: "audio/aac",
  flac: "audio/flac",
  gif: "image/gif",
  m4a: "audio/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  weba: "audio/webm",
  webm: "video/webm"
};

/** A file the author has picked, cleaned and measured, not yet uploaded. */
export interface PreparedWhisperMedia {
  /** Identifies the attachment in the composer before it has a relay id. */
  localId: string;
  kind: WhisperMediaKind;
  /** Canonical type of `file`. */
  mimeType: string;
  /** The cleaned file: this, never the original, is what gets uploaded. */
  file: Blob;
  /** Object URL of `file` for the composer preview. Revoke when discarded. */
  previewUrl: string;
  width?: number;
  height?: number;
  duration?: number;
}

/** A reason a file cannot be attached, worded for the person who picked it. */
export class WhisperMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhisperMediaError";
  }
}

function extensionOf(name: string): string {
  return name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
}

/**
 * Cleans and measures one file for an Echo. Throws `WhisperMediaError` with a
 * message fit to show when the file cannot be attached.
 */
export async function prepareWhisperMedia(file: File): Promise<PreparedWhisperMedia> {
  if (file.size <= 0) throw new WhisperMediaError(`"${file.name}" is empty.`);
  if (file.size > MAX_MEDIA_BYTES) {
    throw new WhisperMediaError(
      `"${file.name}" is too large. Files can be up to ${formatBytes(MAX_MEDIA_BYTES)}.`
    );
  }

  const reported = (file.type || EXTENSION_TYPES[extensionOf(file.name)] || "").toLowerCase();
  if (reported.startsWith("image/") && reported !== "image/gif") {
    return prepareStillImage(file);
  }

  const mimeType = normalizeWhisperMediaMime(reported);
  if (!mimeType) {
    throw new WhisperMediaError(
      `"${file.name}" can't be posted. Echoes can carry photos, GIFs, video and audio.`
    );
  }
  const kind = WHISPER_MEDIA_TYPES[mimeType]!.kind;

  let cleaned: Uint8Array;
  try {
    cleaned = sanitizeMediaBytes(new Uint8Array(await file.arrayBuffer()), mimeType);
  } catch (error) {
    if (error instanceof MalformedMediaError) {
      throw new WhisperMediaError(`"${file.name}" looks damaged and can't be posted.`);
    }
    throw error;
  }
  const blob = new Blob([cleaned as BlobPart], { type: mimeType });
  const previewUrl = URL.createObjectURL(blob);
  const measured =
    kind === "image" ? await measureImage(previewUrl) : await measureMedia(previewUrl, kind);

  return { localId: crypto.randomUUID(), kind, mimeType, file: blob, previewUrl, ...measured };
}

/**
 * Re-encodes a photo through a canvas. A canvas holds pixels and nothing else,
 * so EXIF (GPS, camera, timestamps), XMP and ICC metadata are all gone from
 * what it produces. Formats the browser can decode but other browsers might
 * not (HEIC, AVIF, BMP) come out as JPEG or PNG on the way.
 */
async function prepareStillImage(file: File): Promise<PreparedWhisperMedia> {
  const sourceUrl = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(sourceUrl);
  } catch {
    throw new WhisperMediaError(
      `"${file.name}" can't be opened in this browser. Try a JPEG or PNG.`
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }

  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new WhisperMediaError("This browser can't prepare photos for upload.");

  // PNG and WebP may be transparent; keep them lossless unless that is huge.
  const mayHaveAlpha = file.type === "image/png" || file.type === "image/webp";
  let blob: Blob | null = null;
  if (mayHaveAlpha) {
    context.drawImage(image, 0, 0, width, height);
    blob = await canvasToBlob(canvas, "image/png");
    if (blob && blob.size > MAX_LOSSLESS_BYTES) blob = null;
  }
  if (!blob) {
    // JPEG has no transparency; paint a background rather than let it go black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  }
  if (!blob) throw new WhisperMediaError(`"${file.name}" couldn't be prepared for upload.`);
  if (blob.size > MAX_MEDIA_BYTES) {
    throw new WhisperMediaError(`"${file.name}" is too large even after resizing.`);
  }

  return {
    localId: crypto.randomUUID(),
    kind: "image",
    mimeType: blob.type,
    file: blob,
    previewUrl: URL.createObjectURL(blob),
    width,
    height
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load."));
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function measureImage(url: string): Promise<{ width?: number; height?: number }> {
  try {
    const image = await loadImage(url);
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return {};
  }
}

/**
 * Reads a video's size and a clip's length. A file this browser cannot decode
 * still uploads — the people watching may be on a browser that can — it just
 * goes without hints.
 */
function measureMedia(
  url: string,
  kind: WhisperMediaKind
): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve) => {
    const element = document.createElement(kind === "video" ? "video" : "audio");
    const timeout = window.setTimeout(() => resolve({}), 8000);
    element.preload = "metadata";
    element.muted = true;
    element.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const duration = Number.isFinite(element.duration) && element.duration > 0
        ? Math.round(element.duration * 10) / 10
        : undefined;
      const video = element as HTMLVideoElement;
      const sized = kind === "video" && video.videoWidth > 0 && video.videoHeight > 0;
      resolve({
        ...(duration ? { duration } : {}),
        ...(sized ? { width: video.videoWidth, height: video.videoHeight } : {})
      });
    };
    element.onerror = () => {
      window.clearTimeout(timeout);
      resolve({});
    };
    element.src = url;
  });
}

/** Where a published attachment is served from, or "" with no relay. */
export function whisperMediaUrl(id: string): string {
  const base = getRelayHttpBaseUrl();
  return base ? new URL(`/api/v1/whispers/media/${id}`, base).toString() : "";
}

/**
 * Uploads one prepared file and returns the attachment to publish with the
 * Echo. Uses XMLHttpRequest rather than fetch because only XHR reports upload
 * progress, and a phone posting a video needs to see that it is moving.
 */
export async function uploadWhisperMedia(
  item: PreparedWhisperMedia,
  author: string,
  onProgress?: (loaded: number) => void
): Promise<WhisperMedia> {
  const base = getRelayHttpBaseUrl();
  if (!base) throw new WhisperMediaError("Media needs a connection to the feed.");
  const proof = await useIdentityStore.getState().signProof("whisper-media-upload", author);
  if (!proof) throw new WhisperMediaError("Unlock your identity to post media.");

  const extension = WHISPER_MEDIA_TYPES[item.mimeType]?.extension ?? "bin";
  const form = new FormData();
  form.set("author", author);
  form.set("mimeType", item.mimeType);
  form.set("proof", JSON.stringify(proof));
  form.set("file", item.file, `upload.${extension}`);

  const { body, status } = await new Promise<{ body: string; status: number }>(
    (resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", new URL("/api/v1/whispers/media", base).toString());
      request.upload.onprogress = (event) => onProgress?.(event.loaded);
      request.onload = () => resolve({ body: request.responseText, status: request.status });
      request.onerror = () => reject(new WhisperMediaError("Upload failed. Check your connection."));
      request.onabort = () => reject(new WhisperMediaError("Upload was cancelled."));
      request.send(form);
    }
  );

  if (status === 413) throw new WhisperMediaError("That file is larger than the feed accepts.");
  if (status === 415) throw new WhisperMediaError("The feed doesn't accept that type of file.");
  if (status < 200 || status >= 300) throw new WhisperMediaError("Upload failed. Try again.");

  let parsed: ReturnType<typeof WhisperMediaUploadResponseSchema.safeParse>;
  try {
    parsed = WhisperMediaUploadResponseSchema.safeParse(JSON.parse(body));
  } catch {
    throw new WhisperMediaError("The feed sent back something unexpected.");
  }
  if (!parsed.success) throw new WhisperMediaError("The feed sent back something unexpected.");

  return {
    ...parsed.data,
    ...(item.width && item.height ? { width: item.width, height: item.height } : {}),
    ...(item.duration ? { duration: item.duration } : {})
  };
}
