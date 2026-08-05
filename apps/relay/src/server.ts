import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastify, { type FastifyInstance } from "fastify";
import { randomBytes, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

import {
  ClientSocketEnvelopeSchema,
  type CallSignalEnvelope,
  type DeletionEnvelope,
  type GroupMessageEnvelope,
  type MessageEnvelope,
  type ProductionEnvelope,
  type PubkeyHash,
  type ReactionEnvelope,
  type TypingEnvelope
} from "@nada/types";

import { createRelayDb, ensureRelaySchema } from "./db";
import type { RelayEnv } from "./env";
import { verifyIdentityProof } from "./identity-proof";
import { createLoggerOption } from "./logger";
import { registerMonetizationRoutes } from "./monetization-routes";
import { isOriginAllowed } from "./origin";
import { createMediaStore } from "./media-store";
import { createPresenceBus, type PresenceBus } from "./presence-bus";
import { createRelayQueue, type RelayQueue } from "./queue";
import {
  buildRateLimitKey,
  createRedisRateLimitStore,
  isRateLimitAllowListed,
  resolveRateLimitMax
} from "./rate-limit";
import { createRelayRedis } from "./redis";
import { registerPushRoutes } from "./push-routes";
import { registerStatusRoutes } from "./status-routes";
import { registerTurnRoutes } from "./turn-routes";
import { registerUploadRoutes } from "./upload-routes";
import { registerWhisperRoutes } from "./whisper-routes";

type ClientSocket = WebSocket;

interface PendingHandshake {
  nonce: string;
  issuedAt: number;
}

interface SessionRegistry {
  socketsByPubkeyHash: Map<PubkeyHash, Set<ClientSocket>>;
  pubkeyHashBySocket: Map<ClientSocket, PubkeyHash>;
  /** Sockets that have opened but not yet completed register handshake. */
  pendingHandshakes: Map<ClientSocket, PendingHandshake>;
}

const HANDSHAKE_TIMEOUT_MS = 30_000;

interface PushPayload {
  title: string;
  body: string;
  kind: "message" | "group" | "status" | "comment" | "call" | "encrypted";
  chatId: string;
  tag: string;
  requireInteraction?: boolean;
}

export async function createRelayServer(env: RelayEnv): Promise<FastifyInstance> {
  const app = fastify({
    logger: createLoggerOption(env) as any,
    trustProxy: true
  });

  // One shared Redis connection pair backs the offline queue, the rate-limit
  // store, and the cross-instance delivery bus.
  const redis = await createRelayRedis(env, app.log);
  const queue = await createRelayQueue(env, redis);
  const bus = createPresenceBus(redis);
  const mediaStore = createMediaStore(env);
  const sessions: SessionRegistry = {
    socketsByPubkeyHash: new Map(),
    pubkeyHashBySocket: new Map(),
    pendingHandshakes: new Map()
  };

  // One pooled Postgres handle shared by every repository and by the stats
  // endpoint. The schema is applied once here rather than once per repository.
  const db = createRelayDb(env, app.log);
  if (db) {
    await ensureRelaySchema(db);
  }

  await (app as any).register(cors, {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, isOriginAllowed(origin, env.allowedOrigin));
    }
  });
  await (app as any).register(rateLimit, {
    // preHandler (rather than the default onRequest) so the parsed body is
    // available to the key generator — that is where a request's NADA identity
    // lives. Body-size limits still cap what gets parsed.
    hook: "preHandler",
    keyGenerator: buildRateLimitKey,
    max: (_request: unknown, key: string) => resolveRateLimitMax(env, key),
    allowList: (request: any) => isRateLimitAllowListed(request),
    // Shared counters across instances; without this each instance keeps its
    // own tally and N instances silently permit N times the limit.
    ...(redis ? { store: createRedisRateLimitStore(redis.command) } : {}),
    // A Redis blip must degrade to "allow", never to a 500 on every request.
    skipOnError: true,
    timeWindow: "1 minute"
  });
  await (app as any).register(websocket);
  await registerMonetizationRoutes(app as any, env, db);
  await registerPushRoutes(app as any, env, db);
  await registerStatusRoutes(app as any, env, db);
  await registerTurnRoutes(app as any, env);
  await registerUploadRoutes(app as any, env, mediaStore);
  await registerWhisperRoutes(app as any, env, db);

  app.addHook("onClose", async () => {
    await queue.close();
    await bus.close();
    await redis?.close();
    await db?.close();
  });

  // Reports which durable backends are actually wired up. Each of these
  // silently falls back to a single-instance/ephemeral mode when its config is
  // missing, so a deploy that quietly lost REDIS_URL or its bucket
  // credentials would otherwise look healthy right up until data goes missing.
  app.get("/health", async () => ({
    ok: true,
    service: "nada-relay",
    backends: {
      database: db ? "postgres" : "memory",
      media: mediaStore.kind,
      // "memory" here means offline envelopes are lost on restart and the
      // relay cannot be scaled beyond one instance.
      queue: redis ? "redis" : "memory",
      scaling: redis ? "multi-instance" : "single-instance"
    }
  }));

  app.get("/stats", async () => {
    let totalRegisteredUsers: number | null = null;
    if (db) {
      try {
        const result = await db.query<{ count: string }>(
          "select count(*) as count from users"
        );
        totalRegisteredUsers = Number(result.rows[0]?.count ?? 0);
      } catch {
        // DB unavailable — return null rather than crashing
      }
    }

    return {
      uniqueUsersOnline: sessions.socketsByPubkeyHash.size,
      totalConnections: sessions.pubkeyHashBySocket.size,
      pendingHandshakes: sessions.pendingHandshakes.size,
      totalRegisteredUsers,
      timestamp: new Date().toISOString()
    };
  });

  app.get("/ws", { websocket: true }, (connection, request) => {
    if (!isOriginAllowed(request.headers.origin, env.allowedOrigin)) {
      app.log.warn({ origin: request.headers.origin, allowed: env.allowedOrigin }, "WebSocket origin not allowed");
      connection.socket.close(1008, "Origin not allowed");
      return;
    }

    const nonce = randomBytes(32).toString("base64");
    sessions.pendingHandshakes.set(connection.socket, {
      nonce,
      issuedAt: Date.now()
    });
    connection.socket.send(JSON.stringify({ type: "challenge", nonce }));

    const handshakeTimer = setTimeout(() => {
      if (sessions.pendingHandshakes.has(connection.socket)) {
        connection.socket.close(1008, "Handshake timeout");
      }
    }, HANDSHAKE_TIMEOUT_MS);

    connection.socket.on("message", (raw) => {
      void handleSocketMessage(
        connection.socket,
        raw.toString(),
        sessions,
        queue,
        bus,
        app as any,
        env
      );
    });

    const teardown = () => {
      clearTimeout(handshakeTimer);
      sessions.pendingHandshakes.delete(connection.socket);
      void unregisterSocket(connection.socket, sessions, bus).catch((error) => {
        app.log.error({ err: error }, "Failed to release socket presence");
      });
    };

    connection.socket.on("close", teardown);
    connection.socket.on("error", teardown);
  });

  return app as any;
}

