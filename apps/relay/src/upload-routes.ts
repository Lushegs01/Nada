import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { PubkeyHashSchema, type MediaUploadResponse } from "@nada/types";

import type { RelayEnv } from "./env";
import { verifyIdentityProof, type IdentityProof } from "./identity-proof";
import {
  createMediaStore,
  type MediaStore,
  type StoredMediaMetadata
} from "./media-store";

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

export async function registerUploadRoutes(
  app: FastifyInstance,
  env: RelayEnv,
  mediaStore: MediaStore = createMediaStore(env)
): Promise<void> {
  await (app as any).register(fastifyMultipart, {
    limits: {
      fileSize: env.mediaMaxBytes + 1024 * 1024
    }
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

    // Uploads must prove who is uploading. Without this the route was open
    // object storage: anyone could POST up to the size limit, as fast as the
    // per-IP limiter allowed, with no identity attached and no way to attribute
    // or revoke the traffic. The proof is bound to the claimed sender so it
    // cannot be lifted from one identity's request and reused for another.
    const proof = parseProofField(fields["proof"]);
    if (!proof) {
      return reply.code(400).send({
        code: "missing_proof",
        message: "Media upload requires an identity proof."
      });
    }
    const verification = verifyIdentityProof(proof, {
      context: "media-upload",
      binding: senderResult.data
    });
    if (!verification.ok || verification.pubkeyHash !== senderResult.data) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
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
    const fileName = `${id}.bin`;

    const createdAt = Date.now();
    const expiresAt = createdAt + env.mediaTtlSeconds * 1000;
    const metadata: StoredMediaMetadata = {
      chatId,
      contentHash,
      createdAt,
      expiresAt,
      encryptedSize: fileBuffer.length,
      fileName,
      id,
      mimeType,
      originalName,
      recipientPubkeyHash: recipientResult.data,
      senderPubkeyHash: verification.pubkeyHash,
      size
    };

    await mediaStore.put(id, fileBuffer, metadata);

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
      expiresAt
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

    const stored = await mediaStore.get(id);
    if (!stored) {
      return reply.code(404).send({
        code: "media_not_found",
        message: "Media was not found."
      });
    }

    // Retention is enforced on read as well as by the bucket lifecycle rule:
    // a lifecycle rule runs on its own schedule, so without this an object
    // stays served for hours or days past the retention window it promised.
    if (stored.metadata.expiresAt && stored.metadata.expiresAt <= Date.now()) {
      return reply.code(404).send({
        code: "media_expired",
        message: "Media has passed its retention window."
      });
    }

    return reply
      .header("cache-control", "private, max-age=86400, immutable")
      .header(
        "content-disposition",
        `attachment; filename="${stored.metadata.fileName}"`
      )
      .header("content-length", String(stored.body.length))
      .type("application/octet-stream")
      .send(stored.body);
  });

}

/**
 * Parses the `proof` form field of a multipart upload.
 *
 * Uploads carry their identity proof as a JSON field rather than a header so
 * it travels with the same request the file does; a malformed value is simply
 * "no proof" and the route rejects it.
 */
function parseProofField(raw: string | undefined): IdentityProof | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Record<string, unknown>;
  if (
    typeof value["pubkey"] !== "string" ||
    typeof value["pubkeyHash"] !== "string" ||
    typeof value["signature"] !== "string" ||
    typeof value["timestamp"] !== "number"
  ) {
    return null;
  }
  return value as unknown as IdentityProof;
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
