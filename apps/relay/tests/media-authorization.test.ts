import { generateKeyPairSync, sign } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import { buildSignedMessage, derivePubkeyHash } from "../src/identity-proof";
import type { MediaStore, StoredMediaMetadata } from "../src/media-store";
import { registerUploadRoutes } from "../src/upload-routes";

const OBJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

function storeWith(metadata: Partial<StoredMediaMetadata>): MediaStore {
  const full: StoredMediaMetadata = {
    chatId: "chat",
    contentHash: "hash",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    encryptedSize: 4,
    fileName: `${OBJECT_ID}.bin`,
    id: OBJECT_ID,
    mimeType: "image/png",
    originalName: "photo.png",
    recipientPubkeyHash: "b".repeat(64),
    senderPubkeyHash: "a".repeat(64),
    size: 4,
    ...metadata
  };
  return {
    kind: "local",
    put: async () => {},
    get: async (id) =>
      id === OBJECT_ID ? { body: Buffer.from("data"), metadata: full } : null
  };
}

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

async function serverFor(store: MediaStore): Promise<FastifyInstance> {
  const instance = fastify();
  await registerUploadRoutes(
    instance,
    { mediaMaxBytes: 1024, mediaTtlSeconds: 60 } as unknown as RelayEnv,
    store
  );
  return instance;
}

describe("media download authorization", () => {
  it("refuses a download with no identity proof", async () => {
    app = await serverFor(storeWith({}));
    const response = await app.inject({
      method: "POST",
      url: `/api/media/${OBJECT_ID}`,
      payload: {}
    });
    expect(response.statusCode).toBe(400);
  });

  it("serves a direct object to each of the two parties named on it", async () => {
    const sender = newIdentity();
    const recipient = newIdentity();
    app = await serverFor(
      storeWith({
        senderPubkeyHash: sender.pubkeyHash,
        recipientPubkeyHash: recipient.pubkeyHash
      })
    );

    for (const party of [sender, recipient]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/media/${OBJECT_ID}`,
        payload: { proof: proofFor(party, "media-download", OBJECT_ID) }
      });
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload.toString()).toBe("data");
    }
  });

  it("hides a direct object from an authenticated stranger", async () => {
    const sender = newIdentity();
    const recipient = newIdentity();
    const stranger = newIdentity();
    app = await serverFor(
      storeWith({
        senderPubkeyHash: sender.pubkeyHash,
        recipientPubkeyHash: recipient.pubkeyHash
      })
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/media/${OBJECT_ID}`,
      payload: { proof: proofFor(stranger, "media-download", OBJECT_ID) }
    });

    // 404, not 403: a 403 confirms the object exists to someone with no
    // business knowing that.
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("media_not_found");
  });

  it("rejects a proof bound to a different object", async () => {
    const sender = newIdentity();
    app = await serverFor(storeWith({ senderPubkeyHash: sender.pubkeyHash }));

    const response = await app.inject({
      method: "POST",
      url: `/api/media/${OBJECT_ID}`,
      payload: { proof: proofFor(sender, "media-download", "some-other-object") }
    });
    expect(response.statusCode).toBe(401);
  });

  it("still refuses an object past its retention window", async () => {
    const sender = newIdentity();
    app = await serverFor(
      storeWith({ senderPubkeyHash: sender.pubkeyHash, expiresAt: Date.now() - 1 })
    );

    const response = await app.inject({
      method: "POST",
      url: `/api/media/${OBJECT_ID}`,
      payload: { proof: proofFor(sender, "media-download", OBJECT_ID) }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("media_expired");
  });
});