async function handleSocketMessage(
  socket: ClientSocket,
  raw: string,
  sessions: SessionRegistry,
  queue: RelayQueue,
  bus: PresenceBus,
  app: any,
  env: RelayEnv
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendSocketError(socket, "invalid_json", "Invalid envelope.");
    return;
  }

  const result = ClientSocketEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    sendSocketError(socket, "invalid_envelope", "Invalid envelope.");
    return;
  }

  if ("type" in result.data && result.data.type === "register") {
    const pending = sessions.pendingHandshakes.get(socket);
    if (!pending) {
      sendSocketError(
        socket,
        "no_pending_handshake",
        "Register received without a server-issued challenge."
      );
      socket.close(1008, "No pending handshake");
      return;
    }

    const verification = verifyIdentityProof(
      {
        pubkey: result.data.pubkey,
        pubkeyHash: result.data.pubkeyHash,
        signature: result.data.signature,
        timestamp: result.data.timestamp
      },
      { context: "ws-register", binding: pending.nonce }
    );

    if (!verification.ok || result.data.nonce !== pending.nonce) {
      sendSocketError(
        socket,
        "register_proof_invalid",
        "Identity proof failed verification."
      );
      socket.close(1008, "Register proof invalid");
      return;
    }

    sessions.pendingHandshakes.delete(socket);
    await registerSocket(socket, verification.pubkeyHash, sessions, bus);
    socket.send(
      JSON.stringify({ type: "registered", pubkeyHash: verification.pubkeyHash })
    );
    await drainQueuedMessages(verification.pubkeyHash, socket, queue);
    return;
  }

  // Any envelope type other than register requires the socket to have already
  // completed the challenge-response handshake.
  if (!sessions.pubkeyHashBySocket.has(socket)) {
    sendSocketError(
      socket,
      "not_registered",
      "Sign-challenge handshake required before sending envelopes."
    );
    socket.close(1008, "Not registered");
    return;
  }

  const authenticatedPubkeyHash = sessions.pubkeyHashBySocket.get(socket);
  if (!authenticatedPubkeyHash) {
    return;
  }

  // Outbound `sender` fields must match the authenticated pubkeyHash so a
  // malicious client can't impersonate someone else by spoofing the field.
  if ("sender" in result.data && result.data.sender !== authenticatedPubkeyHash) {
    sendSocketError(
      socket,
      "sender_mismatch",
      "Envelope sender does not match the authenticated identity."
    );
    return;
  }

  if ("type" in result.data && result.data.type === "message") {
    // devPlaintext is a dev-only debug field that ships plaintext alongside
    // ciphertext. The relay unconditionally strips it unless explicitly
    // opted in via ALLOW_DEV_PLAINTEXT=true on the server. This is the only
    // correct gate — relying on the schema baked at module-load from
    // NODE_ENV is unreliable across self-hosted and preview deployments.
    if (!env.allowDevPlaintext && result.data.devPlaintext !== undefined) {
      delete (result.data as { devPlaintext?: unknown }).devPlaintext;
    }
    await routeMessage(result.data, sessions, queue, bus, app);
    return;
  }

  if ("type" in result.data && result.data.type === "group-message") {
    if (!env.allowDevPlaintext && result.data.devPlaintext !== undefined) {
      delete (result.data as { devPlaintext?: unknown }).devPlaintext;
    }
    await routeGroupMessage(result.data, sessions, queue, bus, app);
    return;
  }

  if ("type" in result.data && result.data.type === "call-signal") {
    await routeCallSignal(result.data, sessions, bus, app);
    return;
  }

  if ("type" in result.data && result.data.type === "typing") {
    await routeTyping(result.data, sessions, bus);
    return;
  }

  if ("type" in result.data && result.data.type === "reaction") {
    await routeReaction(result.data, sessions, bus);
    return;
  }

  if ("type" in result.data && result.data.type === "deletion") {
    await routeDeletion(result.data, sessions, queue, bus);
    return;
  }

  if ("type" in result.data && result.data.type === "delivery") {
    await routeDelivery(result.data as any, sessions, bus);
    return;
  }

  if ("version" in result.data) {
    await routeProductionEnvelope(result.data, socket, sessions, queue, bus, app);
    return;
  }

  sendSocketError(socket, "invalid_envelope", "Invalid envelope.");
}

