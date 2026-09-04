import type { AddressInfo } from "node:net";
import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import {
  createGroupSenderKey,
  createOneTimePrekeys,
  createSignedPrekey,
  decryptWithPrekeys,
  encryptWithPrekeyBundle,
  decryptDirectMessage,
  decryptGroupMessage,
  encryptDirectMessage,
  encryptGroupMessage,
  hashPublicKey,
  openSealedContentKey,
  sealContentKey
} from "@nada/crypto";

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

/**
 * A libsodium identity, plus the Node key handle used to sign the relay's
 * WebSocket challenge. Both halves come from the same Ed25519 seed, so the
 * identity the relay authenticates is the identity that seals the message.
 */
async function newIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  const rawPublic = spki.subarray(spki.length - 32);
  const rawSeed = pkcs8.subarray(pkcs8.length - 32);
  // libsodium's Ed25519 secret key is seed || public key.
  const sodiumPrivate = Buffer.concat([rawSeed, rawPublic]).toString("base64");
  const pubkey = rawPublic.toString("base64");
  return {
    nodePrivateKey: privateKey,
    pubkey,
    privateKey: sodiumPrivate,
    pubkeyHash: derivePubkeyHash(pubkey)
  };
}

type Identity = Awaited<ReturnType<typeof newIdentity>>;

async function connectRegistered(url: string, identity: Identity) {
  const socket = new WebSocket(url, { origin: ORIGIN });
  const messages: Record<string, unknown>[] = [];

  await new Promise<void>((resolve, reject) => {
    socket.on("error", reject);
    socket.on("message", (raw) => {
      const parsed = JSON.parse(raw.toString());
      if (parsed.type === "challenge") {
        const timestamp = Date.now();
        const message = buildSignedMessage(
          "ws-register",
          timestamp,
          identity.pubkeyHash,
          parsed.nonce
        );
        socket.send(
          JSON.stringify({
            type: "register",
            pubkey: identity.pubkey,
            pubkeyHash: identity.pubkeyHash,
            nonce: parsed.nonce,
            signature: sign(
              null,
              Buffer.from(message, "utf8"),
              identity.nodePrivateKey
            ).toString("base64"),
            timestamp
          })
        );
        return;
      }
      if (parsed.type === "registered") {
        resolve();
        return;
      }
      messages.push(parsed);
    });
  });

  return { socket, messages };
}

function waitFor(
  messages: Record<string, unknown>[],
  match: (message: Record<string, unknown>) => boolean,
  timeoutMs = 3000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      const found = messages.find(match);
      if (found) {
        clearInterval(poll);
        resolve(found);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(poll);
        reject(new Error("timed out waiting for message"));
      }
    }, 10);
  });
}

function proofFor(identity: Identity, context: string, binding: string) {
  const timestamp = Date.now();
  const message = buildSignedMessage(context, timestamp, identity.pubkeyHash, binding);
  return {
    pubkey: identity.pubkey,
    pubkeyHash: identity.pubkeyHash,
    signature: sign(
      null,
      Buffer.from(message, "utf8"),
      identity.nodePrivateKey
    ).toString("base64"),
    timestamp
  };
}

let app: FastifyInstance | null = null;
const openSockets: WebSocket[] = [];

async function startServer(): Promise<string> {
  app = await createRelayServer(testEnv());
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  return `ws://127.0.0.1:${port}/ws`;
}

afterEach(async () => {
  openSockets.splice(0).forEach((socket) => socket.close());
  await app?.close();
  app = null;
});

