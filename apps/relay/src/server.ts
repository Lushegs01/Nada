import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastify, {
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify";
import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";

import {
  ClientSocketEnvelopeSchema,
  type CallSignalEnvelope,
  type DeletionEnvelope,
  type GroupMessageEnvelope,
  type MessageEnvelope,
  type PubkeyHash,
  type ReactionEnvelope,
  type TypingEnvelope
} from "@nada/types";

import { createRelayDb, ensureRelaySchema } from "./db";
import type { RelayEnv } from "./env";
import { derivePubkeyHash, verifyIdentityProof } from "./identity-proof";
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
import {
  HEARTBEAT_INTERVAL_MS,
  MAX_SOCKET_PAYLOAD_BYTES,
  MAX_SOCKETS_PER_IDENTITY,
  SocketMessageLimiter,
  trySend
} from "./socket-limits";
import { registerPushRoutes } from "./push-routes";
import { TtlCache } from "./ttl-cache";
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
  /**
   * Sockets that have answered the most recent heartbeat. A TCP connection can
   * die without a close frame (laptop lid, dropped mobile radio, silent NAT
   * timeout); the socket then stays "open" forever, holds presence, and every
   * message routed to it is reported delivered and lost. The heartbeat sweep
   * is what turns those back into honest offline queueing.
   */
  alive: Set<ClientSocket>;
}

const HANDSHAKE_TIMEOUT_MS = 30_000;
/** How long a registered-user count may be served from cache. */
const STATS_CACHE_TTL_MS = 30_000;

interface PushPayload {
  title: string;
  body: string;
  kind: "message" | "group" | "status" | "comment" | "call" | "encrypted";
  chatId: string;
  tag: string;
  requireInteraction?: boolean;
}

