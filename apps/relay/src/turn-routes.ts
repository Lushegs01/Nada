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

    const result = verifyIdentityProof(body.proof, { context: "turn" });
    if (!result.ok) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: result.reason
      });
    }

    if (!env.turnUsername || !env.turnCredential) {
      return reply.code(503).send({
        code: "turn_not_configured",
        message:
          "TURN credentials are not configured for this relay (set TURN_USERNAME / TURN_CREDENTIAL)."
      });
    }

    const expiresAt = Date.now() + TTL_SECONDS * 1000;
    const response: TurnCredentialsResponse = {
      username: env.turnUsername,
      credential: env.turnCredential,
      urls: env.turnUrls,
      ttl: TTL_SECONDS,
      expiresAt
    };
    return reply.send(response);
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
