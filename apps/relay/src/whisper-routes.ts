import type { FastifyInstance } from "fastify";

import {
  WhisperDeleteRequestSchema,
  WhisperPublishRequestSchema,
  WhisperQueryRequestSchema,
  WhisperReactRequestSchema,
  WhisperReflectRequestSchema,
  WhisperRippleRequestSchema
} from "@nada/types";

import type { RelayEnv } from "./env";
import { verifyIdentityProof } from "./identity-proof";
import { createWhisperRepository } from "./whisper-repository";

const FEED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export async function registerWhisperRoutes(
  app: FastifyInstance,
  env: RelayEnv
): Promise<void> {
  const repository = await createWhisperRepository(env);

  app.addHook("onClose", async () => {
    await repository.close();
  });

  // Create an Echo (a public post visible to everyone).
  app.post("/api/v1/whispers", async (request, reply) => {
    const result = WhisperPublishRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ code: "invalid_whisper", message: "Invalid whisper." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-publish",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.createEcho({
      authorName: result.data.authorName,
      authorPubkeyHash: result.data.author,
      body: result.data.body,
      createdAt: result.data.timestamp,
      id: result.data.id
    });
    return reply.send({ success: true });
  });

  // Delete an Echo (only the author may delete their own).
  app.post("/api/v1/whispers/delete", async (request, reply) => {
    const result = WhisperDeleteRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_whisper_delete", message: "Invalid whisper delete." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-delete",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.deleteEcho(result.data.id, result.data.author);
    return reply.send({ success: true });
  });

  // Add a Reflection (a comment) to any Echo.
  app.post("/api/v1/whispers/reflect", async (request, reply) => {
    const result = WhisperReflectRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_reflection", message: "Invalid reflection." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-reflect",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.addReflection({
      authorName: result.data.authorName,
      authorPubkeyHash: result.data.author,
      body: result.data.body,
      createdAt: result.data.timestamp,
      echoId: result.data.echoId,
      id: result.data.id
    });
    return reply.send({ success: true });
  });

  // Toggle an Echo reaction (a "like") on any Echo.
  app.post("/api/v1/whispers/echo", async (request, reply) => {
    const result = WhisperReactRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_reaction", message: "Invalid reaction." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-echo",
      binding: result.data.echoId
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.reactor) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.setReaction(
      result.data.echoId,
      result.data.reactor,
      result.data.on,
      result.data.timestamp
    );
    return reply.send({ success: true });
  });

  // Ripple (repost) an Echo: records the ripple and creates a quoting Echo.
  app.post("/api/v1/whispers/ripple", async (request, reply) => {
    const result = WhisperRippleRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ code: "invalid_ripple", message: "Invalid ripple." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-ripple",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.addRipple(
      result.data.echoId,
      result.data.author,
      result.data.timestamp
    );
    await repository.createEcho({
      authorName: result.data.authorName,
      authorPubkeyHash: result.data.author,
      body: "",
      createdAt: result.data.timestamp,
      id: result.data.id,
      rippleOf: result.data.rippleOf
    });
    return reply.send({ success: true });
  });

  // Read the public feed. Reads-only, so no identity proof is required — the
  // viewer hash only personalises the echoedByViewer/rippledByViewer flags.
  app.post("/api/v1/whispers/query", async (request, reply) => {
    const result = WhisperQueryRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_whisper_query", message: "Invalid whisper query." });
    }
    const echoes = await repository.listFeed(
      result.data.viewerPubkeyHash,
      result.data.since ?? Date.now() - FEED_WINDOW_MS,
      result.data.limit ?? 100
    );
    return reply.send({ echoes });
  });
}
