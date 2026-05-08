import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { PubkeyHashSchema, UuidSchema } from "@nada/types";

import type { RelayEnv } from "./env";
import { createStatusRepository } from "./status-repository";

const StatusPublishSchema = z.object({
  ciphertext: z.string().min(1),
  devPlaintext: z.string().optional(),
  id: UuidSchema,
  sender: PubkeyHashSchema,
  timestamp: z.number().int().positive()
});

const StatusQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  senderPubkeyHashes: z.array(PubkeyHashSchema).min(1).max(256),
  since: z.number().int().positive().optional(),
  viewerPubkeyHash: PubkeyHashSchema
});

const StatusDeleteSchema = z.object({
  id: UuidSchema,
  sender: PubkeyHashSchema
});

export async function registerStatusRoutes(
  app: FastifyInstance,
  env: RelayEnv
): Promise<void> {
  const repository = await createStatusRepository(env);

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.post("/api/v1/statuses", async (request, reply) => {
    const result = StatusPublishSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_status_update",
        message: "Invalid status update."
      });
    }

    await repository.upsertStatus({
      ciphertext: result.data.ciphertext,
      ...(result.data.devPlaintext ? { devPlaintext: result.data.devPlaintext } : {}),
      id: result.data.id,
      senderPubkeyHash: result.data.sender,
      timestamp: result.data.timestamp
    });
    return reply.send({ success: true });
  });

  app.post("/api/v1/statuses/delete", async (request, reply) => {
    const result = StatusDeleteSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_status_delete",
        message: "Invalid status delete request."
      });
    }

    await repository.deleteStatus(result.data.id, result.data.sender);
    return reply.send({ success: true });
  });

  app.post("/api/v1/statuses/query", async (request, reply) => {
    const result = StatusQuerySchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_status_query",
        message: "Invalid status query."
      });
    }

    const statuses = await repository.listStatuses(
      Array.from(new Set(result.data.senderPubkeyHashes)),
      result.data.since ?? Date.now() - 24 * 60 * 60 * 1000,
      result.data.limit ?? 100
    );

    return reply.send({
      statuses: statuses.map((status) => ({
        type: "message",
        id: status.id,
        recipient: result.data.viewerPubkeyHash,
        sender: status.senderPubkeyHash,
        timestamp: status.timestamp,
        ciphertext: status.ciphertext,
        messageKind: "status",
        ...(status.devPlaintext ? { devPlaintext: status.devPlaintext } : {})
      }))
    });
  });
}
