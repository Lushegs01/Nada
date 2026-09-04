import type { AddressInfo } from "node:net";
import { generateKeyPairSync, sign } from "node:crypto";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import { buildSignedMessage, derivePubkeyHash } from "../src/identity-proof";
import { createRelayServer } from "../src/server";

const ORIGIN = "https://nada.test";

function testEnv(): RelayEnv {
  return {
    allowedOrigin: ORIGIN,
    allowDevPlaintext: false,
    capabilityIssuerSecret: undefined,
    capabilityTokenSecret: undefined,
    contestAdminPubkeyHashes: [],
    contestMetricsToken: undefined,
    databasePoolMax: undefined,
    databaseUrl: undefined,
    mediaMaxBytes: 1024,
    mediaS3AccessKeyId: undefined,
    mediaS3Bucket: undefined,
    mediaS3Endpoint: undefined,
    mediaS3Region: "auto",
    mediaS3SecretAccessKey: undefined,
    mediaStorageDir: ".nada-media-test",
    mediaTtlSeconds: 2_592_000,
    nodeEnv: "test",
    port: 0,
    rateLimitIdentityMax: 240,
    rateLimitIpMax: 600,
    redisUrl: undefined,
    relayQueueTtlSeconds: 60,
    stripePriceBusiness: undefined,
    stripePriceEnterprise: undefined,
    stripePricePro: undefined,
    stripeSecretKey: undefined,
    stripeWebhookSecret: undefined,
    turnUsername: undefined,
    turnCredential: undefined,
    turnSharedSecret: undefined,
    turnUrls: [],
    vapidPrivateKey: undefined,
    vapidPublicKey: undefined,
    vapidSubject: undefined,
    zeroLogMode: true
  };
}

function newIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pubkeyBase64 = spki.subarray(spki.length - 32).toString("base64");
  return {
    privateKey,
    pubkey: pubkeyBase64,
    pubkeyHash: derivePubkeyHash(pubkeyBase64)
  };
}

type Identity = ReturnType<typeof newIdentity>;

