import type { FastifyInstance } from "fastify";

import {
  StatusDeleteRequestSchema,
  StatusPublishRequestSchema,
  StatusQueryRequestSchema
} from "@nada/types";

import type { RelayDb } from "./db";
import type { RelayEnv } from "./env";
import { verifyIdentityProof } from "./identity-proof";
import { createStatusRepository } from "./status-repository";

export async function registerStatusRoutes(
  app: FastifyInstance,
  env: RelayEnv,
  db: RelayDb | null
): Promise<void> {
  const repository = await createStatusRepository(db);
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
      ...(result.data.keyEnvelopes
        ? { keyEnvelopes: result.data.keyEnvelopes }
        : {}),
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

  // Reading statuses requires proving control of the viewing identity.
  //
  // This used to be unauthenticated, taking the viewer's identity as a
  // client-asserted field. Pubkey hashes are published on the Whispers feed,
  // so anyone could enumerate authors and ask for their statuses — and did not
  // even need to, since the caller chose which senders to read. The proof
  // makes the viewer real, and the per-viewer sealed key means the relay can
  // only ever hand out the audience copy addressed to that verified identity.
  app.post("/api/v1/statuses/query", async (request, reply) => {
    const result = StatusQueryRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_status_query",
        message: "Invalid status query."
      });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "status-query",
      binding: result.data.viewerPubkeyHash
    });
    if (
      !verification.ok ||
      verification.pubkeyHash !== result.data.viewerPubkeyHash
    ) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    const statuses = await repository.listStatuses(
      Array.from(new Set(result.data.senderPubkeyHashes)),
      result.data.since ?? Date.now() - 24 * 60 * 60 * 1000,
      result.data.limit ?? 100,
      verification.pubkeyHash
    );

    return reply.send({
      statuses: statuses.map((status) => ({
        type: "message",
        id: status.id,
        recipient: verification.pubkeyHash,
        sender: status.senderPubkeyHash,
        timestamp: status.timestamp,
        ciphertext: status.ciphertext,
        messageKind: "status",
        // Only the copy addressed to this verified viewer, never anyone else's.
        ...(status.sealedKey ? { statusKeyEnvelope: status.sealedKey } : {}),
        // Strip stored devPlaintext on the way out unless explicitly enabled.
        ...(allowDevPlaintext && status.devPlaintext
          ? { devPlaintext: status.devPlaintext }
          : {})
      }))
    });
  });
}
