import { describe, expect, it } from "vitest";

import {
  createAnonymousIdentity,
  createGroupSenderKey,
  createSeedPhrase,
  decryptGroupMessage,
  encryptGroupMessage,
  openSealedContentKey,
  sealContentKey
} from "../src/index";

describe("sealed content keys", () => {
  it("delivers a group key only to addressed members", async () => {
    const owner = await createAnonymousIdentity(createSeedPhrase());
    const member = await createAnonymousIdentity(createSeedPhrase());
    const outsider = await createAnonymousIdentity(createSeedPhrase());

    const senderKey = await createGroupSenderKey();
    const envelopes = await sealContentKey(senderKey, [
      { pubkeyHash: member.pubkeyHash, publicKey: member.pubkey }
    ]);

    expect(envelopes).toHaveLength(1);
    // The key must not appear in the clear anywhere on the wire.
    expect(JSON.stringify(envelopes)).not.toContain(senderKey);

    await expect(
      openSealedContentKey({
        envelopes,
        recipientPubkeyHash: member.pubkeyHash,
        recipientPublicKey: member.pubkey,
        recipientPrivateKey: member.privateKey
      })
    ).resolves.toBe(senderKey);

    // No envelope addressed to the outsider at all.
    await expect(
      openSealedContentKey({
        envelopes,
        recipientPubkeyHash: outsider.pubkeyHash,
        recipientPublicKey: outsider.pubkey,
        recipientPrivateKey: outsider.privateKey
      })
    ).resolves.toBeNull();

    // Even handed someone else's envelope, the outsider cannot open it.
    await expect(
      openSealedContentKey({
        envelopes: [{ ...envelopes[0]!, recipient: outsider.pubkeyHash }],
        recipientPubkeyHash: outsider.pubkeyHash,
        recipientPublicKey: outsider.pubkey,
        recipientPrivateKey: outsider.privateKey
      })
    ).resolves.toBeNull();

    const ciphertext = await encryptGroupMessage("group secret", senderKey);
    await expect(decryptGroupMessage(ciphertext, senderKey)).resolves.toBe(
      "group secret"
    );
    expect(owner.pubkeyHash).not.toBe(member.pubkeyHash);
  });

  it("skips recipients whose public key is unknown or malformed", async () => {
    const good = await createAnonymousIdentity(createSeedPhrase());
    const senderKey = await createGroupSenderKey();

    const envelopes = await sealContentKey(senderKey, [
      { pubkeyHash: good.pubkeyHash, publicKey: good.pubkey },
      { pubkeyHash: "unknown", publicKey: "" },
      { pubkeyHash: "malformed", publicKey: "not-a-real-key" }
    ]);

    expect(envelopes.map((envelope) => envelope.recipient)).toEqual([
      good.pubkeyHash
    ]);
  });
});