export async function createRelayServer(env: RelayEnv): Promise<FastifyInstance> {
  // Typed explicitly: the logger option is a wide union, and inline it makes
  // TypeScript pick the HTTP/2 `fastify()` overload instead of the default one.
  const serverOptions: FastifyServerOptions = {
    logger: createLoggerOption(env),
    trustProxy: true
  };
  const app = fastify(serverOptions);

  // One shared Redis connection pair backs the offline queue, the rate-limit
  // store, and the cross-instance delivery bus.
  const redis = await createRelayRedis(env, app.log);
  const queue = await createRelayQueue(env, redis);
  const bus = createPresenceBus(redis);
  const mediaStore = createMediaStore(env);
  const sessions: SessionRegistry = {
    socketsByPubkeyHash: new Map(),
    pubkeyHashBySocket: new Map(),
    pendingHandshakes: new Map(),
    alive: new Set()
  };
  const socketLimiter = new SocketMessageLimiter();

  // One pooled Postgres handle shared by every repository and by the stats
  // endpoint. The schema is applied once here rather than once per repository.
  const db = createRelayDb(env, app.log);
  if (db) {
    await ensureRelaySchema(db);
  }

  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin, env.allowedOrigin));
    }
  });
  await app.register(rateLimit, {
    // preHandler (rather than the default onRequest) so the parsed body is
    // available to the key generator — that is where a request's NADA identity
    // lives. Body-size limits still cap what gets parsed.
    hook: "preHandler",
    keyGenerator: buildRateLimitKey,
    max: (_request: unknown, key: string) => resolveRateLimitMax(env, key),
    allowList: (request) => isRateLimitAllowListed(request),
    // Shared counters across instances; without this each instance keeps its
    // own tally and N instances silently permit N times the limit.
    ...(redis ? { store: createRedisRateLimitStore(redis.command) } : {}),
    // A Redis blip must degrade to "allow", never to a 500 on every request.
    skipOnError: true,
    timeWindow: "1 minute"
  });
  await app.register(websocket, {
    // Envelopes are JSON; media goes through the upload routes. Without a
    // ceiling, `ws` defaults to 100 MiB per frame and one client can pin the
    // instance's memory with a single message.
    options: { maxPayload: MAX_SOCKET_PAYLOAD_BYTES }
  });
  await registerMonetizationRoutes(app, env, db);
  await registerPushRoutes(app, env, db);
  await registerStatusRoutes(app, env, db);
  await registerTurnRoutes(app, env);
  await registerUploadRoutes(app, env, mediaStore);
  await registerWhisperRoutes(app, env, db);

  app.addHook("onClose", async () => {
    await queue.close();
    await bus.close();
    await redis?.close();
    await db?.close();
  });

  // Liveness: is this process running and able to answer? Deliberately does
  // not touch Postgres or Redis — a load balancer must not kill every instance
  // because a shared dependency blipped. Dependency state lives on /ready.
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

  // Readiness: can this instance actually serve traffic *right now*? It probes
  // every dependency it would use and answers 503 when one is down, so a
  // deploy that lost its database or its Redis is visible immediately instead
  // of at the moment user data goes missing. `/health` reporting configuration
  // was never enough: a configured-but-unreachable Postgres looked identical
  // to a healthy one.
  app.get("/ready", async (_request, reply) => {
    const [database, cache] = await Promise.all([
      probeDependency("postgres", db ? () => db.query("select 1") : null),
      probeDependency("redis", redis ? () => redis.command.ping() : null)
    ]);
    const dependencies = { database, cache };
    const ready = database.status !== "down" && cache.status !== "down";
    return reply.code(ready ? 200 : 503).send({
      ready,
      service: "nada-relay",
      dependencies,
      sockets: {
        connections: sessions.pubkeyHashBySocket.size,
        identities: sessions.socketsByPubkeyHash.size,
        pendingHandshakes: sessions.pendingHandshakes.size
      }
    });
  });

  // `count(*)` on Postgres is a sequential scan. This endpoint is public and
  // uncredentialed, so without a cache anyone could hold the database down by
  // polling it — the cost grows with the user table, which is exactly backwards.
  // The TTL also collapses concurrent callers onto one query.
  const statsCache = new TtlCache<number | null>(STATS_CACHE_TTL_MS, 1);

  app.get("/stats", async () => {
    const totalRegisteredUsers = await statsCache.resolve("users", async () => {
      if (!db) return null;
      try {
        const result = await db.query<{ count: string }>(
          "select count(*) as count from users"
        );
        return Number(result.rows[0]?.count ?? 0);
      } catch {
        // DB unavailable — report null rather than failing the endpoint.
        return null;
      }
    });

    return {
      uniqueUsersOnline: sessions.socketsByPubkeyHash.size,
      totalConnections: sessions.pubkeyHashBySocket.size,
      pendingHandshakes: sessions.pendingHandshakes.size,
      totalRegisteredUsers,
      timestamp: new Date().toISOString()
    };
  });

  // Reaps sockets that stopped answering. Anything that has not responded to
  // the previous ping is terminated rather than closed politely: a half-open
  // socket will never complete a close handshake, and leaving it registered
  // makes the relay claim a recipient is online while every message routed to
  // them is dropped on the floor.
  const heartbeat = setInterval(() => {
    for (const socket of sessions.pubkeyHashBySocket.keys()) {
      if (!sessions.alive.has(socket)) {
        socket.terminate();
        continue;
      }
      sessions.alive.delete(socket);
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  // Never hold the event loop open just to run the sweep.
  heartbeat.unref?.();

  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
    // Tell every client the instance is going away so they reconnect against
    // a healthy one instead of waiting for a TCP timeout.
    for (const socket of sessions.pubkeyHashBySocket.keys()) {
      try {
        socket.close(1001, "Relay shutting down");
      } catch {
        // Already gone.
      }
    }
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
    sessions.alive.add(connection.socket);
    trySend(connection.socket, JSON.stringify({ type: "challenge", nonce }));

    const handshakeTimer = setTimeout(() => {
      if (sessions.pendingHandshakes.has(connection.socket)) {
        connection.socket.close(1008, "Handshake timeout");
      }
    }, HANDSHAKE_TIMEOUT_MS);
    handshakeTimer.unref?.();

    connection.socket.on("pong", () => {
      sessions.alive.add(connection.socket);
    });

    connection.socket.on("message", (raw) => {
      // Any inbound traffic proves the peer is alive, so it counts as a pong.
      sessions.alive.add(connection.socket);
      if (!socketLimiter.allow(connection.socket)) {
        sendSocketError(
          connection.socket,
          "rate_limited",
          "Too many envelopes; slow down."
        );
        connection.socket.close(1013, "Rate limited");
        return;
      }
      void handleSocketMessage(
        connection.socket,
        raw.toString(),
        sessions,
        queue,
        bus,
        app,
        env
      );
    });

    const teardown = () => {
      clearTimeout(handshakeTimer);
      sessions.pendingHandshakes.delete(connection.socket);
      sessions.alive.delete(connection.socket);
      socketLimiter.release(connection.socket);
      void unregisterSocket(connection.socket, sessions, bus).catch((error) => {
        app.log.error({ err: error }, "Failed to release socket presence");
      });
    };

    connection.socket.on("close", teardown);
    connection.socket.on("error", teardown);
  });

  return app;
}

type DependencyStatus = "ok" | "down" | "not-configured";