async function registerSocket(
  socket: ClientSocket,
  pubkeyHash: PubkeyHash,
  sessions: SessionRegistry,
  bus: PresenceBus
): Promise<void> {
  await unregisterSocket(socket, sessions, bus);
  const existing = sessions.socketsByPubkeyHash.get(pubkeyHash) ?? new Set();
  existing.add(socket);
  sessions.socketsByPubkeyHash.set(pubkeyHash, existing);
  sessions.pubkeyHashBySocket.set(socket, pubkeyHash);

  // Tell the rest of the fleet this instance now holds the identity, so
  // senders on other instances route here instead of queueing as offline.
  await bus.track(pubkeyHash, (payload) => {
    sessions.socketsByPubkeyHash
      .get(pubkeyHash)
      ?.forEach((target) => target.send(payload));
  });
}

async function unregisterSocket(
  socket: ClientSocket,
  sessions: SessionRegistry,
  bus: PresenceBus
): Promise<void> {
  const pubkeyHash = sessions.pubkeyHashBySocket.get(socket);
  if (!pubkeyHash) {
    return;
  }

  const sockets = sessions.socketsByPubkeyHash.get(pubkeyHash);
  sockets?.delete(socket);
  sessions.pubkeyHashBySocket.delete(socket);

  // Only stop listening once this instance holds no socket at all for the
  // identity — a user with several devices on one instance must keep receiving
  // remote envelopes while any of them is still connected.
  if (!sockets || sockets.size === 0) {
    sessions.socketsByPubkeyHash.delete(pubkeyHash);
    await bus.untrack(pubkeyHash);
  }
}

