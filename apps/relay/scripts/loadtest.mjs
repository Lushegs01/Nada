/**
 * Relay load harness.
 *
 * Boots a relay in-process, opens N authenticated WebSocket connections (real
 * Ed25519 challenge/response, not a shortcut), and has each client send
 * messages to a randomly chosen peer while recording end-to-end latency —
 * sender's send() to recipient's onmessage.
 *
 * Purpose is to find the bottleneck, not to publish a number: it runs against
 * an in-memory queue and no Redis, so it measures the routing hot path on one
 * instance. Cross-instance delivery adds a Redis round trip per message that
 * this harness deliberately does not model.
 *
 *   pnpm --filter relay loadtest -- --clients 500 --messages 5
 */
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
}

const CLIENTS = arg("clients", 200);
const MESSAGES_PER_CLIENT = arg("messages", 5);
// Connections opened per tick. Creating thousands of sockets in one tick makes
// the harness compete with the relay for the same event loop, so the connect
// phase measures contention rather than the relay. Batching separates them.
const CONNECT_BATCH = arg("connect-batch", 250);
const ORIGIN = "http://127.0.0.1";
// Roughly the size of a sealed text message: a base64 crypto_box_seal of a
// short body plus the signed inner payload.
const PAYLOAD = "x".repeat(700);

const { createRelayServer } = await import("../src/server.ts");
const { derivePubkeyHash, buildSignedMessage } = await import(
  "../src/identity-proof.ts"
);

function newIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const pubkey = spki.subarray(spki.length - 32).toString("base64");
  return { privateKey, pubkey, pubkeyHash: derivePubkeyHash(pubkey) };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

const env = {
  allowedOrigin: ORIGIN,
  allowDevPlaintext: false,
  mediaMaxBytes: 1024 * 1024,
  mediaS3Region: "auto",
  mediaStorageDir: ".nada-media-loadtest",
  mediaTtlSeconds: 2_592_000,
  nodeEnv: "production",
  port: 0,
  rateLimitIdentityMax: 1_000_000,
  rateLimitIpMax: 1_000_000,
  relayQueueTtlSeconds: 60,
  turnUrls: [],
  vapidSubject: "mailto:load@nada.test",
  zeroLogMode: true
};

const app = await createRelayServer(env);
await app.listen({ port: 0, host: "127.0.0.1" });
const url = `ws://127.0.0.1:${app.server.address().port}/ws`;

const identities = Array.from({ length: CLIENTS }, newIdentity);
const sentAt = new Map();
const latencies = [];
let received = 0;
let errors = 0;

function connect(identity) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin: ORIGIN });
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
              identity.privateKey
            ).toString("base64"),
            timestamp
          })
        );
        return;
      }
      if (parsed.type === "registered") {
        resolve(socket);
        return;
      }
      if (parsed.type === "message") {
        const start = sentAt.get(parsed.envelope.id);
        if (start !== undefined) {
          latencies.push(Number(process.hrtime.bigint() - start) / 1e6);
          received += 1;
        }
        return;
      }
      if (parsed.type === "error") {
        errors += 1;
        if (errors === 1) console.error("relay rejected an envelope:", parsed);
      }
    });
  });
}

const connectStart = Date.now();
const sockets = [];
for (let offset = 0; offset < identities.length; offset += CONNECT_BATCH) {
  const batch = identities.slice(offset, offset + CONNECT_BATCH);
  sockets.push(...(await Promise.all(batch.map(connect))));
}
const connectMs = Date.now() - connectStart;

const expected = CLIENTS * MESSAGES_PER_CLIENT;
const sendStart = Date.now();
let sequence = 0;
for (let round = 0; round < MESSAGES_PER_CLIENT; round += 1) {
  for (const [index, socket] of sockets.entries()) {
    const sender = identities[index];
    const recipient = identities[(index + 1 + round) % CLIENTS];
    sequence += 1;
    const id = randomUUID();
    sentAt.set(id, process.hrtime.bigint());
    socket.send(
      JSON.stringify({
        type: "message",
        id,
        sender: sender.pubkeyHash,
        senderPublicKey: sender.pubkey,
        recipient: recipient.pubkeyHash,
        ciphertext: PAYLOAD,
        timestamp: Date.now()
      })
    );
  }
}

const deadline = Date.now() + 30_000;
while (received < expected && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
const sendMs = Date.now() - sendStart;

latencies.sort((a, b) => a - b);
const memory = process.memoryUsage();

console.log(
  JSON.stringify(
    {
      clients: CLIENTS,
      messagesSent: expected,
      messagesDelivered: received,
      errorEnvelopes: errors,
      connectAllMs: connectMs,
      wallClockMs: sendMs,
      throughputPerSecond: Math.round(received / (sendMs / 1000)),
      latencyMs: {
        p50: Number(percentile(latencies, 50).toFixed(2)),
        p95: Number(percentile(latencies, 95).toFixed(2)),
        p99: Number(percentile(latencies, 99).toFixed(2)),
        max: Number((latencies.at(-1) ?? 0).toFixed(2))
      },
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024)
    },
    null,
    2
  )
);

sockets.forEach((socket) => socket.close());
await app.close();
process.exit(0);
