import fastify, { type FastifyInstance } from "fastify";
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { RelayDb } from "../src/db";
import type { RelayEnv } from "../src/env";
import { buildSignedMessage, derivePubkeyHash } from "../src/identity-proof";
import {
  OPEN_RANGE_CHUNK_BYTES,
  parseRange,
  registerWhisperMediaRoutes
} from "../src/whisper-media-routes";
import { MemoryWhisperMediaStore } from "../src/whisper-media-store";
import { registerWhisperRoutes } from "../src/whisper-routes";
import { HAS_POSTGRES, createTestDatabase, type TestDatabase } from "./helpers/contest-db";

const env = { databaseUrl: undefined, mediaMaxBytes: 64 * 1024 } as unknown as RelayEnv;

// The smallest bytes each format is recognised by; the relay checks the
// signature, not the whole file.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(29, 7)]);

interface Ghost {
  name: string;
  privateKey: KeyObject;
  pubkey: string;
  pubkeyHash: string;
}

interface FeedEcho {
  body: string;
  id: string;
  media?: Array<Record<string, unknown>>;
  rippleOf?: { id: string; media?: Array<Record<string, unknown>> };
}

function ghost(name: string): Ghost {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pubkey = spki.subarray(spki.length - 32).toString("base64");
  return { name, privateKey, pubkey, pubkeyHash: derivePubkeyHash(pubkey) };
}

function proof(who: Ghost, context: string, binding: string) {
  const timestamp = Date.now();
  const message = buildSignedMessage(context, timestamp, who.pubkeyHash, binding);
  return {
    pubkey: who.pubkey,
    pubkeyHash: who.pubkeyHash,
    signature: sign(null, Buffer.from(message, "utf8"), who.privateKey).toString("base64"),
    timestamp
  };
}