/** Opens a socket, answers the server's challenge, and resolves once registered. */
async function connectRegistered(
  url: string,
  identity: Identity
): Promise<{ socket: WebSocket; messages: any[] }> {
  const socket = new WebSocket(url, { origin: ORIGIN });
  const messages: any[] = [];

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
            signature: sign(null, Buffer.from(message, "utf8"), identity.privateKey).toString(
              "base64"
            ),
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

/** Waits for a message satisfying `match`, or rejects on timeout. */
function waitFor(
  messages: any[],
  match: (message: any) => boolean,
  timeoutMs = 2000
): Promise<any> {
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

describe("relay socket routing", () => {
  it("routes a message between two registered identities", async () => {
    const url = await startServer();
    const alice = newIdentity();
    const bob = newIdentity();

    const a = await connectRegistered(url, alice);
    const b = await connectRegistered(url, bob);
    openSockets.push(a.socket, b.socket);

    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "11111111-1111-4111-8111-111111111111",
        sender: alice.pubkeyHash,
        recipient: bob.pubkeyHash,
        ciphertext: "encrypted",
        timestamp: Date.now()
      })
    );

    const delivered = await waitFor(b.messages, (m) => m.type === "message");
    expect(delivered.envelope.recipient).toBe(bob.pubkeyHash);
    expect(delivered.envelope.ciphertext).toBe("encrypted");

    const receipt = await waitFor(a.messages, (m) => m.type === "delivery");
    expect(receipt.status).toBe("delivered");
  });

  it("queues for an offline recipient and drains it on reconnect", async () => {
    const url = await startServer();
    const alice = newIdentity();
    const bob = newIdentity();

    const a = await connectRegistered(url, alice);
    openSockets.push(a.socket);

    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "22222222-2222-4222-8222-222222222222",
        sender: alice.pubkeyHash,
        recipient: bob.pubkeyHash,
        ciphertext: "for-later",
        timestamp: Date.now()
      })
    );

    const receipt = await waitFor(a.messages, (m) => m.type === "delivery");
    expect(receipt.status).toBe("queued");

    // Bob connects for the first time and should receive the backlog.
    const b = await connectRegistered(url, bob);
    openSockets.push(b.socket);
    const drained = await waitFor(b.messages, (m) => m.type === "message");
    expect(drained.envelope.ciphertext).toBe("for-later");
  });

  it("rejects envelopes sent before the register handshake completes", async () => {
    const url = await startServer();
    const alice = newIdentity();
    const bob = newIdentity();

    const socket = new WebSocket(url, { origin: ORIGIN });
    openSockets.push(socket);

    const error = await new Promise<any>((resolve, reject) => {
      socket.on("error", reject);
      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            type: "message",
            id: "33333333-3333-4333-8333-333333333333",
            sender: alice.pubkeyHash,
            recipient: bob.pubkeyHash,
            ciphertext: "unauthenticated",
            timestamp: Date.now()
          })
        );
      });
      socket.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === "error") resolve(parsed);
      });
    });

    expect(error.code).toBe("not_registered");
  });

  it("refuses to forward an envelope whose sender is not the authenticated identity", async () => {
    const url = await startServer();
    const alice = newIdentity();
    const bob = newIdentity();
    const mallory = newIdentity();

    const a = await connectRegistered(url, alice);
    openSockets.push(a.socket);

    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "44444444-4444-4444-8444-444444444444",
        sender: mallory.pubkeyHash,
        recipient: bob.pubkeyHash,
        ciphertext: "spoofed",
        timestamp: Date.now()
      })
    );

    const error = await waitFor(a.messages, (m) => m.type === "error");
    expect(error.code).toBe("sender_mismatch");
  });

  it("delivers to every device an identity has connected", async () => {
    const url = await startServer();
    const alice = newIdentity();
    const bob = newIdentity();

    const a = await connectRegistered(url, alice);
    const phone = await connectRegistered(url, bob);
    const laptop = await connectRegistered(url, bob);
    openSockets.push(a.socket, phone.socket, laptop.socket);

    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "55555555-5555-4555-8555-555555555555",
        sender: alice.pubkeyHash,
        recipient: bob.pubkeyHash,
        ciphertext: "multi-device",
        timestamp: Date.now()
      })
    );

    const onPhone = await waitFor(phone.messages, (m) => m.type === "message");
    const onLaptop = await waitFor(laptop.messages, (m) => m.type === "message");
    expect(onPhone.envelope.ciphertext).toBe("multi-device");
    expect(onLaptop.envelope.ciphertext).toBe("multi-device");
  });

  it("refuses an envelope whose sender public key is not the authenticated one", async () => {
    const url = await startServer();
    const alice = newIdentity();
    const bob = newIdentity();
    const mallory = newIdentity();

    const a = await connectRegistered(url, alice);
    openSockets.push(a.socket);

    // The sender field is honest; only the advertised key is swapped. A
    // recipient learns their reply key from this field, so an unchecked value
    // would let an attacker redirect the whole conversation to themselves.
    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "66666666-6666-4666-8666-666666666666",
        sender: alice.pubkeyHash,
        senderPublicKey: mallory.pubkey,
        recipient: bob.pubkeyHash,
        ciphertext: "key-substitution",
        timestamp: Date.now()
      })
    );

    const error = await waitFor(a.messages, (m) => m.type === "error");
    expect(error.code).toBe("sender_public_key_mismatch");
  });

  it("forwards an envelope whose sender public key matches", async () => {
    const url = await startServer();
    const alice = newIdentity();
    const bob = newIdentity();

    const a = await connectRegistered(url, alice);
    const b = await connectRegistered(url, bob);
    openSockets.push(a.socket, b.socket);

    a.socket.send(
      JSON.stringify({
        type: "message",
        id: "77777777-7777-4777-8777-777777777777",
        sender: alice.pubkeyHash,
        senderPublicKey: alice.pubkey,
        recipient: bob.pubkeyHash,
        ciphertext: "sealed",
        timestamp: Date.now()
      })
    );

    const delivered = await waitFor(b.messages, (m) => m.type === "message");
    expect(delivered.envelope.senderPublicKey).toBe(alice.pubkey);
  });

  it("caps how many sockets one identity may hold open", async () => {
    const url = await startServer();
    const alice = newIdentity();

    // MAX_SOCKETS_PER_IDENTITY connections are fine; the next one is refused,
    // because unbounded sockets from one identity is a memory and fan-out
    // amplifier against everyone else on the instance.
    for (let index = 0; index < 8; index += 1) {
      const session = await connectRegistered(url, alice);
      openSockets.push(session.socket);
    }

    const socket = new WebSocket(url, { origin: ORIGIN });
    openSockets.push(socket);
    const error = await new Promise<any>((resolve, reject) => {
      socket.on("error", reject);
      socket.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === "challenge") {
          const timestamp = Date.now();
          const message = buildSignedMessage(
            "ws-register",
            timestamp,
            alice.pubkeyHash,
            parsed.nonce
          );
          socket.send(
            JSON.stringify({
              type: "register",
              pubkey: alice.pubkey,
              pubkeyHash: alice.pubkeyHash,
              nonce: parsed.nonce,
              signature: sign(
                null,
                Buffer.from(message, "utf8"),
                alice.privateKey
              ).toString("base64"),
              timestamp
            })
          );
          return;
        }
        if (parsed.type === "error") resolve(parsed);
      });
    });

    expect(error.code).toBe("too_many_connections");
  });

  it("separates liveness from dependency readiness", async () => {
    await startServer();

    // Nothing is configured in this environment, so readiness must not claim a
    // dependency is healthy — it reports "not-configured" and stays ready,
    // which is the honest answer for a single-instance dev relay.
    const ready = await app!.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ready: true,
      dependencies: {
        database: { status: "not-configured" },
        cache: { status: "not-configured" }
      }
    });
  });

  it("reports which durable backends are configured", async () => {
    await startServer();
    const response = await app!.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    // Without DATABASE_URL/REDIS_URL this deployment is single-instance and
    // ephemeral — /health has to say so rather than just reporting ok.
    expect(response.json()).toMatchObject({
      ok: true,
      backends: {
        database: "memory",
        media: "local",
        queue: "memory",
        scaling: "single-instance"
      }
    });
  });
});
