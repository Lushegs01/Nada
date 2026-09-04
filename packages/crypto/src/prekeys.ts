import { getSodium } from "./sodiumReady";

/**
 * Forward secrecy for direct messages, via X3DH-style prekeys.
 *
 * The sealed-box format (`directMessage.ts`, v2) encrypts to a recipient's
 * long-term identity key. That is confidential against the relay, but it has
 * no forward secrecy: whoever later obtains that one key — a seized device, a
 * restored seed phrase, a leaked backup — decrypts every message ever sent to
 * it, including ciphertext captured months earlier.
 *
 * This closes that. Each identity publishes:
 *
 *   - a *signed prekey*: an X25519 key signed by the Ed25519 identity key and
 *     rotated on a schedule, and
 *   - a batch of *one-time prekeys*: X25519 keys, each usable once.
 *
 * A sender fetches a bundle, generates an ephemeral key, and derives a message
 * key from the Diffie-Hellmans between them. The recipient deletes the
 * one-time prekey the moment it is used and drops signed prekeys as they age
 * out. Once both private halves are gone the message key cannot be
 * reconstructed — not by the recipient, and not by anyone holding the identity
 * key. That is the property the identity key alone could never provide.
 *
 * The signature over the signed prekey is what stops the relay handing a
 * sender a prekey of its own: a sender verifies it against the recipient's
 * identity key before using the bundle, so the relay distributing these is
 * storage, not trust.
 *
 * What this still does not provide:
 *   - **Post-compromise security.** There is no ratchet, so an attacker who
 *     takes a device's current prekey state reads until those keys rotate.
 *   - **History across devices.** Restoring an identity from its seed phrase
 *     does not recover prekey private halves, so messages queued for the old
 *     device cannot be opened on the new one. This is inherent to forward
 *     secrecy, not a defect.
 */

export const PREKEY_MESSAGE_VERSION = 3 as const;
export const PREKEY_MESSAGE_ALG = "prekey-x25519" as const;

/** Domain separator for the key-derivation hash. */
const KDF_CONTEXT = "nada-prekey-v3";
/** Domain separator for the sender's signature, distinct from v2's. */
const SIGNATURE_CONTEXT = "nada-dm:v3";

export interface PrekeyPair {
  /** Opaque identifier the recipient uses to find the private half again. */
  id: string;
  publicKey: string;
  privateKey: string;
}

export interface SignedPrekey extends PrekeyPair {
  /** Ed25519 signature over the raw public key, by the identity key. */
  signature: string;
  createdAt: number;
}

/** The public half of a recipient's bundle, as published to the relay. */
export interface PrekeyBundle {
  identityKey: string;
  signedPrekeyId: string;
  signedPrekey: string;
  signedPrekeySignature: string;
  /** Absent once a recipient's one-time prekeys are exhausted. */
  oneTimePrekeyId?: string | undefined;
  oneTimePrekey?: string | undefined;
}

export interface PrekeyMessage {
  v: typeof PREKEY_MESSAGE_VERSION;
  alg: typeof PREKEY_MESSAGE_ALG;
  /** Sender's ephemeral X25519 public key. */
  ek: string;
  /** Which of the recipient's prekeys this was addressed to. */
  spk: string;
  opk?: string | undefined;
  n: string;
  ct: string;
}

interface InnerPayload {
  v: typeof PREKEY_MESSAGE_VERSION;
  body: string;
  sender: string;
  ts: number;
  sig: string;
}

export function prekeySigningString(args: {
  recipientPubkeyHash: string;
  timestamp: number;
  body: string;
}): string {
  return `${SIGNATURE_CONTEXT}:${args.recipientPubkeyHash}:${args.timestamp}:${args.body}`;
}

/** True when `payload` is a v3 prekey message rather than a v2 sealed box. */
export function isPrekeyMessage(payload: string): boolean {
  if (!payload.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(payload) as PrekeyMessage;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.v === PREKEY_MESSAGE_VERSION &&
      parsed.alg === PREKEY_MESSAGE_ALG &&
      typeof parsed.ct === "string" &&
      typeof parsed.ek === "string"
    );
  } catch {
    return false;
  }
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
async function newPrekeyPair(): Promise<PrekeyPair> {
  const sodium = await getSodium();
  const pair = sodium.crypto_box_keypair();
  return {
    id: sodium.to_hex(sodium.randombytes_buf(16)),
    publicKey: sodium.to_base64(pair.publicKey, sodium.base64_variants.ORIGINAL),
    privateKey: sodium.to_base64(pair.privateKey, sodium.base64_variants.ORIGINAL)
  };
}