describe("encrypted delivery through the relay", () => {
  it("carries a sealed direct message end to end without exposing the body", async () => {
    const url = await startServer();
    const alice = await newIdentity();
    const bob = await newIdentity();

    const a = await connectRegistered(url, alice);
    const b = await connectRegistered(url, bob);
    openSockets.push(a.socket, b.socket);

    const plaintext = "the relay must never read this";
    const ciphertext = await encryptDirectMessage({
      body: plaintext,
      recipientPubkeyHash: bob.pubkeyHash,
      recipientPublicKey: bob.pubkey,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: alice.privateKey
    });

    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sender: alice.pubkeyHash,
        senderPublicKey: alice.pubkey,
        recipient: bob.pubkeyHash,
        ciphertext,
        timestamp: Date.now()
      })
    );

    const delivered = (await waitFor(b.messages, (m) => m["type"] === "message")) as {
      envelope: { ciphertext: string; senderPublicKey: string };
    };

    // What crossed the wire is opaque.
    expect(delivered.envelope.ciphertext).not.toContain(plaintext);
    expect(JSON.stringify(delivered)).not.toContain(plaintext);

    // Bob verifies the advertised key really is Alice's before trusting it,
    // then opens the message and gets Alice's key back from inside the seal.
    await expect(hashPublicKey(delivered.envelope.senderPublicKey)).resolves.toBe(
      alice.pubkeyHash
    );
    const opened = await decryptDirectMessage({
      payload: delivered.envelope.ciphertext,
      recipientPubkeyHash: bob.pubkeyHash,
      recipientPublicKey: bob.pubkey,
      recipientPrivateKey: bob.privateKey
    });
    expect(opened.body).toBe(plaintext);
    expect(opened.senderPublicKey).toBe(alice.pubkey);
  });

  it("replays a sealed message queued while the recipient was offline", async () => {
    const url = await startServer();
    const alice = await newIdentity();
    const bob = await newIdentity();

    const a = await connectRegistered(url, alice);
    openSockets.push(a.socket);

    const ciphertext = await encryptDirectMessage({
      body: "sent while you were away",
      recipientPubkeyHash: bob.pubkeyHash,
      recipientPublicKey: bob.pubkey,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: alice.privateKey
    });

    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sender: alice.pubkeyHash,
        senderPublicKey: alice.pubkey,
        recipient: bob.pubkeyHash,
        ciphertext,
        timestamp: Date.now()
      })
    );

    const receipt = await waitFor(a.messages, (m) => m["type"] === "delivery");
    expect(receipt["status"]).toBe("queued");

    const b = await connectRegistered(url, bob);
    openSockets.push(b.socket);
    const drained = (await waitFor(b.messages, (m) => m["type"] === "message")) as {
      envelope: { ciphertext: string };
    };

    await expect(
      decryptDirectMessage({
        payload: drained.envelope.ciphertext,
        recipientPubkeyHash: bob.pubkeyHash,
        recipientPublicKey: bob.pubkey,
        recipientPrivateKey: bob.privateKey
      }).then((opened: { body: string }) => opened.body)
    ).resolves.toBe("sent while you were away");
  });

  it("fans a group message out with the key sealed to each member", async () => {
    const url = await startServer();
    const owner = await newIdentity();
    const member = await newIdentity();

    const o = await connectRegistered(url, owner);
    const m = await connectRegistered(url, member);
    openSockets.push(o.socket, m.socket);

    const senderKey = await createGroupSenderKey();
    const keyEnvelopes = await sealContentKey(senderKey, [
      { pubkeyHash: member.pubkeyHash, publicKey: member.pubkey }
    ]);
    const ciphertext = JSON.stringify(
      await encryptGroupMessage("group business", senderKey)
    );

    o.socket.send(
      JSON.stringify({
        type: "group-message",
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        groupId: "study-group",
        recipients: [member.pubkeyHash],
        sender: owner.pubkeyHash,
        senderPublicKey: owner.pubkey,
        keyEnvelopes,
        ciphertext,
        timestamp: Date.now()
      })
    );

    const delivered = (await waitFor(
      m.messages,
      (message) => message["type"] === "group-message"
    )) as {
      envelope: {
        ciphertext: string;
        keyEnvelopes: { recipient: string; sealedKey: string }[];
        senderKeyPackage?: string;
      };
    };

    // The group key must not travel in the clear beside the ciphertext.
    expect(delivered.envelope.senderKeyPackage).toBeUndefined();
    expect(JSON.stringify(delivered)).not.toContain(senderKey);
    expect(JSON.stringify(delivered)).not.toContain("group business");

    const recovered = await openSealedContentKey({
      envelopes: delivered.envelope.keyEnvelopes,
      recipientPubkeyHash: member.pubkeyHash,
      recipientPublicKey: member.pubkey,
      recipientPrivateKey: member.privateKey
    });
    expect(recovered).toBe(senderKey);
    await expect(
      decryptGroupMessage(JSON.parse(delivered.envelope.ciphertext), recovered!)
    ).resolves.toBe("group business");
  });
});

