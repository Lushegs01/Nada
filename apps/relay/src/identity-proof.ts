// Server-side verification of identity-proof challenges signed by clients.
//
// A client proves it controls the Ed25519 private key behind a pubkeyHash by
// signing a recent challenge string. The relay derives pubkeyHash from the
// supplied pubkey using BLAKE2b-256 (matching libsodium's crypto_generichash
// default) and verifies the Ed25519 signature using Node's built-in crypto
// (no WASM init required).

import { blake2b } from "@noble/hashes/blake2b";
import { createPublicKey, verify } from "node:crypto";

// SubjectPublicKeyInfo prefix for raw 32-byte Ed25519 public keys. Required
// because Node's crypto.createPublicKey accepts SPKI/PEM/JWK, not raw bytes.
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
  /** Domain-separation tag bound into the signed payload, e.g. "livekit", "turn", "ws-register". */
  context: string;
  /** Optional opaque value bound into the signed payload (room, group id, server-issued nonce). */
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
  // Libsodium's base64_variants.ORIGINAL is standard base64 (with padding).
  // Buffer.from(str, "base64") accepts both standard and url-safe but pads
  // automatically; we still validate length downstream.
  return Buffer.from(value, "base64");
}