function multipart(
  fields: Record<string, string>,
  file: { body: Buffer; mimeType: string; name: string }
): { headers: Record<string, string>; payload: Buffer } {
  const boundary = `----nada${randomUUID()}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
        `Content-Type: ${file.mimeType}\r\n\r\n`
    ),
    file.body,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  );
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks)
  };
}

let app: FastifyInstance;
let store: MemoryWhisperMediaStore;
const alice = ghost("Alice");
const bob = ghost("Bob");

async function start(db: RelayDb | null): Promise<void> {
  app = fastify();
  store = new MemoryWhisperMediaStore();
  await registerWhisperMediaRoutes(app, env, store);
  await registerWhisperRoutes(app, env, db, null, store);
}

beforeEach(async () => {
  await start(null);
});

afterEach(async () => {
  await app.close();
});

async function upload(
  who: Ghost,
  body: Buffer,
  mimeType: string,
  options: { proofOf?: Ghost } = {}
) {
  const signer = options.proofOf ?? who;
  return app.inject({
    method: "POST",
    url: "/api/v1/whispers/media",
    ...multipart(
      {
        author: who.pubkeyHash,
        mimeType,
        proof: JSON.stringify(proof(signer, "whisper-media-upload", who.pubkeyHash))
      },
      { body, mimeType, name: "upload" }
    )
  });
}

async function uploadId(who: Ghost, body: Buffer, mimeType: string): Promise<string> {
  const response = await upload(who, body, mimeType);
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}

async function publish(
  who: Ghost,
  body: string,
  media?: Array<Record<string, unknown>>,
  id: string = randomUUID()
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/whispers",
    payload: {
      author: who.pubkeyHash,
      authorName: who.name,
      body,
      id,
      timestamp: Date.now(),
      proof: proof(who, "whisper-publish", id),
      ...(media ? { media } : {})
    }
  });
  return { id, response };
}

async function feed(viewer: Ghost): Promise<FeedEcho[]> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/whispers/query",
    payload: { viewerPubkeyHash: viewer.pubkeyHash, since: 0 }
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ echoes: FeedEcho[] }>().echoes;
}

describe("whisper media upload", () => {
  it("stores a photo its author proved they sent", async () => {
    const response = await upload(alice, PNG, "image/png");

    expect(response.statusCode).toBe(201);
    const uploaded = response.json<{ id: string; kind: string; mimeType: string; size: number }>();
    expect(uploaded).toMatchObject({ kind: "image", mimeType: "image/png", size: PNG.length });
    expect((await store.head(uploaded.id))?.uploaderPubkeyHash).toBe(alice.pubkeyHash);
  });

  it("canonicalises a MIME alias", async () => {
    const response = await upload(alice, MP3, "audio/mp3");

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ kind: "audio", mimeType: "audio/mpeg" });
  });

  it("refuses an upload signed by someone other than the named author", async () => {
    const response = await upload(alice, PNG, "image/png", { proofOf: bob });
    expect(response.statusCode).toBe(401);
  });

  it("refuses an upload with no proof", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/media",
      ...multipart(
        { author: alice.pubkeyHash, mimeType: "image/png" },
        { body: PNG, mimeType: "image/png", name: "a.png" }
      )
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a page dressed up as a photo", async () => {
    // Labelled image/png, but the bytes are HTML: served from the relay's
    // origin that would be stored script.
    const html = Buffer.from("<!doctype html><script>alert(1)</script>");
    const response = await upload(alice, html, "image/png");
    expect(response.statusCode).toBe(415);
  });

  it("refuses SVG, which can carry script", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const response = await upload(alice, svg, "image/svg+xml");
    expect(response.statusCode).toBe(415);
  });

  it("refuses a file over the size limit", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(env.mediaMaxBytes)]);
    const response = await upload(alice, big, "image/png");
    expect(response.statusCode).toBe(413);
  });
});

describe("whisper media download", () => {
  it("serves the file publicly with headers that keep it inert", async () => {
    const id = await uploadId(alice, PNG, "image/png");

    const response = await app.inject({ method: "GET", url: `/api/v1/whispers/media/${id}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toContain("sandbox");
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.rawPayload.equals(PNG)).toBe(true);
  });

  it("serves a byte range, which is how video seeks", async () => {
    const id = await uploadId(alice, PNG, "image/png");

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/whispers/media/${id}`,
      headers: { range: "bytes=2-5" }
    });

    expect(response.statusCode).toBe(206);
    expect(response.headers["content-range"]).toBe(`bytes 2-5/${PNG.length}`);
    expect(response.rawPayload.equals(PNG.subarray(2, 6))).toBe(true);
  });

  it("answers a range past the end with 416", async () => {
    const id = await uploadId(alice, PNG, "image/png");

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/whispers/media/${id}`,
      headers: { range: `bytes=${PNG.length}-` }
    });

    expect(response.statusCode).toBe(416);
    expect(response.headers["content-range"]).toBe(`bytes */${PNG.length}`);
  });

  it("404s an unknown or malformed id", async () => {
    const unknown = await app.inject({
      method: "GET",
      url: `/api/v1/whispers/media/${randomUUID()}`
    });
    const malformed = await app.inject({ method: "GET", url: "/api/v1/whispers/media/..%2Fx" });
    expect(unknown.statusCode).toBe(404);
    expect(malformed.statusCode).toBe(404);
  });
});

describe("parseRange", () => {
  it("reads the single-range forms browsers send", () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 100)).toBe("unsatisfiable");
  });

  it("answers an open-ended range in bounded slices", () => {
    const size = OPEN_RANGE_CHUNK_BYTES * 3;
    expect(parseRange("bytes=0-", size)).toEqual({ start: 0, end: OPEN_RANGE_CHUNK_BYTES - 1 });
    expect(parseRange(`bytes=${size - 10}-`, size)).toEqual({ start: size - 10, end: size - 1 });
  });
});

// The Echo rows' new columns are SQL, so these run against Postgres too when
// TEST_DATABASE_URL is set (CI sets it).
const BACKENDS = HAS_POSTGRES ? (["memory", "postgres"] as const) : (["memory"] as const);