/**
 * Sends an already-serialized payload to every socket holding `recipient`,
 * on this instance and on all others, and reports whether any instance had
 * the recipient connected. A false return is the authoritative "offline
 * everywhere" signal that callers use to decide to queue instead.
 */
async function deliverToRecipient(
  recipient: PubkeyHash,
  serialized: string,
  sessions: SessionRegistry,
  bus: PresenceBus
): Promise<boolean> {
  const local = sessions.socketsByPubkeyHash.get(recipient);
  const deliveredLocally = Boolean(local && local.size > 0);
  local?.forEach((socket) => socket.send(serialized));

  const remoteReceivers = await bus.publish(recipient, serialized);
  return deliveredLocally || remoteReceivers > 0;
}

/** Delivery receipts are best-effort status, never queued for later. */
async function sendDeliveryReceipt(
  target: PubkeyHash,
  id: string,
  status: "delivered" | "queued" | "failed",
  sessions: SessionRegistry,
  bus: PresenceBus
): Promise<void> {
  await deliverToRecipient(
    target,
    JSON.stringify({ type: "delivery", id, status }),
    sessions,
    bus
  );
}

async function routeMessage(
  envelope: MessageEnvelope,
  sessions: SessionRegistry,
  queue: RelayQueue,
  bus: PresenceBus,
  app: FastifyInstance
): Promise<void> {
  const serialized = JSON.stringify({ type: "message", envelope });
  const delivered = await deliverToRecipient(
    envelope.recipient,
    serialized,
    sessions,
    bus
  );

  if (!delivered) {
    // Offline on every instance — queue it for delivery on reconnect.
    await queue.enqueue(envelope.recipient, serialized);
  }

  queuePush(app, envelope.recipient, buildDirectPushPayload(envelope));
  // "queued" rather than "failed" so the sender UI shows a clock, not an error.
  await sendDeliveryReceipt(
    envelope.sender,
    envelope.id,
    delivered ? "delivered" : "queued",
    sessions,
    bus
  );
}

async function routeGroupMessage(
  envelope: GroupMessageEnvelope,
  sessions: SessionRegistry,
  queue: RelayQueue,
  bus: PresenceBus,
  app: FastifyInstance
): Promise<void> {
  const serialized = JSON.stringify({ type: "group-message", envelope });

  const outcomes = await Promise.all(
    envelope.recipients.map(async (recipient) => {
      queuePush(app, recipient, buildGroupPushPayload(envelope));
      const delivered = await deliverToRecipient(
        recipient,
        serialized,
        sessions,
        bus
      );
      if (!delivered) {
        // Queue for each offline group member individually.
        await queue.enqueue(recipient, serialized);
      }
      return delivered;
    })
  );

  await sendDeliveryReceipt(
    envelope.sender,
    envelope.id,
    outcomes.some(Boolean) ? "delivered" : "queued",
    sessions,
    bus
  );
}

async function routeCallSignal(
  envelope: CallSignalEnvelope,
  sessions: SessionRegistry,
  bus: PresenceBus,
  app: FastifyInstance
): Promise<void> {
  if (envelope.signalType === "offer") {
    queuePush(app, envelope.recipient, buildCallPushPayload(envelope));
  }

  const delivered = await deliverToRecipient(
    envelope.recipient,
    JSON.stringify({ type: "call-signal", envelope }),
    sessions,
    bus
  );

  // Call signalling is real-time only: an absent callee is a failed call, not
  // something to replay later.
  if (!delivered) {
    await sendDeliveryReceipt(
      envelope.sender,
      envelope.id,
      "failed",
      sessions,
      bus
    );
  }
}

// Typing events are ephemeral — forward to recipient, never queue or persist.
async function routeTyping(
  envelope: TypingEnvelope,
  sessions: SessionRegistry,
  bus: PresenceBus
): Promise<void> {
  await deliverToRecipient(
    envelope.recipient,
    JSON.stringify({ type: "typing", envelope }),
    sessions,
    bus
  );
}

