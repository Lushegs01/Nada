import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

import {
  ClientSocketEnvelopeSchema,
  type CallSignalEnvelope,
  type GroupMessageEnvelope,
  type MessageEnvelope,
  type ProductionEnvelope,
  type PubkeyHash
} from "@nada/types";

import type { RelayEnv } from "./env";
import { createLoggerOption } from "./logger";
import { registerMonetizationRoutes } from "./monetization-routes";
import { isOriginAllowed } from "./origin";
import { createRelayQueue, type RelayQueue } from "./queue";
import { registerUploadRoutes } from "./upload-routes";

type ClientSocket = WebSocket;

interface SessionRegistry {
  socketsByPubkeyHash: Map<PubkeyHash, Set<ClientSocket>>;
  pubkeyHashBySocket: Map<ClientSocket, PubkeyHash>;
}

export async function createRelayServer(env: RelayEnv): Promise<FastifyInstance> {
  const queue = await createRelayQueue(env);
  const app = fastify({
    logger: createLoggerOption(env),
    trustProxy: true
  });
  const sessions: SessionRegistry = {
    socketsByPubkeyHash: new Map(),
    pubkeyHashBySocket: new Map()
  };

  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin, env.allowedOrigin));
    }
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });
  await app.register(websocket);
  await registerMonetizationRoutes(app, env);
  await registerUploadRoutes(app);

  app.addHook("onClose", async () => {
    await queue.close();
  });

  app.get("/health", async () => ({
    ok: true,
    service: "nada-relay"
  }));

  app.get("/ws", { websocket: true }, (connection, request) => {
    if (!isOriginAllowed(request.headers.origin, env.allowedOrigin)) {
      connection.socket.close(1008, "Origin not allowed");
      return;
    }

    connection.socket.on("message", (raw) => {
      void handleSocketMessage(
        connection.socket,
        raw.toString(),
        sessions,
        queue
      );
    });

    connection.socket.on("close", () => {
      unregisterSocket(connection.socket, sessions);
    });
  });

  return app;
}

async function handleSocketMessage(
  socket: ClientSocket,
  raw: string,
  sessions: SessionRegistry,
  queue: RelayQueue
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
    routeMessage(result.data, sessions);
    return;
  }

  if ("type" in result.data && result.data.type === "group-message") {
    routeGroupMessage(result.data, sessions);
    return;
  }

  if ("type" in result.data && result.data.type === "call-signal") {
    routeCallSignal(result.data, sessions);
    return;
  }

  if ("version" in result.data) {
    await routeProductionEnvelope(result.data, socket, sessions, queue);
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
  sessions: SessionRegistry
): void {
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  if (!recipients || recipients.size === 0) {
    const senders = sessions.socketsByPubkeyHash.get(envelope.sender);
    senders?.forEach((socket) => {
      socket.send(
        JSON.stringify({ type: "delivery", id: envelope.id, status: "failed" })
      );
    });
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
  sessions: SessionRegistry
): void {
  let deliveredCount = 0;

  envelope.recipients.forEach((recipient) => {
    const sockets = sessions.socketsByPubkeyHash.get(recipient);
    if (!sockets || sockets.size === 0) {
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
        status: deliveredCount > 0 ? "delivered" : "failed"
      })
    );
  });
}

function routeCallSignal(
  envelope: CallSignalEnvelope,
  sessions: SessionRegistry
): void {
  const recipients = sessions.socketsByPubkeyHash.get(envelope.recipient);
  if (!recipients || recipients.size === 0) {
    const senders = sessions.socketsByPubkeyHash.get(envelope.sender);
    senders?.forEach((socket) => {
      socket.send(
        JSON.stringify({ type: "delivery", id: envelope.id, status: "failed" })
      );
    });
    return;
  }

  recipients.forEach((socket) => {
    socket.send(JSON.stringify({ type: "call-signal", envelope }));
  });
}

async function routeProductionEnvelope(
  envelope: ProductionEnvelope,
  senderSocket: ClientSocket,
  sessions: SessionRegistry,
  queue: RelayQueue
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
