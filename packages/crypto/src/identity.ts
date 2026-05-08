import { seedPhraseToIdentitySeed } from "./seed";
import { getSodium } from "./sodiumReady";

export interface AnonymousIdentity {
  pubkey: string;
  pubkeyHash: string;
  /** Encrypted-at-rest blob keyed by the seed phrase (legacy/MVP). */
  encryptedPrivateKey: string;
  /**
   * Raw Ed25519 private key (base64, libsodium ORIGINAL variant). Returned so
   * the caller can keep it in memory or persist it locally for signing.
   * The current MVP threat model never decrypts encryptedPrivateKey, so the
   * caller is expected to persist this alongside the record locally.
   */
  privateKey: string;
  createdAt: number;
}

interface EncryptedPrivateKeyPayload {
  version: 1;
  nonce: string;
  salt: string;
  ciphertext: string;
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function createAnonymousIdentity(
  seedPhrase: string
): Promise<AnonymousIdentity> {
  const sodium = await getSodium();
  const identitySeed = seedPhraseToIdentitySeed(seedPhrase);
  const keypair = sodium.crypto_sign_seed_keypair(identitySeed);
  const pubkey = sodium.to_base64(
    keypair.publicKey,
    sodium.base64_variants.ORIGINAL
  );
  const privateKey = sodium.to_base64(
    keypair.privateKey,
    sodium.base64_variants.ORIGINAL
  );

  return {
    pubkey,
    pubkeyHash: await hashPublicKey(pubkey),
    encryptedPrivateKey: await encryptPrivateKey(privateKey, seedPhrase),
    privateKey,
    createdAt: Date.now()
  };
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function hashPublicKey(publicKeyBase64: string): Promise<string> {
  const sodium = await getSodium();
  const publicKeyBytes = sodium.from_base64(
    publicKeyBase64,
    sodium.base64_variants.ORIGINAL
  );
  const digest = sodium.crypto_generichash(32, publicKeyBytes);
  return sodium.to_hex(digest);
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function encryptPrivateKey(
  privateKeyBase64: string,
  seedPhrase: string
): Promise<string> {
  const sodium = await getSodium();
  if (!sodium.crypto_pwhash_SALTBYTES) {
    throw new Error("Encryption library is not fully initialized. Please try again in a moment.");
  }
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    seedPhrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT
  );
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(privateKeyBase64),
    nonce,
    key
  );
  const payload: EncryptedPrivateKeyPayload = {
    version: 1,
    nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    salt: sodium.to_base64(salt, sodium.base64_variants.ORIGINAL),
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL)
  };

  return JSON.stringify(payload);
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function decryptPrivateKey(
  encryptedPayload: string,
  seedPhrase: string
): Promise<string> {
  const sodium = await getSodium();
  const payload = JSON.parse(encryptedPayload) as EncryptedPrivateKeyPayload;
  const salt = sodium.from_base64(payload.salt, sodium.base64_variants.ORIGINAL);
  const nonce = sodium.from_base64(payload.nonce, sodium.base64_variants.ORIGINAL);
  const ciphertext = sodium.from_base64(
    payload.ciphertext,
    sodium.base64_variants.ORIGINAL
  );
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    seedPhrase,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT
  );
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  return sodium.to_string(plaintext);
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
//
// signIdentityProof signs a server challenge with the user's Ed25519 identity
// private key. Use it to prove control of a pubkey to authenticated endpoints
// (LiveKit token issuance, TURN credential issuance, WebSocket register).
// The caller is responsible for assembling the canonical message string —
// keep the format (context:timestamp:pubkeyHash[:binding]) in lockstep with
// the server's identity-proof verifier.
export async function signIdentityProof(
  privateKeyBase64: string,
  message: string
): Promise<string> {
  const sodium = await getSodium();
  const privateKey = sodium.from_base64(
    privateKeyBase64,
    sodium.base64_variants.ORIGINAL
  );
  const signature = sodium.crypto_sign_detached(
    sodium.from_string(message),
    privateKey
  );
  return sodium.to_base64(signature, sodium.base64_variants.ORIGINAL);
}

export interface IdentityProofPayload {
  pubkey: string;
  pubkeyHash: string;
  signature: string;
  timestamp: number;
}

// Convenience helper: builds a fully-formed identity proof payload that
// servers can verify by reconstructing the message from (context, timestamp,
// pubkeyHash, binding).
export async function buildIdentityProof(args: {
  privateKeyBase64: string;
  pubkey: string;
  pubkeyHash: string;
  context: string;
  binding?: string;
}): Promise<IdentityProofPayload> {
  const timestamp = Date.now();
  const message = `${args.context}:${timestamp}:${args.pubkeyHash}${
    args.binding ? `:${args.binding}` : ""
  }`;
  const signature = await signIdentityProof(args.privateKeyBase64, message);
  return {
    pubkey: args.pubkey,
    pubkeyHash: args.pubkeyHash,
    signature,
    timestamp
  };
}
