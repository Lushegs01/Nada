import { z } from "zod";

// The handful of schemas every other module builds on. They live apart from
// index.ts so feature modules (contests, and anything added beside them) can
// import them without importing the barrel — which would be a cycle.
export const PubkeyHashSchema = z.string().min(16).max(128);
export const PublicKeySchema = z.string().min(32).max(512);
export const UuidSchema = z.string().uuid();

// Ed25519 identity proof. Mirrors apps/relay/src/identity-proof.ts and
// apps/web/src/lib/identity-proof-server.ts so request schemas can validate
// the shape before handing off to the verifier.
export const IdentityProofSchema = z.object({
  pubkey: PublicKeySchema,
  pubkeyHash: PubkeyHashSchema,
  signature: z.string().min(1).max(512),
  timestamp: z.number().int().positive()
});
export type IdentityProof = z.infer<typeof IdentityProofSchema>;
