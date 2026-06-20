import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BlindUploadRequestSchema,
  PubkeyHashSchema,
  type BlindUploadResponse,
  type MediaUploadResponse
} from "@nada/types";

import type { RelayEnv } from "./env";

const SAFE_MIME_PREFIXES = ["image/", "video/", "audio/", "text/"];
const SAFE_MIME_EXACT = new Set([
  "application/octet-stream",
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
  ".bat",
  ".cmd",
  ".com",
  ".cpl",
  ".exe",
  ".js",
  ".msi",
  ".scr",
  ".sh",
  ".vbs"
]);

interface StoredMediaMetadata {
  chatId: string;
  contentHash: string;
  createdAt: number;
  encryptedSize: number;
  fileName: string;
  id: string;
  mimeType: string;
  originalName: string;
  recipientPubkeyHash: string;
  senderPubkeyHash: string;
  size: number;
}

export async function registerUploadRoutes(
  app: FastifyInstance,
  env: RelayEnv
): Promise<void> {
  await (app as any).register(fastifyMultipart, {
    limits: {
      fileSize: env.mediaMaxBytes + 1024 * 1024
    }
  });

  app.post("/api/v1/upload/request", async (request, reply) => {
    const result = BlindUploadRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_upload_request",
        message: "Invalid upload request."
      });
    }

    const response: BlindUploadResponse = {
      uploadId: randomUUID(),
      contentHash: result.data.contentHash,
      expiresAt: Date.now() + 15 * 60 * 1000,
      uploadUrl: null,
      storage: "client-encrypted-blind-upload-mvp"
    };

    return reply.send(response);
  });

  app.post("/api/media/upload", async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(400).send({
        code: "invalid_multipart",
        message: "Expected multipart/form-data upload."
      });
    }

    const fields: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    let uploadFilename = "";

    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          fileBuffer = await part.toBuffer();
          uploadFilename = part.filename;
        } else {
          fields[part.fieldname] = String(part.value).trim();
        }
      }
    } catch {
      return reply.code(400).send({
        code: "invalid_multipart",
        message: "Failed to parse multipart request."
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.code(400).send({
        code: "missing_file",
        message: "Upload did not include a file."
      });
    }

    if (fileBuffer.length > env.mediaMaxBytes) {
      return reply.code(413).send({
        code: "file_too_large",
        message: "Encrypted media exceeds the relay size limit."
      });
    }

    const senderResult = PubkeyHashSchema.safeParse(fields["senderPubkeyHash"]);
    const recipientResult = PubkeyHashSchema.safeParse(fields["recipientPubkeyHash"]);
    if (!senderResult.success || !recipientResult.success) {
      return reply.code(400).send({
        code: "invalid_identity",
        message: "Upload requires sender and recipient pubkey hashes."
      });
    }

    const chatId = fields["chatId"]?.slice(0, 256);
    const originalName = sanitizeFileName(fields["originalName"] || uploadFilename || "media.bin");
    const mimeType = normalizeMime(fields["mimeType"]);
    const size = Number.parseInt(fields["size"] ?? "", 10);

    if (!chatId || !Number.isFinite(size) || size <= 0) {
      return reply.code(400).send({
        code: "invalid_metadata",
        message: "Upload metadata is invalid."
      });
    }

    if (!isMimeAllowed(mimeType) || isBlockedName(originalName)) {
      return reply.code(415).send({
        code: "unsupported_media",
        message: "This file type is not allowed."
      });
    }

    const contentHash = createHash("sha256").update(fileBuffer).digest("hex");
    if (fields["contentHash"] && fields["contentHash"] !== contentHash) {
      return reply.code(400).send({
        code: "content_hash_mismatch",
        message: "Encrypted upload hash does not match the request metadata."
      });
    }

    const id = randomUUID();
    const storageDir = path.resolve(env.mediaStorageDir);
    await mkdir(storageDir, { recursive: true });
    
    const fileName = `${id}.bin`;
    const filePath = path.join(storageDir, fileName);
    const metaPath = path.join(storageDir, `${id}.json`);
    
    await writeFile(filePath, fileBuffer, { flag: "wx" });

    const metadata: StoredMediaMetadata = {
      chatId,
      contentHash,
      createdAt: Date.now(),
      encryptedSize: fileBuffer.length,
      fileName,
      id,
      mimeType,
      originalName,
      recipientPubkeyHash: recipientResult.data,
      senderPubkeyHash: senderResult.data,
      size
    };
    
    await writeFile(metaPath, JSON.stringify(metadata), { flag: "wx" });

    const response: MediaUploadResponse = {
      id,
      url: `/api/media/${id}`,
      fileName,
      originalName,
      mimeType,
      size,
      encryptedSize: fileBuffer.length,
      contentHash,
      createdAt: metadata.createdAt,
      expiresAt: null
    };

    return reply.code(201).send(response);
  });

  app.get("/api/media/:id", async (request, reply) => {
    const { id } = request.params as { id?: string };
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return reply.code(404).send({
        code: "media_not_found",
        message: "Media was not found."
      });
    }

    const storageDir = path.resolve(env.mediaStorageDir);
    const filePath = path.join(storageDir, `${id}.bin`);
    const metaPath = path.join(storageDir, `${id}.json`);
    try {
      const [fileBuffer, metaBuffer, fileStat] = await Promise.all([
        readFile(filePath),
        readFile(metaPath),
        stat(filePath)
      ]);
      const metadata = JSON.parse(metaBuffer.toString("utf8")) as StoredMediaMetadata;
      return reply
        .header("cache-control", "private, max-age=31536000, immutable")
        .header("content-disposition", `attachment; filename="${metadata.fileName}"`)
        .header("content-length", String(fileStat.size))
        .type("application/octet-stream")
        .send(fileBuffer);
    } catch {
      return reply.code(404).send({
        code: "media_not_found",
        message: "Media was not found."
      });
    }
  });

  app.get("/api/v1/download/:contentHash", async (_request, reply) =>
    reply.code(404).send({
      code: "blind_download_not_configured",
      message: "Use /api/media/:id for encrypted media uploaded through this relay."
    })
  );
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\- ()]/g, "_").slice(0, 255) || "media.bin";
}

function normalizeMime(mimeType: string | undefined): string {
  return mimeType?.trim().toLowerCase() || "application/octet-stream";
}

function isMimeAllowed(mimeType: string): boolean {
  return (
    SAFE_MIME_EXACT.has(mimeType) ||
    SAFE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
  );
}

function isBlockedName(fileName: string): boolean {
  return BLOCKED_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}
