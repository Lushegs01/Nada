import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
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

import type { RelayEnv } from "./env";
import { createLoggerOption } from "./logger";
import { registerMonetizationRoutes } from "./monetization-routes";
import { isOriginAllowed } from "./origin";
import { createRelayQueue, type RelayQueue } from "./queue";
import { registerPushRoutes } from "./push-routes";
import { registerUploadRoutes } from "./upload-routes";

type ClientSocket = WebSocket;

interface SessionRegistry {
  socketsByPubkeyHash: Map<PubkeyHash, Set<ClientSocket>>;
  pubkeyHashBySocket: Map<ClientSocket, PubkeyHash>;
}

export async function createRelayServer(env: RelayEnv): Promise<FastifyInstance> {
  const queue = await createRelayQueue(env);
  const app = fastify({
    logger: createLoggerOption(env) as any,
    trustProxy: true
  });
  const sessions: SessionRegistry = {
    socketsByPubkeyHash: new Map(),
    pubkeyHashBySocket: new Map()
  };

  await (app as any).register(cors, {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, isOriginAllowed(origin, env.allowedOrigin));
    }
  });
  await (app as any).register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });
  await (app as any).register(websocket);
  await registerMonetizationRoutes(app as any, env);
  await registerPushRoutes(app as any, env);
  await registerUploadRoutes(app as any, env);

  app.addHook("onClose", async () => {
    await queue.close();
  });

  app.get("/health", async () => ({
    ok: true,
    service: "nada-relay"
  }));

  app.get("/ws", { websocket: true }, (connection, request) => {
    if (!isOriginAllowed(request.headers.origin, env.allowedOrigin)) {
      app.log.warn({ origin: request.headers.origin, allowed: env.allowedOrigin }, "WebSocket origin not allowed");
      connection.socket.close(1008, "Origin not allowed");
      return;
    }

    connection.socket.on("message", (raw) => {
      void handleSocketMessage(
        connection.socket,
        raw.toString(),
        sessions,
        queue,
        app as any
      );
    });

    connection.socket.on("close", () => {
      unregisterSocket(connection.socket, sessions);
    });
  });

  return app as any;
}

async function handleSocketMessage(
  socket: ClientSocket,
  raw: string,
  sessions: SessionRegistry,
  queue: RelayQueue,
  app: any
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
    registerSocket(socket, result.data.pubkeyHash, sessions);
    socket.send(
      JSON.stringify({ type: "registered", pubkeyHash: result.data.pubkeyHash })
    );
    await drainQueuedMessages(result.data.pubkeyHash, socket, queue);
    return;
  }

  if ("type" in result.data && result.data.type === "message") {
    routeMessage(result.data, sessions, queue, app);
    return;
  }

  if ("type" in result.data && result.data.type === "group-message") {
    routeGroupMessage(result.data, sessions, queue, app);
    return;
  }

  if ("type" in result.data && result.data.type === "call-signal") {
    routeCallSignal(result.data, sessions, app);
    return;
  }

  if ("type" in result.data && result.data.type === "typing") {
    routeTyping(result.data, sessions);
    return;
  }

  if ("type" in result.data && result.data.type === "reaction") {
    routeReaction(result.data, sessions);
    return;
  }

  if ("type" in result.data && result.data.type === "deletion") {
    routeDeletion(result.data, sessions, queue);
    return;
  }

  if ("type" in result.data && result.data.type === "delivery") {
    routeDelivery(result.data as any, sessions);
    return;
  }

  if ("version" in result.data) {
    await routeProductionEnvelope(result.data, socket, sessions, queue, app);
    return;
  }

  sendSocketError(socket, "invalid_envelope", "Invalid envelope.");
}

function registerSocket(
  socket: ClientSocket,
  pubkeyHash: PubkeyHash,
  sessions: SessionRegistry
): void {
  unregisterSocket(socket, sessions);
  const existing = sessions.socketsByPubkeyHash.get(pubkeyHash) ?? new Set();
  existing.add(socket);
  sessions.socketsByPubkeyHash.set(pubkeyHash, existing);
  sessions.pubkeyHashBySocket.set(socket, pubkeyHash);
}

function unregisterSocket(
  socket: ClientSocket,
  sessions: SessionRegistry
): void {
  const pubkeyHash = sessions.pubkeyHashBySocket.get(socket);
  if (!pubkeyHash) {
    return;
  }

  const sockets = sessions.socketsByPubkeyHash.get(pubkeyHash);
  sockets?.delete(socket);
  if (sockets?.size === 0) {
    sessions.socketsByPubkeyHash.delete(pubkeyHash);
  }

  sessions.pubkeyHashBySocket.delete(socket);
}

