import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";

import type { RelayEnv } from "./env";
import { verifyIdentityProof, type IdentityProof } from "./identity-proof";

interface TurnCredentialsResponse {
  username: string;
  credential: string;
  urls: string[];
  ttl: number;
  expiresAt: number;
}

const TTL_SECONDS = 5 * 60;

export async function registerTurnRoutes(
  app: FastifyInstance,
  env: RelayEnv
): Promise<void> {
  app.post("/api/v1/turn/credentials", async (request, reply) => {
    const body = request.body as { proof?: unknown } | undefined;
    if (!body || !isProofShape(body.proof)) {
      return reply.code(400).send({
        code: "missing_proof",
        message: "TURN credentials require an identity proof."
      });
    }

    // Bind to pubkeyHash so a captured proof cannot be replayed under a
    // different identity. The replay window itself is already tightened to
    // 15s + 30s skew in identity-proof.ts.
    const result = verifyIdentityProof(body.proof, {
      context: "turn",
      binding: body.proof.pubkeyHash
    });
    if (!result.ok) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: result.reason
      });
    }

    const expiresAt = Date.now() + TTL_SECONDS * 1000;

    // Preferred path: per-user time-limited HMAC credential. Requires the
    // TURN server (coturn, eturnal, Metered, etc.) to be configured with the
    // same shared secret. This is the standard RFC 8489 ephemeral scheme.
    if (env.turnSharedSecret) {
      const unixExpiry = Math.floor(expiresAt / 1000);
      const username = `${unixExpiry}:${result.pubkeyHash}`;
      const credential = createHmac("sha1", env.turnSharedSecret)
        .update(username)
        .digest("base64");
      const response: TurnCredentialsResponse = {
        username,
        credential,
        urls: env.turnUrls,
        ttl: TTL_SECONDS,
        expiresAt
      };
      return reply.send(response);
    }

    // Fallback: static shared credential from env. Kept so existing
    // deployments continue to work while they migrate to TURN_SHARED_SECRET.
    // Logs a warning on each issue because this credential never rotates and
    // is the same value for every caller.
    if (env.turnUsername && env.turnCredential) {
      app.log.warn(
        { pubkeyHash: result.pubkeyHash },
        "Issuing static TURN credential — set TURN_SHARED_SECRET to enable per-user ephemeral credentials."
      );
      const response: TurnCredentialsResponse = {
        username: env.turnUsername,
        credential: env.turnCredential,
        urls: env.turnUrls,
        ttl: TTL_SECONDS,
        expiresAt
      };
      return reply.send(response);
    }

    return reply.code(503).send({
      code: "turn_not_configured",
      message:
        "TURN credentials are not configured for this relay (set TURN_SHARED_SECRET or TURN_USERNAME / TURN_CREDENTIAL)."
    });
  });
}

function isProofShape(value: unknown): value is IdentityProof {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["pubkey"] === "string" &&
    typeof v["pubkeyHash"] === "string" &&
    typeof v["signature"] === "string" &&
    typeof v["timestamp"] === "number"
  );
}
