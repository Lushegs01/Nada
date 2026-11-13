import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";

import {
  PubkeyHashSchema,
  UuidSchema,
  WHISPER_MEDIA_TYPES,
  resolveWhisperMediaType,
  type WhisperMediaUploadResponse
} from "@nada/types";

import type { RelayEnv } from "./env";
import { verifyIdentityProof, type IdentityProof } from "./identity-proof";
import type { ByteRange, WhisperMediaMetadata, WhisperMediaStore } from "./whisper-media-store";

/**
 * Largest slice served for an open-ended range (`bytes=N-`). Browsers ask for
 * the rest of a video that way and then keep asking; answering in slices keeps
 * one request from holding a whole file in memory, and every browser accepts
 * a 206 shorter than the open range it asked for.
 */
export const OPEN_RANGE_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Public media for Echoes.
 *
 * Upload requires an identity proof, like every other Whisper write, so a file
 * is attributable and only its uploader can attach it to an Echo. Download is
 * a public GET, like the feed itself: Echoes are visible to everyone, and a
 * plain URL is what lets <img> lazy-load and <video> stream and seek.
 *
 * The relay stores what it is sent. Stripping location and camera metadata is
 * the client's job (see apps/web/src/lib/media-sanitize.ts), because the relay
 * never sees a file before its author has decided to publish it.
 */
export async function registerWhisperMediaRoutes(
  app: FastifyInstance,
  env: RelayEnv,
  store: WhisperMediaStore
): Promise<void> {
  // Chat uploads register the same plugin; it is global once registered.
  if (!app.hasRequestDecorator("isMultipart")) {
    await app.register(fastifyMultipart, {
      limits: { fileSize: env.mediaMaxBytes + 1024 * 1024 }
    });
  }

  app.post("/api/v1/whispers/media", async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(400).send({
        code: "invalid_multipart",
        message: "Expected multipart/form-data upload."
      });
    }

    const fields: Record<string, string> = {};
    let file: Buffer | null = null;
    let partMimeType = "";
    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          file = await part.toBuffer();
          partMimeType = part.mimetype;
        } else {
          fields[part.fieldname] = String(part.value).trim();
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(413).send({
          code: "file_too_large",
          message: "This file is larger than the upload limit."
        });
      }
      return reply.code(400).send({
        code: "invalid_multipart",
        message: "Failed to parse multipart request."
      });
    }

    if (!file || file.length === 0) {
      return reply.code(400).send({ code: "missing_file", message: "Upload did not include a file." });
    }
    if (file.length > env.mediaMaxBytes) {
      return reply.code(413).send({
        code: "file_too_large",
        message: "This file is larger than the upload limit."
      });
    }

    const author = PubkeyHashSchema.safeParse(fields["author"]);
    const proof = parseProofField(fields["proof"]);
    if (!author.success || !proof) {
      return reply.code(400).send({
        code: "missing_proof",
        message: "Uploading media requires an author and an identity proof."
      });
    }
    const verification = verifyIdentityProof(proof, {
      context: "whisper-media-upload",
      binding: author.data
    });
    if (!verification.ok || verification.pubkeyHash !== author.data) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    const resolved = resolveWhisperMediaType(fields["mimeType"] || partMimeType, file);
    if (!resolved) {
      return reply.code(415).send({
        code: "unsupported_media",
        message: "Echoes can carry photos, GIFs, video and audio."
      });
    }

    const id = randomUUID();
    const metadata: WhisperMediaMetadata = {
      createdAt: Date.now(),
      id,
      kind: resolved.type.kind,
      mimeType: resolved.mimeType,
      size: file.length,
      uploaderPubkeyHash: verification.pubkeyHash
    };
    await store.put(id, file, metadata);

    const response: WhisperMediaUploadResponse = {
      id,
      kind: metadata.kind,
      mimeType: metadata.mimeType,
      size: metadata.size
    };
    return reply.code(201).send(response);
  });

  app.get(
    "/api/v1/whispers/media/:id",
    {
      // A feed page loads every image on it, and a video seeks with a run of
      // range requests. These carry no identity, so the limiter would key them
      // on IP — and a campus NAT puts thousands of students behind one IP.
      // Reads of public, immutable files are for an edge cache to absorb.
      config: { rateLimit: false }
    },
    async (request, reply) => {
      const { id } = request.params as { id?: string };
      if (!UuidSchema.safeParse(id).success) {
        return reply.code(404).send({ code: "media_not_found", message: "Media was not found." });
      }
      const metadata = await store.head(id!);
      if (!metadata) {
        return reply.code(404).send({ code: "media_not_found", message: "Media was not found." });
      }

      applyServingHeaders(reply, metadata);
      const etag = `"${metadata.id}"`;
      reply.header("etag", etag);
      if (request.headers["if-none-match"] === etag) {
        return reply.code(304).send();
      }

      const range = parseRange(request.headers.range, metadata.size);
      if (range === "unsatisfiable") {
        return reply
          .code(416)
          .header("content-range", `bytes */${metadata.size}`)
          .send();
      }

      const body = await store.read(metadata.id, range ?? undefined);
      if (!body) {
        return reply.code(404).send({ code: "media_not_found", message: "Media was not found." });
      }
      if (range) {
        const end = range.start + body.length - 1;
        reply
          .code(206)
          .header("content-range", `bytes ${range.start}-${end}/${metadata.size}`);
      }
      return reply.header("content-length", String(body.length)).send(body);
    }
  );
}

/**
 * Headers that make user-uploaded bytes safe to serve from the relay's origin.
 * The type was checked against the bytes at upload; `nosniff` stops a browser
 * second-guessing it, and the sandbox CSP means that even a file a browser
 * chose to render as a document could run no script and reach no origin.
 */
function applyServingHeaders(reply: FastifyReply, metadata: WhisperMediaMetadata): void {
  const extension = WHISPER_MEDIA_TYPES[metadata.mimeType]?.extension ?? "bin";
  reply
    .type(metadata.mimeType)
    .header("x-content-type-options", "nosniff")
    .header("content-security-policy", "default-src 'none'; sandbox")
    // The web app lives on another origin and embeds these directly.
    .header("cross-origin-resource-policy", "cross-origin")
    .header("content-disposition", `inline; filename="echo-${metadata.id}.${extension}"`)
    .header("accept-ranges", "bytes")
    // Short-lived on purpose: a deleted Echo's media should stop being served
    // from caches soon after its author takes it down.
    .header("cache-control", "public, max-age=3600");
}

/**
 * Reads a single-range `Range: bytes=…` header. Null means "send the whole
 * file" — no header, or one this does not handle, such as several ranges.
 */
export function parseRange(
  header: string | undefined,
  size: number
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    // Suffix range: the last N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) return "unsatisfiable";
  const end = rawEnd
    ? Math.min(Number(rawEnd), size - 1)
    : Math.min(start + OPEN_RANGE_CHUNK_BYTES - 1, size - 1);
  if (end < start) return "unsatisfiable";
  return { start, end };
}

function parseProofField(raw: string | undefined): IdentityProof | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const proof = parsed as Record<string, unknown>;
    return typeof proof["pubkey"] === "string" &&
      typeof proof["pubkeyHash"] === "string" &&
      typeof proof["signature"] === "string" &&
      typeof proof["timestamp"] === "number"
      ? (proof as unknown as IdentityProof)
      : null;
  } catch {
    return null;
  }
}
