import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import type { WhisperMediaKind } from "@nada/types";

import type { RelayEnv } from "./env";

/**
 * What the relay records about one file attached to an Echo.
 *
 * Whisper media is public, so — unlike chat attachments — it is stored as
 * uploaded rather than client-encrypted, and it has no retention window: it
 * lives exactly as long as the Echo that carries it.
 */
export interface WhisperMediaMetadata {
  createdAt: number;
  id: string;
  kind: WhisperMediaKind;
  /** Verified against the file's bytes at upload; served as-is. */
  mimeType: string;
  size: number;
  /** The identity whose proof authorised the upload. Only they may attach it. */
  uploaderPubkeyHash: string;
}

/** An inclusive byte range, as in an HTTP `Range: bytes=start-end` header. */
export interface ByteRange {
  end: number;
  start: number;
}

export interface WhisperMediaStore {
  readonly kind: "s3" | "local" | "memory";
  put: (id: string, body: Buffer, metadata: WhisperMediaMetadata) => Promise<void>;
  /** Metadata only, without reading the file itself. */
  head: (id: string) => Promise<WhisperMediaMetadata | null>;
  /** The whole file, or one byte range of it — which is how video seeks. */
  read: (id: string, range?: ByteRange) => Promise<Buffer | null>;
  delete: (id: string) => Promise<void>;
}

/**
 * Selects the backend the same way chat media does: object storage when it is
 * configured, the instance filesystem otherwise (local development only — a
 * container filesystem is wiped on deploy and invisible to sibling instances).
 *
 * Objects live under their own `whispers/` prefix so a bucket lifecycle rule
 * that expires chat attachments can be scoped to `media/` and leave Echo media
 * alone.
 */
export function createWhisperMediaStore(env: RelayEnv): WhisperMediaStore {
  if (env.mediaS3Bucket && env.mediaS3AccessKeyId && env.mediaS3SecretAccessKey) {
    return new S3WhisperMediaStore(env);
  }
  return new LocalWhisperMediaStore(path.join(env.mediaStorageDir, "whispers"));
}

function blobKey(id: string): string {
  return `whispers/${id}.bin`;
}

function metaKey(id: string): string {
  return `whispers/${id}.json`;
}

class S3WhisperMediaStore implements WhisperMediaStore {
  readonly kind = "s3" as const;

  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(env: RelayEnv) {
    this.bucket = env.mediaS3Bucket!;
    this.client = new S3Client({
      region: env.mediaS3Region,
      ...(env.mediaS3Endpoint ? { endpoint: env.mediaS3Endpoint } : {}),
      forcePathStyle: Boolean(env.mediaS3Endpoint),
      credentials: {
        accessKeyId: env.mediaS3AccessKeyId!,
        secretAccessKey: env.mediaS3SecretAccessKey!
      }
    });
  }

  async put(id: string, body: Buffer, metadata: WhisperMediaMetadata): Promise<void> {
    await Promise.all([
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: blobKey(id),
          Body: body,
          ContentType: metadata.mimeType
        })
      ),
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: metaKey(id),
          Body: JSON.stringify(metadata),
          ContentType: "application/json"
        })
      )
    ]);
  }

  async head(id: string): Promise<WhisperMediaMetadata | null> {
    try {
      const meta = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: metaKey(id) })
      );
      if (!meta.Body) return null;
      return JSON.parse(await meta.Body.transformToString()) as WhisperMediaMetadata;
    } catch {
      return null;
    }
  }

  async read(id: string, range?: ByteRange): Promise<Buffer | null> {
    try {
      const blob = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: blobKey(id),
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {})
        })
      );
      if (!blob.Body) return null;
      return Buffer.from(await blob.Body.transformToByteArray());
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    await Promise.all([
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: blobKey(id) })),
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: metaKey(id) }))
    ]);
  }
}

class LocalWhisperMediaStore implements WhisperMediaStore {
  readonly kind = "local" as const;

  constructor(private readonly storageDir: string) {}

  private file(id: string, extension: "bin" | "json"): string {
    return path.join(path.resolve(this.storageDir), `${id}.${extension}`);
  }

  async put(id: string, body: Buffer, metadata: WhisperMediaMetadata): Promise<void> {
    await mkdir(path.resolve(this.storageDir), { recursive: true });
    // wx: never silently overwrite an existing id.
    await writeFile(this.file(id, "bin"), body, { flag: "wx" });
    await writeFile(this.file(id, "json"), JSON.stringify(metadata), { flag: "wx" });
  }

  async head(id: string): Promise<WhisperMediaMetadata | null> {
    try {
      const raw = await readFile(this.file(id, "json"), "utf8");
      return JSON.parse(raw) as WhisperMediaMetadata;
    } catch {
      return null;
    }
  }

  async read(id: string, range?: ByteRange): Promise<Buffer | null> {
    try {
      if (!range) return await readFile(this.file(id, "bin"));
      const handle = await open(this.file(id, "bin"), "r");
      try {
        const buffer = Buffer.alloc(range.end - range.start + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, range.start);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    await Promise.all([
      rm(this.file(id, "bin"), { force: true }),
      rm(this.file(id, "json"), { force: true })
    ]);
  }
}

/** In-process store for tests. */
export class MemoryWhisperMediaStore implements WhisperMediaStore {
  readonly kind = "memory" as const;

  private readonly objects = new Map<string, { body: Buffer; metadata: WhisperMediaMetadata }>();

  async put(id: string, body: Buffer, metadata: WhisperMediaMetadata): Promise<void> {
    if (this.objects.has(id)) throw new Error(`Object ${id} already exists.`);
    this.objects.set(id, { body, metadata });
  }

  async head(id: string): Promise<WhisperMediaMetadata | null> {
    return this.objects.get(id)?.metadata ?? null;
  }

  async read(id: string, range?: ByteRange): Promise<Buffer | null> {
    const object = this.objects.get(id);
    if (!object) return null;
    return range ? object.body.subarray(range.start, range.end + 1) : object.body;
  }

  async delete(id: string): Promise<void> {
    this.objects.delete(id);
  }

  has(id: string): boolean {
    return this.objects.has(id);
  }
}
