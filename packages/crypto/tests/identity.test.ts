import { describe, expect, it } from "vitest";

import {
  createAnonymousIdentity,
  createSeedPhrase,
  isValidSeedPhrase,
  mockDecryptMessage,
  mockEncryptMessage
} from "../src";

describe("crypto package", () => {
  it("creates a recoverable anonymous identity", async () => {
    const seedPhrase = createSeedPhrase();
    expect(isValidSeedPhrase(seedPhrase)).toBe(true);

    const first = await createAnonymousIdentity(seedPhrase);
    const second = await createAnonymousIdentity(seedPhrase);

    expect(first.pubkey).toBe(second.pubkey);
    expect(first.pubkeyHash).toBe(second.pubkeyHash);
    expect(first.encryptedPrivateKey).not.toHaveLength(0);
  });

  it("labels Phase 1 mock message encryption behavior", async () => {
    // ⚠️ MVP_ONLY — replace before production
    const ciphertext = await mockEncryptMessage("hello");
    await expect(mockDecryptMessage(ciphertext)).resolves.toBe("hello");
  });
});