describe("group key rotation over the wire", () => {
  it("leaves a member behind once the key rotates without them", async () => {
    const url = await startServer();
    const owner = await newIdentity();
    const staying = await newIdentity();
    const removed = await newIdentity();

    const o = await connectRegistered(url, owner);
    const s = await connectRegistered(url, staying);
    const r = await connectRegistered(url, removed);
    openSockets.push(o.socket, s.socket, r.socket);

    // Epoch 1: everyone is a member.
    const epochOneKey = await createGroupSenderKey();
    o.socket.send(
      JSON.stringify({
        type: "group-message",
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        groupId: "study-group",
        recipients: [staying.pubkeyHash, removed.pubkeyHash],
        sender: owner.pubkeyHash,
        senderPublicKey: owner.pubkey,
        keyEpoch: 1,
        keyEnvelopes: await sealContentKey(epochOneKey, [
          { pubkeyHash: staying.pubkeyHash, publicKey: staying.pubkey },
          { pubkeyHash: removed.pubkeyHash, publicKey: removed.pubkey }
        ]),
        ciphertext: JSON.stringify(
          await encryptGroupMessage("before the reset", epochOneKey)
        ),
        timestamp: Date.now()
      })
    );
    await waitFor(r.messages, (m) => m["type"] === "group-message");

    // Epoch 2: the owner rotates and seals only to the remaining member.
    const epochTwoKey = await createGroupSenderKey();
    o.socket.send(
      JSON.stringify({
        type: "group-message",
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        groupId: "study-group",
        // The removed member is still addressed here on purpose: even a relay
        // that keeps delivering to them must not make the message readable.
        recipients: [staying.pubkeyHash, removed.pubkeyHash],
        sender: owner.pubkeyHash,
        senderPublicKey: owner.pubkey,
        keyEpoch: 2,
        keyEnvelopes: await sealContentKey(epochTwoKey, [
          { pubkeyHash: staying.pubkeyHash, publicKey: staying.pubkey }
        ]),
        ciphertext: JSON.stringify(
          await encryptGroupMessage("after the reset", epochTwoKey)
        ),
        timestamp: Date.now()
      })
    );

    const rotated = (await waitFor(
      s.messages,
      (m) => m["type"] === "group-message" && (m as any).envelope.keyEpoch === 2
    )) as {
      envelope: {
        ciphertext: string;
        keyEnvelopes: { recipient: string; sealedKey: string }[];
      };
    };

    const forStaying = await openSealedContentKey({
      envelopes: rotated.envelope.keyEnvelopes,
      recipientPubkeyHash: staying.pubkeyHash,
      recipientPublicKey: staying.pubkey,
      recipientPrivateKey: staying.privateKey
    });
    expect(forStaying).toBe(epochTwoKey);
    await expect(
      decryptGroupMessage(JSON.parse(rotated.envelope.ciphertext), forStaying!)
    ).resolves.toBe("after the reset");

    // The removed member holds epoch 1 and has no envelope at epoch 2.
    await expect(
      openSealedContentKey({
        envelopes: rotated.envelope.keyEnvelopes,
        recipientPubkeyHash: removed.pubkeyHash,
        recipientPublicKey: removed.pubkey,
        recipientPrivateKey: removed.privateKey
      })
    ).resolves.toBeNull();
    await expect(
      decryptGroupMessage(JSON.parse(rotated.envelope.ciphertext), epochOneKey)
    ).rejects.toThrow();
  });
});

describe("forward secrecy through the relay", () => {
  it("makes a delivered message unreadable once its prekey is consumed", async () => {
    const url = await startServer();
    const alice = await newIdentity();
    const bob = await newIdentity();

    const a = await connectRegistered(url, alice);
    const b = await connectRegistered(url, bob);
    openSockets.push(a.socket, b.socket);

    // Bob publishes a bundle; Alice claims it through the relay.
    const signed = await createSignedPrekey(bob.privateKey);
    const oneTime = (await createOneTimePrekeys(1))[0]!;
    const publishProof = proofFor(bob, "prekey-publish", signed.id);
    const published = await app!.inject({
      method: "POST",
      url: "/api/v1/prekeys/publish",
      payload: {
        pubkeyHash: bob.pubkeyHash,
        identityPubkey: bob.pubkey,
        signedPrekeyId: signed.id,
        signedPrekey: signed.publicKey,
        signedPrekeySignature: signed.signature,
        oneTimePrekeys: [{ id: oneTime.id, prekey: oneTime.publicKey }],
        proof: publishProof
      }
    });
    expect(published.statusCode).toBe(200);

    const claimed = await app!.inject({
      method: "POST",
      url: "/api/v1/prekeys/claim",
      payload: {
        pubkeyHash: bob.pubkeyHash,
        requester: alice.pubkeyHash,
        proof: proofFor(alice, "prekey-claim", bob.pubkeyHash)
      }
    });
    expect(claimed.statusCode).toBe(200);
    const bundle = claimed.json();

    const plaintext = "this must not survive a later key compromise";
    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        sender: alice.pubkeyHash,
        senderPublicKey: alice.pubkey,
        recipient: bob.pubkeyHash,
        ciphertext: await encryptWithPrekeyBundle({
          body: plaintext,
          bundle,
          recipientPubkeyHash: bob.pubkeyHash,
          senderPublicKey: alice.pubkey,
          senderPrivateKey: alice.privateKey
        }),
        timestamp: Date.now()
      })
    );

    const delivered = (await waitFor(b.messages, (m) => m["type"] === "message")) as {
      envelope: { ciphertext: string };
    };
    expect(delivered.envelope.ciphertext).not.toContain(plaintext);

    // Bob holds both private halves and opens it.
    const held = new Map<string, string>([
      [signed.id, signed.privateKey],
      [oneTime.id, oneTime.privateKey]
    ]);
    const opened = await decryptWithPrekeys({
      payload: delivered.envelope.ciphertext,
      recipientPubkeyHash: bob.pubkeyHash,
      resolvePrekey: async (id) => held.get(id) ?? null
    });
    expect(opened.body).toBe(plaintext);

    // He consumes the one-time prekey, as the client does on receipt. From
    // here the ciphertext is beyond reach — Bob's identity private key is
    // still intact and is no longer enough, which is the entire point.
    held.delete(opened.usedOneTimePrekeyId!);
    await expect(
      decryptWithPrekeys({
        payload: delivered.envelope.ciphertext,
        recipientPubkeyHash: bob.pubkeyHash,
        resolvePrekey: async (id) => held.get(id) ?? null
      })
    ).rejects.toThrow();
  });
});
