import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildSignedMessage,
  derivePubkeyHash,
  verifyIdentityProof
} from "../src/identity-proof";

function newEd25519Identity(): {
  pubkeyBase64: string;
  pubkeyHash: string;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
} {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // Extract raw 32-byte pubkey from SPKI DER (last 32 bytes after the 12-byte prefix).
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const rawPubkey = spki.subarray(spki.length - 32);
  const pubkeyBase64 = rawPubkey.toString("base64");
  return {
    pubkeyBase64,
    pubkeyHash: derivePubkeyHash(pubkeyBase64),
    privateKey
  };
}

describe("identity-proof verifier", () => {
  it("accepts a valid signed proof", () => {
    const { pubkeyBase64, pubkeyHash, privateKey } = newEd25519Identity();
    const timestamp = Date.now();
    const message = buildSignedMessage("livekit", timestamp, pubkeyHash, "room-123");
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");

    const result = verifyIdentityProof(
      { pubkey: pubkeyBase64, pubkeyHash, signature, timestamp },
      { context: "livekit", binding: "room-123" }
    );

    expect(result.ok).toBe(true);
    expect(result.pubkeyHash).toBe(pubkeyHash);
  });

  it("rejects a tampered signature", () => {
    const { pubkeyBase64, pubkeyHash, privateKey } = newEd25519Identity();
    const timestamp = Date.now();
    const message = buildSignedMessage("livekit", timestamp, pubkeyHash, "room-123");
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey);
    signature[0] = (signature[0] ?? 0) ^ 0xff;

    const result = verifyIdentityProof(
      {
        pubkey: pubkeyBase64,
        pubkeyHash,
        signature: signature.toString("base64"),
        timestamp
      },
      { context: "livekit", binding: "room-123" }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("signature_verification_failed");
  });

  it("rejects a stale timestamp", () => {
    const { pubkeyBase64, pubkeyHash, privateKey } = newEd25519Identity();
    const timestamp = Date.now() - 10 * 60 * 1000;
    const message = buildSignedMessage("livekit", timestamp, pubkeyHash, "room-123");
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");

    const result = verifyIdentityProof(
      { pubkey: pubkeyBase64, pubkeyHash, signature, timestamp },
      { context: "livekit", binding: "room-123" }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("stale_timestamp");
  });

  it("rejects a future-skewed timestamp", () => {
    const { pubkeyBase64, pubkeyHash, privateKey } = newEd25519Identity();
    const timestamp = Date.now() + 5 * 60 * 1000;
    const message = buildSignedMessage("livekit", timestamp, pubkeyHash, "room-123");
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");

    const result = verifyIdentityProof(
      { pubkey: pubkeyBase64, pubkeyHash, signature, timestamp },
      { context: "livekit", binding: "room-123" }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("future_skew");
  });

  it("rejects a signature for a different binding", () => {
    const { pubkeyBase64, pubkeyHash, privateKey } = newEd25519Identity();
    const timestamp = Date.now();
    const message = buildSignedMessage("livekit", timestamp, pubkeyHash, "other-room");
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");

    const result = verifyIdentityProof(
      { pubkey: pubkeyBase64, pubkeyHash, signature, timestamp },
      { context: "livekit", binding: "room-123" }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("signature_verification_failed");
  });

  it("rejects a pubkeyHash that doesn't match the pubkey", () => {
    const { pubkeyBase64, privateKey } = newEd25519Identity();
    const fakeHash = "00".repeat(32);
    const timestamp = Date.now();
    const message = buildSignedMessage("livekit", timestamp, fakeHash);
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");

    const result = verifyIdentityProof(
      { pubkey: pubkeyBase64, pubkeyHash: fakeHash, signature, timestamp },
      { context: "livekit" }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("pubkey_hash_mismatch");
  });
});
