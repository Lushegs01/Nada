import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import {
  createMediaStore,
  type StoredMediaMetadata
} from "../src/media-store";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "nada-media-"));
  dirs.push(dir);
  return dir;
}

function env(overrides: Partial<RelayEnv> = {}): RelayEnv {
  return {
    mediaStorageDir: ".nada-media-test",
    mediaS3Region: "auto",
    ...overrides
  } as unknown as RelayEnv;
}

function metadata(id: string): StoredMediaMetadata {
  return {
    chatId: "chat-1",
    contentHash: "abc123",
    createdAt: 1_700_000_000_000,
    expiresAt: 1_700_000_000_000 + 2_592_000_000,
    encryptedSize: 4,
    fileName: `${id}.bin`,
    id,
    mimeType: "image/png",
    originalName: "photo.png",
    recipientPubkeyHash: "b".repeat(64),
    senderPubkeyHash: "a".repeat(64),
    size: 4
  };
}

describe("media store selection", () => {
  it("uses object storage when a bucket and credentials are configured", () => {
    const store = createMediaStore(
      env({
        mediaS3Bucket: "nada-media",
        mediaS3AccessKeyId: "key",
        mediaS3SecretAccessKey: "secret"
      })
    );
    expect(store.kind).toBe("s3");
  });

  it("falls back to local disk when object storage is not fully configured", () => {
    // Partial configuration must not silently half-enable S3 — a bucket with
    // no credentials would fail on every upload at runtime.
    expect(createMediaStore(env()).kind).toBe("local");
    expect(createMediaStore(env({ mediaS3Bucket: "nada-media" })).kind).toBe(
      "local"
    );
    expect(
      createMediaStore(
        env({ mediaS3Bucket: "nada-media", mediaS3AccessKeyId: "key" })
      ).kind
    ).toBe("local");
  });
});

describe("local media store", () => {
  it("round-trips a blob with its metadata", async () => {
    const store = createMediaStore(env({ mediaStorageDir: await tempStorageDir() }));
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const body = Buffer.from("data");

    await store.put(id, body, metadata(id));
    const stored = await store.get(id);

    expect(stored?.body.equals(body)).toBe(true);
    expect(stored?.metadata.originalName).toBe("photo.png");
  });

  it("returns null for unknown media rather than throwing", async () => {
    const store = createMediaStore(env({ mediaStorageDir: await tempStorageDir() }));
    expect(await store.get("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBeNull();
  });

  it("refuses to overwrite an existing id", async () => {
    const store = createMediaStore(env({ mediaStorageDir: await tempStorageDir() }));
    const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    await store.put(id, Buffer.from("first"), metadata(id));
    await expect(
      store.put(id, Buffer.from("second"), metadata(id))
    ).rejects.toThrow();

    const stored = await store.get(id);
    expect(stored?.body.toString()).toBe("first");
  });
});
