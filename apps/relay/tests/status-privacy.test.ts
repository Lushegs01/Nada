import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import { buildSignedMessage, derivePubkeyHash } from "../src/identity-proof";
import { createRelayServer } from "../src/server";

const ORIGIN = "https://nada.test";

function testEnv(): RelayEnv {
  return {
    allowedOrigin: ORIGIN,
    allowDevPlaintext: false,
    mediaMaxBytes: 1024,
    mediaS3Region: "auto",
    mediaStorageDir: ".nada-media-test",
    mediaTtlSeconds: 2_592_000,
    nodeEnv: "test",
    port: 0,
    rateLimitIdentityMax: 240,
    rateLimitIpMax: 600,
    relayQueueTtlSeconds: 60,
    turnUrls: [],
    vapidSubject: "mailto:test@nada.test",
    zeroLogMode: true
  } as unknown as RelayEnv;
}

function newIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pubkey = spki.subarray(spki.length - 32).toString("base64");
  return { privateKey, pubkey, pubkeyHash: derivePubkeyHash(pubkey) };
}

type Identity = ReturnType<typeof newIdentity>;

function proofFor(identity: Identity, context: string, binding: string) {
  const timestamp = Date.now();
  const message = buildSignedMessage(context, timestamp, identity.pubkeyHash, binding);
  return {
    pubkey: identity.pubkey,
    pubkeyHash: identity.pubkeyHash,
    signature: sign(null, Buffer.from(message, "utf8"), identity.privateKey).toString(
      "base64"
    ),
    timestamp
  };
}

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

const STATUS_ID = "88888888-8888-4888-8888-888888888888";

describe("status privacy", () => {
  it("refuses to read statuses without an identity proof", async () => {
    app = await createRelayServer(testEnv());
    const viewer = newIdentity();

    // Pubkey hashes are published on the Whispers feed, so an unauthenticated
    // read let anyone enumerate authors and pull down their statuses.
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/statuses/query",
      payload: {
        senderPubkeyHashes: ["b".repeat(64)],
        viewerPubkeyHash: viewer.pubkeyHash
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it("refuses a proof that belongs to a different identity", async () => {
    app = await createRelayServer(testEnv());
    const viewer = newIdentity();
    const someoneElse = newIdentity();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/statuses/query",
      payload: {
        senderPubkeyHashes: ["b".repeat(64)],
        viewerPubkeyHash: someoneElse.pubkeyHash,
        proof: proofFor(viewer, "status-query", someoneElse.pubkeyHash)
      }
    });

    expect(response.statusCode).toBe(401);
  });

  it("hands each viewer only the status key sealed to them", async () => {
    app = await createRelayServer(testEnv());
    const author = newIdentity();
    const invited = newIdentity();
    const uninvited = newIdentity();

    const publish = await app.inject({
      method: "POST",
      url: "/api/v1/statuses",
      payload: {
        id: STATUS_ID,
        sender: author.pubkeyHash,
        timestamp: Date.now(),
        ciphertext: "opaque-status-ciphertext",
        keyEnvelopes: [
          { recipient: invited.pubkeyHash, sealedKey: "sealed-for-invited" }
        ],
        proof: proofFor(author, "status-publish", STATUS_ID)
      }
    });
    expect(publish.statusCode).toBe(200);

    const forInvited = await app.inject({
      method: "POST",
      url: "/api/v1/statuses/query",
      payload: {
        senderPubkeyHashes: [author.pubkeyHash],
        viewerPubkeyHash: invited.pubkeyHash,
        proof: proofFor(invited, "status-query", invited.pubkeyHash)
      }
    });
    expect(forInvited.statusCode).toBe(200);
    expect(forInvited.json().statuses[0]).toMatchObject({
      id: STATUS_ID,
      statusKeyEnvelope: "sealed-for-invited"
    });

    // The uninvited viewer may see that a status exists — it is routed by
    // sender hash — but never a key, so the ciphertext stays closed.
    const forUninvited = await app.inject({
      method: "POST",
      url: "/api/v1/statuses/query",
      payload: {
        senderPubkeyHashes: [author.pubkeyHash],
        viewerPubkeyHash: uninvited.pubkeyHash,
        proof: proofFor(uninvited, "status-query", uninvited.pubkeyHash)
      }
    });
    expect(forUninvited.statusCode).toBe(200);
    expect(forUninvited.json().statuses[0].statusKeyEnvelope).toBeUndefined();
  });

  it("refuses a publish signed by someone other than the claimed author", async () => {
    app = await createRelayServer(testEnv());
    const author = newIdentity();
    const impostor = newIdentity();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/statuses",
      payload: {
        id: STATUS_ID,
        sender: author.pubkeyHash,
        timestamp: Date.now(),
        ciphertext: "forged",
        proof: proofFor(impostor, "status-publish", STATUS_ID)
      }
    });

    expect(response.statusCode).toBe(401);
  });
});