/** Mints a signed prekey, authenticated by the identity key. */
export async function createSignedPrekey(
  identityPrivateKey: string
): Promise<SignedPrekey> {
  const sodium = await getSodium();
  const pair = await newPrekeyPair();
  const signature = sodium.crypto_sign_detached(
    sodium.from_base64(pair.publicKey, sodium.base64_variants.ORIGINAL),
    sodium.from_base64(identityPrivateKey, sodium.base64_variants.ORIGINAL)
  );
  return {
    ...pair,
    signature: sodium.to_base64(signature, sodium.base64_variants.ORIGINAL),
    createdAt: Date.now()
  };
}

/** Mints a batch of one-time prekeys. Each is deleted the first time it opens a message. */
export async function createOneTimePrekeys(count: number): Promise<PrekeyPair[]> {
  const prekeys: PrekeyPair[] = [];
  for (let index = 0; index < count; index += 1) {
    prekeys.push(await newPrekeyPair());
  }
  return prekeys;
}

/**
 * Verifies that a bundle's signed prekey really was issued by the identity it
 * claims. Without this check the relay could hand a sender a prekey it holds
 * the private half of and read everything sent under it.
 */
export async function verifyPrekeyBundle(bundle: PrekeyBundle): Promise<boolean> {
  const sodium = await getSodium();
  try {
    return sodium.crypto_sign_verify_detached(
      sodium.from_base64(bundle.signedPrekeySignature, sodium.base64_variants.ORIGINAL),
      sodium.from_base64(bundle.signedPrekey, sodium.base64_variants.ORIGINAL),
      sodium.from_base64(bundle.identityKey, sodium.base64_variants.ORIGINAL)
    );
  } catch {
    return false;
  }
}

/**
 * Derives the message key from the Diffie-Hellmans.
 *
 * Both public halves are hashed in alongside the shared secrets so a key is
 * bound to the exact pair of prekeys it was derived for — an attacker cannot
 * re-present the same secrets under different keys.
 */
async function deriveMessageKey(args: {
  dh1: Uint8Array;
  dh2: Uint8Array | null;
  ephemeralPublicKey: Uint8Array;
  signedPrekey: Uint8Array;
  oneTimePrekey: Uint8Array | null;
}): Promise<Uint8Array> {
  const sodium = await getSodium();
  const parts: Uint8Array[] = [
    sodium.from_string(KDF_CONTEXT),
    args.dh1,
    ...(args.dh2 ? [args.dh2] : []),
    args.ephemeralPublicKey,
    args.signedPrekey,
    ...(args.oneTimePrekey ? [args.oneTimePrekey] : [])
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const input = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    input.set(part, offset);
    offset += part.length;
  }
  return sodium.crypto_generichash(sodium.crypto_secretbox_KEYBYTES, input);
}

export async function encryptWithPrekeyBundle(args: {
  body: string;
  bundle: PrekeyBundle;
  recipientPubkeyHash: string;
  senderPublicKey: string;
  senderPrivateKey: string;
  timestamp?: number;
}): Promise<string> {
  const sodium = await getSodium();
  if (!(await verifyPrekeyBundle(args.bundle))) {
    throw new Error("Prekey bundle signature failed verification.");
  }

  const timestamp = args.timestamp ?? Date.now();
  const signature = sodium.crypto_sign_detached(
    sodium.from_string(
      prekeySigningString({
        body: args.body,
        recipientPubkeyHash: args.recipientPubkeyHash,
        timestamp
      })
    ),
    sodium.from_base64(args.senderPrivateKey, sodium.base64_variants.ORIGINAL)
  );
  const inner: InnerPayload = {
    v: PREKEY_MESSAGE_VERSION,
    body: args.body,
    sender: args.senderPublicKey,
    ts: timestamp,
    sig: sodium.to_base64(signature, sodium.base64_variants.ORIGINAL)
  };

  const ephemeral = sodium.crypto_box_keypair();
  const signedPrekey = sodium.from_base64(
    args.bundle.signedPrekey,
    sodium.base64_variants.ORIGINAL
  );
  const oneTimePrekey = args.bundle.oneTimePrekey
    ? sodium.from_base64(args.bundle.oneTimePrekey, sodium.base64_variants.ORIGINAL)
    : null;

  const messageKey = await deriveMessageKey({
    dh1: sodium.crypto_scalarmult(ephemeral.privateKey, signedPrekey),
    dh2: oneTimePrekey
      ? sodium.crypto_scalarmult(ephemeral.privateKey, oneTimePrekey)
      : null,
    ephemeralPublicKey: ephemeral.publicKey,
    signedPrekey,
    oneTimePrekey
  });

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(JSON.stringify(inner)),
    nonce,
    messageKey
  );

  const message: PrekeyMessage = {
    v: PREKEY_MESSAGE_VERSION,
    alg: PREKEY_MESSAGE_ALG,
    ek: sodium.to_base64(ephemeral.publicKey, sodium.base64_variants.ORIGINAL),
    spk: args.bundle.signedPrekeyId,
    ...(args.bundle.oneTimePrekeyId ? { opk: args.bundle.oneTimePrekeyId } : {}),
    n: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    ct: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL)
  };
  return JSON.stringify(message);
}

