import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  PubkeyHashSchema,
  StatusDeleteRequestSchema,
  StatusPublishRequestSchema
} from "@nada/types";

import type { RelayEnv } from "./env";
import { verifyIdentityProof } from "./identity-proof";
import { createStatusRepository } from "./status-repository";

// Query is reads-only (anyone can fetch ciphertext for a set of pubkey hashes
// they already know — the payload itself is end-to-end encrypted), so no proof
// is required here.
const StatusQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  senderPubkeyHashes: z.array(PubkeyHashSchema).min(1).max(256),
  since: z.number().int().positive().optional(),
  viewerPubkeyHash: PubkeyHashSchema
});

export async function registerStatusRoutes(
  app: FastifyInstance,
  env: RelayEnv
): Promise<void> {
  const repository = await createStatusRepository(env);
  const allowDevPlaintext = env.allowDevPlaintext;

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.post("/api/v1/statuses", async (request, reply) => {
    const result = StatusPublishRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_status_update",
        message: "Invalid status update."
      });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "status-publish",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.sender) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    // devPlaintext is a dev-only debug field. Strip unless the relay was
    // explicitly opted in via ALLOW_DEV_PLAINTEXT=true.
    const devPlaintext =
      allowDevPlaintext && result.data.devPlaintext
        ? result.data.devPlaintext
        : undefined;

    await repository.upsertStatus({
      ciphertext: result.data.ciphertext,
      ...(devPlaintext ? { devPlaintext } : {}),
      id: result.data.id,
      senderPubkeyHash: result.data.sender,
      timestamp: result.data.timestamp
    });
    return reply.send({ success: true });
  });

  app.post("/api/v1/statuses/delete", async (request, reply) => {
    const result = StatusDeleteRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_status_delete",
        message: "Invalid status delete request."
      });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "status-delete",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.sender) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
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
        // Strip stored devPlaintext on the way out unless explicitly enabled.
        ...(allowDevPlaintext && status.devPlaintext
          ? { devPlaintext: status.devPlaintext }
          : {})
      }))
    });
  });
}
