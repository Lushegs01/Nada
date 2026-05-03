import {
  MediaUploadResponseSchema,
  type MediaAttachment,
  type MessageKind
} from "@nada/types";

import { nadaDb } from "@/lib/db";
import {
  base64ToBytes,
  decryptEncryptedFileBytes,
  encryptFileForBlindUpload
} from "@/lib/file-encryption";
import { getRelayHttpBaseUrl } from "@/lib/relay-url";
import { classifyMimeType } from "@/lib/media-message";

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const SUPPORTED_PREFIXES = ["image/", "video/", "audio/", "text/"];
const SUPPORTED_EXACT = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

const BLOCKED_EXTENSIONS = new Set([
  "bat",
  "cmd",
  "com",
  "cpl",
  "exe",
  "js",
  "msi",
  "scr",
  "sh",
  "vbs"
]);

export interface PreparedMediaFile {
  file: File;
  originalFile: File;
  kind: MessageKind;
  previewUrl: string | null;
  thumbnailDataUrl: string | null;
  width: number | undefined;
  height: number | undefined;
  duration: number | undefined;
}

export interface UploadMediaParams {
  chatId: string;
  file: File;
  recipientPubkeyHash: string;
  senderPubkeyHash: string;
}

export function validateMediaFile(file: File): string | null {
  if (file.size <= 0) return "This file is empty.";
  if (file.size > MAX_MEDIA_BYTES) {
    return `File too large. Maximum size is ${formatBytes(MAX_MEDIA_BYTES)}.`;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return "This file type is not allowed.";
  }

  const mimeType = file.type || "application/octet-stream";
  const allowed =
    SUPPORTED_EXACT.has(mimeType) ||
    SUPPORTED_PREFIXES.some((prefix) => mimeType.startsWith(prefix));

  return allowed ? null : `Unsupported file type: ${mimeType}.`;
}

export async function prepareMediaFile(file: File): Promise<PreparedMediaFile> {
  const compressed = file.type.startsWith("image/")
    ? await compressImageIfUseful(file)
    : file;
  const kind = classifyMimeType(compressed.type || file.type);
  const previewUrl =
    kind === "image" || kind === "video" || kind === "audio"
      ? URL.createObjectURL(compressed)
      : null;
  const imageSize =
    kind === "image" ? await readImageSize(previewUrl ?? compressed) : null;
  const duration =
    kind === "video" || kind === "audio"
      ? await readMediaDuration(compressed, kind)
      : undefined;
  const thumbnailDataUrl =
    kind === "image" ? await createImageThumbnail(compressed) : null;

  return {
    file: compressed,
    originalFile: file,
    kind,
    previewUrl,
    thumbnailDataUrl,
    width: imageSize?.width,
    height: imageSize?.height,
    duration
  };
}

export async function uploadEncryptedMedia({
  chatId,
  file,
  recipientPubkeyHash,
  senderPubkeyHash
}: UploadMediaParams): Promise<MediaAttachment | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) {
    return null;
  }

  const encryptedFile = await encryptFileForBlindUpload(file);
  await nadaDb.encryptedFiles.put(encryptedFile);

  const encryptedBytes = base64ToBytes(encryptedFile.encryptedBlobBase64);
  const body = new FormData();
  body.set("chatId", chatId);
  body.set("senderPubkeyHash", senderPubkeyHash);
  body.set("recipientPubkeyHash", recipientPubkeyHash);
  body.set("contentHash", encryptedFile.contentHash);
  body.set("mimeType", encryptedFile.mimeType);
  body.set("originalName", file.name);
  body.set("size", String(file.size));
  body.set(
    "file",
    new Blob([encryptedBytes as any], { type: "application/octet-stream" }),
    `${encryptedFile.contentHash}.bin`
  );

  const response = await fetch(new URL("/api/media/upload", relayBaseUrl), {
    body,
    method: "POST"
  });
  if (!response.ok) {
    return null;
  }

  const json: unknown = await response.json();
  const parsed = MediaUploadResponseSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }

  const mediaUrl = new URL(parsed.data.url, relayBaseUrl).toString();
  return {
    id: parsed.data.id,
    url: mediaUrl,
    contentHash: encryptedFile.contentHash,
    keyBase64: encryptedFile.keyBase64,
    nonceBase64: encryptedFile.nonceBase64,
    fileName: parsed.data.fileName,
    originalName: parsed.data.originalName,
    mimeType: parsed.data.mimeType,
    size: parsed.data.size
  };
}

export async function openDecryptedMedia(media: MediaAttachment): Promise<string> {
  if (media.url.startsWith("blob:") || media.url.startsWith("data:")) {
    return media.url;
  }
  if (!media.keyBase64 || !media.nonceBase64) {
    return media.url;
  }

  const response = await fetch(media.url);
  if (!response.ok) {
    throw new Error("Media is unavailable.");
  }

  const encryptedBytes = new Uint8Array(await response.arrayBuffer());
  const plaintext = await decryptEncryptedFileBytes({
    encryptedBlobBase64: bytesToBase64Local(encryptedBytes),
    keyBase64: media.keyBase64,
    nonceBase64: media.nonceBase64
  });
  return URL.createObjectURL(
    new Blob([plaintext as any], { type: media.mimeType || "application/octet-stream" })
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function compressImageIfUseful(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    if (scale >= 1 && file.size < 2 * 1024 * 1024) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], replaceExtension(file.name, "jpg"), {
      lastModified: Date.now(),
      type: "image/jpeg"
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function createImageThumbnail(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const maxSide = 360;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readImageSize(
  source: string | File
): Promise<{ width: number; height: number } | null> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    return { width: image.width, height: image.height };
  } catch {
    return null;
  } finally {
    if (typeof source !== "string") {
      URL.revokeObjectURL(url);
    }
  }
}

async function readMediaDuration(
  file: File,
  kind: MessageKind
): Promise<number | undefined> {
  const url = URL.createObjectURL(file);
  try {
    const element =
      kind === "video" ? document.createElement("video") : document.createElement("audio");
    return await new Promise<number | undefined>((resolve) => {
      element.preload = "metadata";
      element.onloadedmetadata = () => {
        resolve(Number.isFinite(element.duration) ? element.duration : undefined);
      };
      element.onerror = () => resolve(undefined);
      element.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
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
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.includes(".")
    ? fileName.slice(0, fileName.lastIndexOf("."))
    : fileName;
  return `${base}.${extension}`;
}

function bytesToBase64Local(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