export interface PrekeyPlaintext {
  body: string;
  senderPublicKey: string;
  timestamp: number;
  /** Prekey ids this message consumed, so the caller can delete them. */
  usedSignedPrekeyId: string;
  usedOneTimePrekeyId?: string | undefined;
}

/**
 * Opens a v3 prekey message.
 *
 * `resolvePrekey` hands back the private half for an id, or null when it is
 * gone — which is the expected outcome for a one-time prekey that has already
 * been used, and is exactly what makes the message unreadable from then on.
 */
export async function decryptWithPrekeys(args: {
  payload: string;
  recipientPubkeyHash: string;
  resolvePrekey: (id: string) => Promise<string | null>;
}): Promise<PrekeyPlaintext> {
  const sodium = await getSodium();

  let message: PrekeyMessage;
  try {
    message = JSON.parse(args.payload) as PrekeyMessage;
  } catch {
    throw new Error("Message is not a NADA prekey envelope.");
  }
  if (message.v !== PREKEY_MESSAGE_VERSION || message.alg !== PREKEY_MESSAGE_ALG) {
    throw new Error("Unsupported prekey envelope version.");
  }

  const signedPrekeyPrivate = await args.resolvePrekey(message.spk);
  if (!signedPrekeyPrivate) {
    throw new Error("Signed prekey for this message is no longer held.");
  }
  const oneTimePrekeyPrivate = message.opk
    ? await args.resolvePrekey(message.opk)
    : null;
  if (message.opk && !oneTimePrekeyPrivate) {
    throw new Error("One-time prekey for this message has already been consumed.");
  }

  const ephemeralPublic = sodium.from_base64(
    message.ek,
    sodium.base64_variants.ORIGINAL
  );
  const signedPrekeySecret = sodium.from_base64(
    signedPrekeyPrivate,
    sodium.base64_variants.ORIGINAL
  );
  const oneTimeSecret = oneTimePrekeyPrivate
    ? sodium.from_base64(oneTimePrekeyPrivate, sodium.base64_variants.ORIGINAL)
    : null;

  const messageKey = await deriveMessageKey({
    dh1: sodium.crypto_scalarmult(signedPrekeySecret, ephemeralPublic),
    dh2: oneTimeSecret
      ? sodium.crypto_scalarmult(oneTimeSecret, ephemeralPublic)
      : null,
    ephemeralPublicKey: ephemeralPublic,
    signedPrekey: sodium.crypto_scalarmult_base(signedPrekeySecret),
    oneTimePrekey: oneTimeSecret ? sodium.crypto_scalarmult_base(oneTimeSecret) : null
  });

  const opened = sodium.crypto_secretbox_open_easy(
    sodium.from_base64(message.ct, sodium.base64_variants.ORIGINAL),
    sodium.from_base64(message.n, sodium.base64_variants.ORIGINAL),
    messageKey
  );

  const inner = JSON.parse(sodium.to_string(opened)) as InnerPayload;
  if (
    inner.v !== PREKEY_MESSAGE_VERSION ||
    typeof inner.body !== "string" ||
    typeof inner.sender !== "string" ||
    typeof inner.sig !== "string" ||
    typeof inner.ts !== "number"
  ) {
    throw new Error("Prekey message payload is malformed.");
  }

  const signatureValid = sodium.crypto_sign_verify_detached(
    sodium.from_base64(inner.sig, sodium.base64_variants.ORIGINAL),
    sodium.from_string(
      prekeySigningString({
        body: inner.body,
        recipientPubkeyHash: args.recipientPubkeyHash,
        timestamp: inner.ts
      })
    ),
    sodium.from_base64(inner.sender, sodium.base64_variants.ORIGINAL)
  );
  if (!signatureValid) {
    throw new Error("Prekey message signature failed verification.");
  }

  return {
    body: inner.body,
    senderPublicKey: inner.sender,
    timestamp: inner.ts,
    usedSignedPrekeyId: message.spk,
    ...(message.opk ? { usedOneTimePrekeyId: message.opk } : {})
  };
}