/**
 * Probes one dependency without letting a hung backend hang the probe itself:
 * a readiness check that blocks forever is indistinguishable from an instance
 * that is wedged, and is exactly what a load balancer must be able to tell
 * apart.
 */
async function probeDependency(
  name: string,
  probe: (() => Promise<unknown>) | null
): Promise<{ name: string; status: DependencyStatus; error?: string }> {
  if (!probe) {
    return { name, status: "not-configured" };
  }
  try {
    await Promise.race([
      probe(),
      new Promise((_resolve, rejectProbe) =>
        setTimeout(() => rejectProbe(new Error("probe timed out")), 2_000).unref?.()
      )
    ]);
    return { name, status: "ok" };
  } catch (error) {
    return {
      name,
      status: "down",
      error: error instanceof Error ? error.message : "unknown error"
    };
  }
}

async function handleSocketMessage(
  socket: ClientSocket,
  raw: string,
  sessions: SessionRegistry,
  queue: RelayQueue,
  bus: PresenceBus,
  app: FastifyInstance,
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
    const existingSockets =
      sessions.socketsByPubkeyHash.get(verification.pubkeyHash)?.size ?? 0;
    if (existingSockets >= MAX_SOCKETS_PER_IDENTITY) {
      // One identity opening unbounded sockets is a memory and fan-out
      // amplifier for every other user on the instance. Real multi-device use
      // is a handful of connections, so refuse rather than degrade.
      sendSocketError(
        socket,
        "too_many_connections",
        "This identity already has the maximum number of open connections."
      );
      socket.close(1008, "Too many connections");
      return;
    }
    await registerSocket(socket, verification.pubkeyHash, sessions, bus);
    trySend(
      socket,
      JSON.stringify({ type: "registered", pubkeyHash: verification.pubkeyHash })
    );
    await drainQueuedMessages(verification.pubkeyHash, socket, queue, app);
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

  // `senderPublicKey` is how a recipient learns the key to encrypt a reply
  // with, so a wrong one silently reroutes the whole conversation to an
  // attacker. It is cheap to check here and the check is absolute: the key
  // must hash to the identity this socket already proved it controls.
  // (Recipients re-derive the hash themselves too; this stops the bad
  // envelope from ever being stored or fanned out.)
  if ("senderPublicKey" in result.data && result.data.senderPublicKey !== undefined) {
    let derived: string;
    try {
      derived = derivePubkeyHash(result.data.senderPublicKey);
    } catch {
      derived = "";
    }
    if (derived !== authenticatedPubkeyHash) {
      sendSocketError(
        socket,
        "sender_public_key_mismatch",
        "Envelope sender public key does not match the authenticated identity."
      );
      return;
    }
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
    await routeDelivery(result.data, sessions, bus);
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
      ?.forEach((target) => trySend(target, payload));
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
  // Count only sockets the payload was genuinely written to. Treating a
  // closing socket as a delivery is how a message gets acknowledged to the
  // sender and then never queued for the recipient.
  let deliveredLocally = false;
  local?.forEach((socket) => {
    if (trySend(socket, serialized)) {
      deliveredLocally = true;
    }
  });

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

/**
 * Replays a reconnecting client's offline backlog.
 *
 * The queue hands the envelopes over without destroying them; only envelopes
 * this function actually wrote to the socket are settled. Anything left — the
 * socket died mid-replay, or the whole instance did — goes back to the head of
 * the queue and is redelivered on the next connection. Previously the drain
 * deleted the queue up-front, so a socket that dropped during replay took the
 * user's entire offline backlog with it.
 */
async function drainQueuedMessages(
  pubkeyHash: PubkeyHash,
  socket: ClientSocket,
  queue: RelayQueue,
  app: FastifyInstance
): Promise<void> {
  const messages = await queue.drain(pubkeyHash);
  if (messages.length === 0) {
    return;
  }

  let delivered = 0;
  for (const message of messages) {
    if (!trySend(socket, message)) {
      break;
    }
    delivered += 1;
  }

  try {
    if (delivered === messages.length) {
      await queue.settle(pubkeyHash);
    } else {
      await queue.restore(pubkeyHash, messages.slice(delivered));
    }
  } catch (error) {
    // The envelopes stay parked in the in-flight list and are recovered by the
    // next drain, so this is a logged degradation rather than data loss.
    app.log.error({ err: error }, "Failed to settle offline queue after replay");
  }
}

function sendSocketError(
  socket: ClientSocket,
  code: string,
  message: string
): void {
  trySend(socket, JSON.stringify({ type: "error", code, message }));
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
  void app.sendPushNotification?.(pubkeyHash, JSON.stringify(payload));
}