describe.each(BACKENDS)("Echoes with media (%s)", (backend) => {
  let database: TestDatabase | null = null;

  beforeAll(async () => {
    if (backend === "postgres") database = await createTestDatabase();
  });

  afterAll(async () => {
    await database?.drop();
  });

  beforeEach(async () => {
    await app.close();
    await start(database?.db ?? null);
  });

  it("publishes a photo with no caption and shows it in the feed", async () => {
    const id = await uploadId(alice, PNG, "image/png");

    const { id: echoId, response } = await publish(alice, "", [
      // A duration means nothing on a photo, so it is dropped.
      { id, width: 640, height: 480, duration: 3 }
    ]);

    expect(response.statusCode).toBe(200);
    const echo = (await feed(bob)).find((item) => item.id === echoId);
    expect(echo?.body).toBe("");
    expect(echo?.media).toEqual([
      { id, kind: "image", mimeType: "image/png", size: PNG.length, width: 640, height: 480 }
    ]);
  });

  it("still refuses an Echo with neither text nor media", async () => {
    const { response } = await publish(alice, "   ");
    expect(response.statusCode).toBe(400);
  });

  it("refuses to attach a file someone else uploaded", async () => {
    const bobsPhoto = await uploadId(bob, PNG, "image/png");

    const { response } = await publish(alice, "look", [{ id: bobsPhoto }]);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "invalid_media" });
  });

  it("refuses to attach a file that was never uploaded", async () => {
    const { response } = await publish(alice, "look", [{ id: randomUUID() }]);
    expect(response.statusCode).toBe(400);
  });

  it("refuses more than four attachments", async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => uploadId(alice, PNG, "image/png"))
    );
    const { response } = await publish(alice, "five", ids.map((id) => ({ id })));
    expect(response.statusCode).toBe(400);
  });

  it("refuses media when the relay has nowhere to keep it", async () => {
    const bare = fastify();
    await registerWhisperRoutes(bare, env, null);
    try {
      const id = randomUUID();
      const response = await bare.inject({
        method: "POST",
        url: "/api/v1/whispers",
        payload: {
          author: alice.pubkeyHash,
          authorName: alice.name,
          body: "hi",
          id,
          timestamp: Date.now(),
          proof: proof(alice, "whisper-publish", id),
          media: [{ id: randomUUID() }]
        }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "media_unavailable" });
    } finally {
      await bare.close();
    }
  });

  it("shows media on Echoes a ghost has liked", async () => {
    const id = await uploadId(alice, PNG, "image/png");
    const { id: echoId } = await publish(alice, "", [{ id }]);
    const like = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/echo",
      payload: {
        echoId,
        on: true,
        reactor: bob.pubkeyHash,
        timestamp: Date.now(),
        proof: proof(bob, "whisper-echo", echoId)
      }
    });
    expect(like.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/profile/likes",
      payload: { pubkeyHash: bob.pubkeyHash, viewerPubkeyHash: alice.pubkeyHash }
    });

    expect(response.statusCode).toBe(200);
    const liked = response.json<{ echoes: FeedEcho[] }>().echoes;
    expect(liked.find((echo) => echo.id === echoId)?.media?.[0]).toMatchObject({ id });
  });

  it("deletes an Echo's files with the Echo, and only for its author", async () => {
    const id = await uploadId(alice, MP3, "audio/mpeg");
    const { id: echoId } = await publish(alice, "a song", [{ id, duration: 12.5 }]);

    const remove = (who: Ghost) =>
      app.inject({
        method: "POST",
        url: "/api/v1/whispers/delete",
        payload: { author: who.pubkeyHash, id: echoId, proof: proof(who, "whisper-delete", echoId) }
      });

    await remove(bob);
    expect(store.has(id)).toBe(true);

    await remove(alice);
    expect(store.has(id)).toBe(false);
    const download = await app.inject({ method: "GET", url: `/api/v1/whispers/media/${id}` });
    expect(download.statusCode).toBe(404);
  });

  it("carries the source's media into a Ripple, read from the relay", async () => {
    const id = await uploadId(alice, PNG, "image/png");
    const { id: sourceId } = await publish(alice, "sunset", [{ id }]);

    const rippleId = randomUUID();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/ripple",
      payload: {
        author: bob.pubkeyHash,
        authorName: bob.name,
        echoId: sourceId,
        id: rippleId,
        timestamp: Date.now(),
        proof: proof(bob, "whisper-ripple", rippleId),
        rippleOf: { authorName: alice.name, body: "sunset", createdAt: Date.now(), id: sourceId }
      }
    });

    expect(response.statusCode).toBe(200);
    const ripple = (await feed(alice)).find((item) => item.id === rippleId);
    expect(ripple?.rippleOf?.media).toEqual([
      { id, kind: "image", mimeType: "image/png", size: PNG.length }
    ]);
  });
});
