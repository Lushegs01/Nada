import type { AddressInfo } from "node:net";
import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import {
  createGroupSenderKey,
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
