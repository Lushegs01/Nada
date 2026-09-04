import { getSodium } from "./sodiumReady";

/**
 * NADA direct-message encryption.
 *
 * Wire format (v2):
 *
 *   { "v": 2, "alg": "sealedbox-ed25519", "ct": "<base64 crypto_box_seal>" }
 *
 * The sealed box is addressed to the recipient's X25519 key, derived from
 * their long-term Ed25519 identity key. Inside the box sits a signed payload:
 *
 *   { "v": 2, "body": "<plaintext>", "sender": "<sender Ed25519 pubkey>",
 *     "ts": <ms>, "sig": "<Ed25519 detached signature>" }
 *
 * so the recipient learns, and can verify, *who* wrote the message rather than
 * trusting the relay's routing header. The signature covers the recipient's
 * pubkey hash and the timestamp as well as the body, which binds a ciphertext
 * to one recipient and one moment: a captured envelope cannot be re-addressed
 * to a third party or replayed into a different conversation without failing
 * verification.
 *
 * What this does NOT provide, stated plainly because the UI must not overclaim:
 *   - No forward secrecy. There is no ratchet; whoever later obtains a
 *     recipient's identity private key can decrypt every ciphertext ever sent
 *     to them. Signal/MLS session support is the upgrade path.
 *   - No metadata protection. The relay still sees sender, recipient and
 *     timing, because it routes on those fields.
 */

export const DIRECT_MESSAGE_VERSION = 2 as const;
export const DIRECT_MESSAGE_ALG = "sealedbox-ed25519" as const;

/** Domain separator so a DM signature can never be replayed as another proof. */
const SIGNATURE_CONTEXT = "nada-dm:v2";

export interface SealedDirectMessage {
  v: typeof DIRECT_MESSAGE_VERSION;
  alg: typeof DIRECT_MESSAGE_ALG;
  ct: string;
}

export interface DirectMessagePlaintext {
  /** Decrypted message body. */
  body: string;
  /** Sender's Ed25519 public key, taken from inside the sealed payload. */
  senderPublicKey: string;
  /** Timestamp the sender bound into the signature. */
  timestamp: number;
}

interface InnerPayload {
  v: typeof DIRECT_MESSAGE_VERSION;
  body: string;
  sender: string;
  ts: number;
  sig: string;
}

/**
 * Canonical string covered by the sender's signature. Kept as an explicit
 * function so the signing and verifying sides can never drift apart.
 */
export function directMessageSigningString(args: {
  recipientPubkeyHash: string;
  timestamp: number;
  body: string;
}): string {
  return `${SIGNATURE_CONTEXT}:${args.recipientPubkeyHash}:${args.timestamp}:${args.body}`;
}

/**
 * True when `payload` is a v2 sealed direct message rather than a legacy
 * base64 body. Cheap enough to run on every inbound envelope.
 */
export function isSealedDirectMessage(payload: string): boolean {
  if (!payload.startsWith("{")) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(payload);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as SealedDirectMessage).v === DIRECT_MESSAGE_VERSION &&
      (parsed as SealedDirectMessage).alg === DIRECT_MESSAGE_ALG &&
      typeof (parsed as SealedDirectMessage).ct === "string"
    );
  } catch {
    return false;
  }
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function encryptDirectMessage(args: {
  body: string;
  recipientPubkeyHash: string;
  recipientPublicKey: string;
  senderPublicKey: string;
  senderPrivateKey: string;
  timestamp?: number;
}): Promise<string> {
  const sodium = await getSodium();
  const timestamp = args.timestamp ?? Date.now();

  const signature = sodium.crypto_sign_detached(
    sodium.from_string(
      directMessageSigningString({
        body: args.body,
        recipientPubkeyHash: args.recipientPubkeyHash,
        timestamp
      })
    ),
    sodium.from_base64(args.senderPrivateKey, sodium.base64_variants.ORIGINAL)
  );

  const inner: InnerPayload = {
    v: DIRECT_MESSAGE_VERSION,
    body: args.body,
    sender: args.senderPublicKey,
    ts: timestamp,
    sig: sodium.to_base64(signature, sodium.base64_variants.ORIGINAL)
  };

  const recipientCurve = sodium.crypto_sign_ed25519_pk_to_curve25519(
    sodium.from_base64(args.recipientPublicKey, sodium.base64_variants.ORIGINAL)
  );
  const sealed = sodium.crypto_box_seal(
    sodium.from_string(JSON.stringify(inner)),
    recipientCurve
  );

  const envelope: SealedDirectMessage = {
    v: DIRECT_MESSAGE_VERSION,
    alg: DIRECT_MESSAGE_ALG,
    ct: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL)
  };
  return JSON.stringify(envelope);
}

/**
 * Opens a v2 sealed direct message and verifies the sender's signature.
 *
 * Throws when the payload is not a v2 envelope, cannot be opened with the
 * recipient's key, or carries a signature that does not verify against the
 * enclosed sender key — a message that fails any of those checks must never
 * be shown as if it were authentic.
 */
export async function decryptDirectMessage(args: {
  payload: string;
  recipientPubkeyHash: string;
  recipientPublicKey: string;
  recipientPrivateKey: string;
}): Promise<DirectMessagePlaintext> {
  const sodium = await getSodium();

  let envelope: SealedDirectMessage;
  try {
    envelope = JSON.parse(args.payload) as SealedDirectMessage;
  } catch {
    throw new Error("Direct message is not a sealed NADA envelope.");
  }
  if (envelope.v !== DIRECT_MESSAGE_VERSION || envelope.alg !== DIRECT_MESSAGE_ALG) {
    throw new Error("Unsupported direct message envelope version.");
  }

  const recipientEd25519PublicKey = sodium.from_base64(
    args.recipientPublicKey,
    sodium.base64_variants.ORIGINAL
  );
  const recipientEd25519PrivateKey = sodium.from_base64(
    args.recipientPrivateKey,
    sodium.base64_variants.ORIGINAL
  );
  const opened = sodium.crypto_box_seal_open(
    sodium.from_base64(envelope.ct, sodium.base64_variants.ORIGINAL),
    sodium.crypto_sign_ed25519_pk_to_curve25519(recipientEd25519PublicKey),
    sodium.crypto_sign_ed25519_sk_to_curve25519(recipientEd25519PrivateKey)
  );

  const inner = JSON.parse(sodium.to_string(opened)) as InnerPayload;
  if (
    inner.v !== DIRECT_MESSAGE_VERSION ||
    typeof inner.body !== "string" ||
    typeof inner.sender !== "string" ||
    typeof inner.sig !== "string" ||
    typeof inner.ts !== "number"
  ) {
    throw new Error("Sealed direct message payload is malformed.");
  }

  const signatureValid = sodium.crypto_sign_verify_detached(
    sodium.from_base64(inner.sig, sodium.base64_variants.ORIGINAL),
    sodium.from_string(
      directMessageSigningString({
        body: inner.body,
        recipientPubkeyHash: args.recipientPubkeyHash,
        timestamp: inner.ts
      })
    ),
    sodium.from_base64(inner.sender, sodium.base64_variants.ORIGINAL)
  );
  if (!signatureValid) {
    throw new Error("Sealed direct message signature failed verification.");
  }

  return {
    body: inner.body,
    senderPublicKey: inner.sender,
    timestamp: inner.ts
  };
}