function routeMessage(
  envelope: MessageEnvelope,
  sessions: SessionRegistry,
  queue: RelayQueue,
  app: FastifyInstance
): void {
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  if (!recipients || recipients.size === 0) {
    // Recipient is offline — queue the message so it is delivered on reconnect
    void queue.enqueue(
      envelope.recipient,
      JSON.stringify({ type: "message", envelope })
    );
    // Send back "queued" (not "failed") so the sender UI can show a clock icon
    const senders = sessions.socketsByPubkeyHash.get(envelope.sender);
    senders?.forEach((socket) => {
      socket.send(
        JSON.stringify({ type: "delivery", id: envelope.id, status: "queued" })
      );
    });
    void (app as any).sendPushNotification?.(
      envelope.recipient,
      JSON.stringify({ title: "New Message", body: "You received a new message." })
    );
    return;
  }

  recipients.forEach((socket) => {
    socket.send(JSON.stringify({ type: "message", envelope }));
  });

  const senders = sessions.socketsByPubkeyHash.get(envelope.sender);
  senders?.forEach((socket) => {
    socket.send(
      JSON.stringify({ type: "delivery", id: envelope.id, status: "delivered" })
    );
  });
}

function routeGroupMessage(
  envelope: GroupMessageEnvelope,
  sessions: SessionRegistry,
  queue: RelayQueue,
  app: FastifyInstance
): void {
  let deliveredCount = 0;

  envelope.recipients.forEach((recipient) => {
    const sockets = sessions.socketsByPubkeyHash.get(recipient);
    if (!sockets || sockets.size === 0) {
      // Queue for each offline group member individually
      void queue.enqueue(
        recipient,
        JSON.stringify({ type: "group-message", envelope })
      );
      void (app as any).sendPushNotification?.(
        recipient,
        JSON.stringify({ title: "New Group Message", body: "You received a new message." })
      );
      return;
    }

    deliveredCount += sockets.size;
    sockets.forEach((socket) => {
      socket.send(JSON.stringify({ type: "group-message", envelope }));
    });
  });

  const senders = sessions.socketsByPubkeyHash.get(envelope.sender);
  senders?.forEach((socket) => {
    socket.send(
      JSON.stringify({
        type: "delivery",
        id: envelope.id,
        status: deliveredCount > 0 ? "delivered" : "queued"
      })
    );
  });
}

function routeCallSignal(
  envelope: CallSignalEnvelope,
  sessions: SessionRegistry,
  app: FastifyInstance
): void {
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  if (!recipients || recipients.size === 0) {
    const senders = sessions.socketsByPubkeyHash.get(envelope.sender);
    senders?.forEach((socket) => {
      socket.send(
        JSON.stringify({ type: "delivery", id: envelope.id, status: "failed" })
      );
    });
    if (envelope.signalType === "offer") {
      void (app as any).sendPushNotification?.(
        envelope.recipient,
        JSON.stringify({ title: "Incoming Call", body: "You have an incoming call." })
      );
    }
    return;
  }

  recipients.forEach((socket) => {
    socket.send(JSON.stringify({ type: "call-signal", envelope }));
  });
}

// Typing events are ephemeral — forward to recipient, never queue or persist.
function routeTyping(
  envelope: TypingEnvelope,
  sessions: SessionRegistry
): void {
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  if (!recipients || recipients.size === 0) return;
  const serialized = JSON.stringify({ type: "typing", envelope });
  recipients.forEach((socket) => {
    socket.send(serialized);
  });
}

// Reaction events are ephemeral — forward to recipient, never queue or persist.
function routeReaction(
  envelope: ReactionEnvelope,
  sessions: SessionRegistry
): void {
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  if (!recipients || recipients.size === 0) return;
  const serialized = JSON.stringify({ type: "reaction", envelope });
  recipients.forEach((socket) => {
    socket.send(serialized);
  });
}

function routeDelivery(
  envelope: { type: "delivery"; id: string; recipient: string; status: "delivered" | "read" | "queued" | "sent" | "failed" },
  sessions: SessionRegistry
): void {
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  if (!recipients || recipients.size === 0) return;
  const serialized = JSON.stringify({ type: "delivery", id: envelope.id, status: envelope.status });
  recipients.forEach((socket) => {
    socket.send(serialized);
  });
}

async function routeDeletion(
  envelope: DeletionEnvelope,
  sessions: SessionRegistry,
  queue: RelayQueue
): Promise<void> {
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  const serialized = JSON.stringify({ type: "deletion", envelope });

  let deliveredCount = 0;
  recipients?.forEach((socket) => {
    socket.send(serialized);
    deliveredCount += 1;
  });

  if (deliveredCount === 0) {
    await queue.enqueue(envelope.recipient, serialized);
  }

  const senders = sessions.socketsByPubkeyHash.get(envelope.sender);
  senders?.forEach((socket) => {
    socket.send(
      JSON.stringify({
        type: "delivery",
        id: envelope.id,
        status: deliveredCount > 0 ? "delivered" : "queued"
      })
    );
  });
}

async function routeProductionEnvelope(
  envelope: ProductionEnvelope,
  senderSocket: ClientSocket,
  sessions: SessionRegistry,
  queue: RelayQueue,
  app: FastifyInstance
): Promise<void> {
  const serialized = JSON.stringify({ type: "sealed-message", envelope });
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  if (!recipients || recipients.size === 0) {
    await queue.enqueue(envelope.recipient, serialized);
    senderSocket.send(
      JSON.stringify({
        type: "delivery",
        id: randomUUID(),
        status: "queued"
      })
    );
    void (app as any).sendPushNotification?.(
      envelope.recipient,
      JSON.stringify({ title: "New Encrypted Message", body: "You received a new encrypted message." })
    );
    return;
  }

  recipients.forEach((socket) => {
    socket.send(serialized);
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
