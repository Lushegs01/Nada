import type { IdentityProof } from "@nada/types";

import type { RelayEnv } from "../env";
import { verifyIdentityProof } from "../identity-proof";

/**
 * Contest administration authenticates with the same Ed25519 identity proof as
 * every other privileged call on the relay. There is no second credential, no
 * shared admin password, and no session cookie reaching across service
 * boundaries: an admin is an allow-listed pubkey hash that can sign.
 *
 * The proof binds the action and the contest it targets, so a proof captured
 * from an admin freezing one contest cannot be replayed to finalize another.
 */

export interface AdminAuthResult {
  ok: boolean;
  pubkeyHash: string;
  code?: string;
  message?: string;
}

export const CONTEST_ADMIN_PROOF_CONTEXT = "contest-admin";

export function buildAdminBinding(action: string, contestId: string | null): string {
  return `${action}:${contestId ?? "global"}`;
}

export function isContestAdmin(env: RelayEnv, pubkeyHash: string): boolean {
  return env.contestAdminPubkeyHashes.includes(pubkeyHash.toLowerCase());
}

export function verifyContestAdmin(
  env: RelayEnv,
  input: { pubkeyHash: string; proof: IdentityProof },
  action: string,
  contestId: string | null
): AdminAuthResult {
  if (env.contestAdminPubkeyHashes.length === 0) {
    return {
      ok: false,
      pubkeyHash: "",
      code: "contest_admin_disabled",
      message: "Contest administration is not configured on this relay."
    };
  }

  const verification = verifyIdentityProof(input.proof, {
    context: CONTEST_ADMIN_PROOF_CONTEXT,
    binding: buildAdminBinding(action, contestId)
  });
  if (!verification.ok || verification.pubkeyHash !== input.pubkeyHash) {
    return {
      ok: false,
      pubkeyHash: verification.pubkeyHash,
      code: "unauthorized",
      message: "Identity proof failed verification."
    };
  }
  if (!isContestAdmin(env, verification.pubkeyHash)) {
    // Deliberately the same shape as a failed proof. Whether a given identity
    // is an administrator is not something an unauthenticated caller gets to
    // learn by probing.
    return {
      ok: false,
      pubkeyHash: verification.pubkeyHash,
      code: "unauthorized",
      message: "Identity proof failed verification."
    };
  }
  return { ok: true, pubkeyHash: verification.pubkeyHash };
}
