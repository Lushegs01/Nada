import fastify from "fastify";
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import { buildSignedMessage, derivePubkeyHash } from "../src/identity-proof";
import { registerWhisperRoutes } from "../src/whisper-routes";

const env = { databaseUrl: undefined } as unknown as RelayEnv;

function newIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pubkey = spki.subarray(spki.length - 32).toString("base64");
  return { privateKey, pubkey, pubkeyHash: derivePubkeyHash(pubkey) };
}

describe("whisper feed route", () => {
  it("returns the exact feed total independently of the requested page size", async () => {
    const app = fastify();
    await registerWhisperRoutes(app, env, null);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/whispers/query",
        payload: {
          viewerPubkeyHash: "campos-dashboard-readonly",
          limit: 1,
          since: 0
        }
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json<{ echoes: unknown[]; total: number }>();
      expect(payload.echoes).toHaveLength(1);
      expect(payload.total).toBeGreaterThan(payload.echoes.length);
    } finally {
      await app.close();
    }
  });

  it("answers an unchanged re-poll with 304 and no body", async () => {
    // Every open client re-polls this endpoint on a fixed interval and the
    // payload is large but usually identical, so an unchanged poll must not
    // resend the whole feed.
    const app = fastify();
    await registerWhisperRoutes(app, env, null);

    try {
      const query = {
        method: "POST" as const,
        url: "/api/v1/whispers/query",
        payload: { viewerPubkeyHash: "campos-dashboard-readonly", since: 0 }
      };

      const first = await app.inject(query);
      expect(first.statusCode).toBe(200);
      const etag = first.headers.etag as string;
      expect(etag).toMatch(/^W\//);

      const second = await app.inject({
        ...query,
        headers: { "if-none-match": etag }
      });

      expect(second.statusCode).toBe(304);
      expect(second.body).toBe("");
    } finally {
      await app.close();
    }
  });

  it("sends a fresh payload once the feed changes", async () => {
    const app = fastify();
    await registerWhisperRoutes(app, env, null);

    try {
      const query = {
        method: "POST" as const,
        url: "/api/v1/whispers/query",
        payload: { viewerPubkeyHash: "campos-dashboard-readonly", since: 0 }
      };

      const first = await app.inject(query);
      const etag = first.headers.etag as string;

      const author = newIdentity();
      const id = "77777777-7777-4777-8777-777777777777";
      const timestamp = Date.now();
      const message = buildSignedMessage(
        "whisper-publish",
        timestamp,
        author.pubkeyHash,
        id
      );
      const published = await app.inject({
        method: "POST",
        url: "/api/v1/whispers",
        payload: {
          author: author.pubkeyHash,
          authorName: "alice.ghost",
          body: "a new echo",
          id,
          timestamp,
          proof: {
            pubkey: author.pubkey,
            pubkeyHash: author.pubkeyHash,
            signature: sign(
              null,
              Buffer.from(message, "utf8"),
              author.privateKey
            ).toString("base64"),
            timestamp
          }
        }
      });
      expect(published.statusCode).toBe(200);

      const second = await app.inject({
        ...query,
        headers: { "if-none-match": etag }
      });

      expect(second.statusCode).toBe(200);
      expect(second.headers.etag).not.toBe(etag);
    } finally {
      await app.close();
    }
  });
});
