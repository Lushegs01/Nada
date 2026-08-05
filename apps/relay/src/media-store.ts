import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

import type { RelayEnv } from "./env";

export interface StoredMediaMetadata {
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

export interface StoredMediaObject {
  body: Buffer;
  metadata: StoredMediaMetadata;
}

export interface MediaStore {
  /** Identifies the active backend, surfaced by /health for deploy checks. */
  readonly kind: "s3" | "local";
  put: (
    id: string,
    body: Buffer,
    metadata: StoredMediaMetadata
  ) => Promise<void>;
  get: (id: string) => Promise<StoredMediaObject | null>;
}

/**
 * Selects the media backend.
 *
 * Object storage is what makes attachments survive: the local driver writes to
 * the instance filesystem, which on a container platform is wiped on every
 * redeploy and is invisible to sibling instances, so an upload served by one
 * instance 404s from another. The local driver therefore exists for local
 * development only — production must configure S3/R2.
 */
export function createMediaStore(env: RelayEnv): MediaStore {
  if (
    env.mediaS3Bucket &&
    env.mediaS3AccessKeyId &&
    env.mediaS3SecretAccessKey
  ) {
    return new S3MediaStore(env);
  }

  return new LocalMediaStore(env.mediaStorageDir);
}

class S3MediaStore implements MediaStore {
  readonly kind = "s3" as const;

  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(env: RelayEnv) {
    this.bucket = env.mediaS3Bucket!;
    this.client = new S3Client({
      region: env.mediaS3Region,
      // Set for S3-compatible providers (Cloudflare R2, MinIO, Backblaze B2);
      // omitted for AWS S3 itself, where the SDK derives the endpoint.
      ...(env.mediaS3Endpoint ? { endpoint: env.mediaS3Endpoint } : {}),
      // R2 and most S3-compatibles require path-style addressing.
      forcePathStyle: Boolean(env.mediaS3Endpoint),
      credentials: {
        accessKeyId: env.mediaS3AccessKeyId!,
        secretAccessKey: env.mediaS3SecretAccessKey!
      }
    });
  }

  async put(
    id: string,
    body: Buffer,
    metadata: StoredMediaMetadata
  ): Promise<void> {
    // Metadata rides in a sidecar object rather than S3 user-metadata headers,
    // which are ASCII-only and size-capped — original filenames are neither.
    await Promise.all([
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: blobKey(id),
          Body: body,
          ContentType: "application/octet-stream"
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

  async get(id: string): Promise<StoredMediaObject | null> {
    try {
      const [blob, meta] = await Promise.all([
        this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: blobKey(id) })
        ),
        this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: metaKey(id) })
        )
      ]);

      if (!blob.Body || !meta.Body) return null;

      const [body, metaRaw] = await Promise.all([
        blob.Body.transformToByteArray(),
        meta.Body.transformToString()
      ]);

      return {
        body: Buffer.from(body),
        metadata: JSON.parse(metaRaw) as StoredMediaMetadata
      };
    } catch {
      // A missing key (NoSuchKey) and an unreadable object are both "not
      // found" to the caller; the route turns this into a 404.
      return null;
    }
  }
}

class LocalMediaStore implements MediaStore {
  readonly kind = "local" as const;

  constructor(private readonly storageDir: string) {}

  async put(
    id: string,
    body: Buffer,
    metadata: StoredMediaMetadata
  ): Promise<void> {
    const dir = path.resolve(this.storageDir);
    await mkdir(dir, { recursive: true });
    // wx: never silently overwrite an existing id.
    await writeFile(path.join(dir, `${id}.bin`), body, { flag: "wx" });
    await writeFile(path.join(dir, `${id}.json`), JSON.stringify(metadata), {
      flag: "wx"
    });
  }

  async get(id: string): Promise<StoredMediaObject | null> {
    const dir = path.resolve(this.storageDir);
    try {
      const [body, metaRaw] = await Promise.all([
        readFile(path.join(dir, `${id}.bin`)),
        readFile(path.join(dir, `${id}.json`))
      ]);
      return {
        body,
        metadata: JSON.parse(metaRaw.toString("utf8")) as StoredMediaMetadata
      };
    } catch {
      return null;
    }
  }
}

function blobKey(id: string): string {
  return `media/${id}.bin`;
}

function metaKey(id: string): string {
  return `media/${id}.json`;
}
