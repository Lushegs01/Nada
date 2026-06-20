import { getSodium } from "./sodiumReady";

export interface GroupCiphertext {
  ciphertext: string;
  nonce: string;
  version: 1;
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function createGroupSenderKey(): Promise<string> {
  // ⚠️ MVP_ONLY — replace before production
  const sodium = await getSodium();
  const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  return sodium.to_base64(key, sodium.base64_variants.ORIGINAL);
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function encryptGroupMessage(
  plaintext: string,
  senderKeyBase64: string
): Promise<GroupCiphertext> {
  // ⚠️ MVP_ONLY — replace before production
  const sodium = await getSodium();
  const key = sodium.from_base64(
    senderKeyBase64,
    sodium.base64_variants.ORIGINAL
  );
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    key
  );

  return {
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
    nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    version: 1
  };
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function decryptGroupMessage(
  payload: GroupCiphertext,
  senderKeyBase64: string
): Promise<string> {
  // ⚠️ MVP_ONLY — replace before production
  const sodium = await getSodium();
  const key = sodium.from_base64(
    senderKeyBase64,
    sodium.base64_variants.ORIGINAL
  );
  const plaintext = sodium.crypto_secretbox_open_easy(
    sodium.from_base64(payload.ciphertext, sodium.base64_variants.ORIGINAL),
    sodium.from_base64(payload.nonce, sodium.base64_variants.ORIGINAL),
    key
  );

  return sodium.to_string(plaintext);
}
