// Server-side verification of identity-proof challenges signed by clients.
//
// SYNC INVARIANT: this file mirrors apps/relay/src/identity-proof.ts. If you
// change the signed-message format, derivation, or verification rules here,
// update the relay copy in lockstep — clients sign once and any server that
// authenticates a request must verify with identical rules.

import { blake2b } from "@noble/hashes/blake2b";
import { createPublicKey, verify } from "node:crypto";

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const MAX_CHALLENGE_AGE_MS = 60_000;
const MAX_CHALLENGE_SKEW_MS = 60_000;

export interface IdentityProof {
  pubkey: string;
  pubkeyHash: string;
  signature: string;
  timestamp: number;
}

export interface VerifyOptions {
  context: string;
  binding?: string;
}

export interface VerifyResult {
  ok: boolean;
  pubkeyHash: string;
  reason?: string;
}

export function derivePubkeyHash(pubkeyBase64: string): string {
  const pubkey = decodeBase64Standard(pubkeyBase64);
  if (pubkey.length !== 32) {
    throw new Error("Ed25519 public key must be 32 bytes.");
  }
  const digest = blake2b(pubkey, { dkLen: 32 });
  return Buffer.from(digest).toString("hex");
}

export function buildSignedMessage(
  context: string,
  timestamp: number,
  pubkeyHash: string,
  binding?: string
): string {
  return `${context}:${timestamp}:${pubkeyHash}${binding ? `:${binding}` : ""}`;
}

export function verifyIdentityProof(
  proof: IdentityProof,
  options: VerifyOptions
): VerifyResult {
  const now = Date.now();
  if (
    !Number.isFinite(proof.timestamp) ||
    Math.abs(now - proof.timestamp) > MAX_CHALLENGE_AGE_MS + MAX_CHALLENGE_SKEW_MS
  ) {
    return { ok: false, pubkeyHash: "", reason: "stale_or_skewed_timestamp" };
  }

  let pubkeyBytes: Buffer;
  try {
    pubkeyBytes = decodeBase64Standard(proof.pubkey);
  } catch {
    return { ok: false, pubkeyHash: "", reason: "invalid_pubkey" };
  }
  if (pubkeyBytes.length !== 32) {
    return { ok: false, pubkeyHash: "", reason: "invalid_pubkey_length" };
  }

  const derivedHash = Buffer.from(blake2b(pubkeyBytes, { dkLen: 32 })).toString("hex");
  if (derivedHash !== proof.pubkeyHash) {
    return { ok: false, pubkeyHash: derivedHash, reason: "pubkey_hash_mismatch" };
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = decodeBase64Standard(proof.signature);
  } catch {
    return { ok: false, pubkeyHash: derivedHash, reason: "invalid_signature_encoding" };
  }
  if (signatureBytes.length !== 64) {
    return { ok: false, pubkeyHash: derivedHash, reason: "invalid_signature_length" };
  }

  const message = buildSignedMessage(
    options.context,
    proof.timestamp,
    derivedHash,
    options.binding
  );

  const keyDer = Buffer.concat([SPKI_ED25519_PREFIX, pubkeyBytes]);
  let keyObject;
  try {
    keyObject = createPublicKey({ key: keyDer, format: "der", type: "spki" });
  } catch {
    return { ok: false, pubkeyHash: derivedHash, reason: "invalid_pubkey_format" };
  }

  const valid = verify(null, Buffer.from(message, "utf8"), keyObject, signatureBytes);
  if (!valid) {
    return { ok: false, pubkeyHash: derivedHash, reason: "signature_verification_failed" };
  }

  return { ok: true, pubkeyHash: derivedHash };
}

function decodeBase64Standard(value: string): Buffer {
  return Buffer.from(value, "base64");
}
