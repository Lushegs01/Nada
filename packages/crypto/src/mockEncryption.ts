import { getSodium } from "./sodiumReady";

export const SECURITY_STUB_WARNING =
  "⚠️ MVP_ONLY — replace before production";

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function mockEncryptMessage(plaintext: string): Promise<string> {
  // ⚠️ MVP_ONLY — replace before production
  const sodium = await getSodium();
  return sodium.to_base64(
    sodium.from_string(plaintext),
    sodium.base64_variants.ORIGINAL
  );
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function mockDecryptMessage(ciphertext: string): Promise<string> {
  // ⚠️ MVP_ONLY — replace before production
  const sodium = await getSodium();
  const bytes = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
  return sodium.to_string(bytes);
}