// Reaction events are ephemeral — forward to recipient, never queue or persist.
async function routeReaction(
  envelope: ReactionEnvelope,
  sessions: SessionRegistry,
  bus: PresenceBus
): Promise<void> {
  await deliverToRecipient(
    envelope.recipient,
    JSON.stringify({ type: "reaction", envelope }),
    sessions,
    bus
  );
}

async function routeDelivery(
  envelope: { type: "delivery"; id: string; recipient: string; status: "delivered" | "read" | "queued" | "sent" | "failed" },
  sessions: SessionRegistry,
  bus: PresenceBus
): Promise<void> {
  await deliverToRecipient(
    envelope.recipient,
    JSON.stringify({
      type: "delivery",
      id: envelope.id,
      status: envelope.status
    }),
    sessions,
    bus
  );
}

async function routeDeletion(
  envelope: DeletionEnvelope,
  sessions: SessionRegistry,
  queue: RelayQueue,
  bus: PresenceBus
): Promise<void> {
  const serialized = JSON.stringify({ type: "deletion", envelope });
  const delivered = await deliverToRecipient(
    envelope.recipient,
    serialized,
    sessions,
    bus
  );

  if (!delivered) {
    await queue.enqueue(envelope.recipient, serialized);
  }

  await sendDeliveryReceipt(
    envelope.sender,
    envelope.id,
    delivered ? "delivered" : "queued",
    sessions,
    bus
  );
}

async function routeProductionEnvelope(
  envelope: ProductionEnvelope,
  senderSocket: ClientSocket,
  sessions: SessionRegistry,
  queue: RelayQueue,
  bus: PresenceBus,
  app: FastifyInstance
): Promise<void> {
  const serialized = JSON.stringify({ type: "sealed-message", envelope });
  const delivered = await deliverToRecipient(
    envelope.recipient,
    serialized,
    sessions,
    bus
  );

  if (!delivered) {
    await queue.enqueue(envelope.recipient, serialized);
    senderSocket.send(
      JSON.stringify({
        type: "delivery",
        id: randomUUID(),
        status: "queued"
      })
    );
  }

  queuePush(app, envelope.recipient, {
    title: "New encrypted message",
    body: "You received a private NADA message.",
    chatId: envelope.recipient,
    kind: "encrypted",
    tag: `sealed:${envelope.recipient}`
  });
}

async function drainQueuedMessages(
  pubkeyHash: PubkeyHash,
  socket: ClientSocket,
  queue: RelayQueue
): Promise<void> {
  const messages = await queue.drain(pubkeyHash);
  messages.forEach((message) => {
    socket.send(message);
  });
}

function sendSocketError(
  socket: ClientSocket,
  code: string,
  message: string
): void {
  socket.send(JSON.stringify({ type: "error", code, message }));
}

function buildDirectPushPayload(envelope: MessageEnvelope): PushPayload {
  if (envelope.messageKind === "status") {
    return {
      title: "New status update",
      body: "A NADA contact posted a vanishing status.",
      chatId: "status",
      kind: "status",
      tag: `status:${envelope.sender}`
    };
  }

  if (envelope.messageKind === "system") {
    return {
      title: "New status comment",
      body: "Someone commented on your status.",
      chatId: "status",
      kind: "comment",
      tag: `comment:${envelope.id}`
    };
  }

  return {
    title: "New NADA message",
    body: "You received a private message.",
    chatId: envelope.sender,
    kind: "message",
    tag: `message:${envelope.sender}`
  };
}

function buildGroupPushPayload(envelope: GroupMessageEnvelope): PushPayload {
  return {
    title: "New group message",
    body: "A private group has a new message.",
    chatId: envelope.groupId,
    kind: "group",
    tag: `group:${envelope.groupId}`
  };
}

function buildCallPushPayload(envelope: CallSignalEnvelope): PushPayload {
  return {
    title: envelope.mode === "video" ? "Incoming video call" : "Incoming voice call",
    body: "Tap to open NADA and answer securely.",
    chatId: envelope.sender,
    kind: "call",
    tag: `call:${envelope.callId}`,
    requireInteraction: true
  };
}

function queuePush(
  app: FastifyInstance,
  pubkeyHash: string,
  payload: PushPayload
): void {
  void (app as any).sendPushNotification?.(pubkeyHash, JSON.stringify(payload));
}
