import { getSodium } from "./sodiumReady";

/**
 * Symmetric content encryption for payloads that several identities read:
 * group messages and status updates.
 *
 * The cipher is libsodium's XSalsa20-Poly1305 secretbox with a random 192-bit
 * nonce per message — production-grade authenticated encryption, not a stub.
 * The part that was a stub was key *distribution*, which now lives in
 * `sealedKeys.ts`: the content key is sealed to each recipient's identity key
 * instead of riding beside the ciphertext in the clear.
 *
 * Remaining limitation: there is no ratcheting, so a key epoch has no forward
 * secrecy and membership changes require an explicit rotation.
 */

export interface GroupCiphertext {
  ciphertext: string;
  nonce: string;
  version: 1;
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function createGroupSenderKey(): Promise<string> {
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
