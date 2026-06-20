import { describe, expect, it } from "vitest";

import {
  createAnonymousIdentity,
  createSeedPhrase,
  decryptPrivateKey,
  openSealedSenderEnvelope,
  createSealedSenderEnvelope
} from "../src";

describe("sealed envelope scaffold", () => {
  it("seals and opens a libsodium anonymous envelope", async () => {
    const seedPhrase = createSeedPhrase();
    const identity = await createAnonymousIdentity(seedPhrase);
    const privateKey = await decryptPrivateKey(
      identity.encryptedPrivateKey,
      seedPhrase
    );

    const envelope = await createSealedSenderEnvelope({
      recipient: identity.pubkeyHash,
      recipientPublicKey: identity.pubkey,
      plaintext: "sealed hello"
    });

    await expect(
      openSealedSenderEnvelope(envelope, identity.pubkey, privateKey)
    ).resolves.toBe("sealed hello");
  });
});
