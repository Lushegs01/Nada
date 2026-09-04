import type { FastifyInstance } from "fastify";

import {
  PrekeyClaimRequestSchema,
  PrekeyPublishRequestSchema,
  PrekeyStatusRequestSchema
} from "@nada/types";

import type { RelayDb } from "./db";
import { verifyIdentityProof } from "./identity-proof";
import { createPrekeyRepository } from "./prekey-repository";

/**
 * Prekey distribution.
 *
 * Every route is proof-gated. Publishing must be, obviously — otherwise anyone
 * could replace an identity's prekeys with their own and read its mail. So must
 * *claiming*, less obviously: a claim consumes a one-time prekey, so an
 * unauthenticated claim endpoint is a way to drain a victim's supply and force
 * every sender down to the signed-prekey path.
 */
export async function registerPrekeyRoutes(
  app: FastifyInstance,
  db: RelayDb | null
): Promise<void> {
  const repository = await createPrekeyRepository(db);

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.post("/api/v1/prekeys/publish", async (request, reply) => {
    const result = PrekeyPublishRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_prekey_publish", message: "Invalid prekey publication." });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "prekey-publish",
      binding: result.data.signedPrekeyId
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.pubkeyHash) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    // The published identity key must be the one that just proved itself, or a
    // sender verifying the signed prekey against it would be trusting a key
    // this identity never controlled.
    if (result.data.identityPubkey !== result.data.proof.pubkey) {
      return reply.code(400).send({
        code: "identity_key_mismatch",
        message: "Published identity key does not match the proving key."
      });
    }

    await repository.publish({
      pubkeyHash: verification.pubkeyHash,
      identityPubkey: result.data.identityPubkey,
      signedPrekeyId: result.data.signedPrekeyId,
      signedPrekey: result.data.signedPrekey,
      signedPrekeySignature: result.data.signedPrekeySignature,
      oneTimePrekeys: result.data.oneTimePrekeys
    });
    return reply.send({ success: true });
  });

  app.post("/api/v1/prekeys/claim", async (request, reply) => {
    const result = PrekeyClaimRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_prekey_claim", message: "Invalid prekey claim." });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "prekey-claim",
      binding: result.data.pubkeyHash
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.requester) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    const bundle = await repository.claimBundle(result.data.pubkeyHash);
    if (!bundle) {
      // Not an error: an identity that has never published prekeys is simply
      // on an older client, and the sender falls back to a sealed box.
      return reply.code(404).send({
        code: "no_prekeys",
        message: "This identity has not published prekeys."
      });
    }
    return reply.send(bundle);
  });

  app.post("/api/v1/prekeys/status", async (request, reply) => {
    const result = PrekeyStatusRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_prekey_status", message: "Invalid prekey status query." });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "prekey-status",
      binding: result.data.pubkeyHash
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.pubkeyHash) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    return reply.send({
      oneTimePrekeysRemaining: await repository.countOneTimePrekeys(
        verification.pubkeyHash
      )
    });
  });
}
