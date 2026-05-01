import { seedPhraseToIdentitySeed } from "./seed";
import { getSodium } from "./sodiumReady";

export interface AnonymousIdentity {
  pubkey: string;
  pubkeyHash: string;
  encryptedPrivateKey: string;
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
