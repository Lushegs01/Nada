import { describe, expect, it } from "vitest";

import {
  createAnonymousIdentity,
  createSeedPhrase,
  decryptDirectMessage,
  encryptDirectMessage,
  isSealedDirectMessage,
  __UNSAFE_mockEncryptMessage
} from "../src/index";

async function identity() {
  return createAnonymousIdentity(createSeedPhrase());
}

describe("sealed direct messages", () => {
  it("round-trips a message only the addressed recipient can open", async () => {
    const alice = await identity();
    const bob = await identity();
    const eve = await identity();

    const payload = await encryptDirectMessage({
      body: "meet me at the library",
      recipientPubkeyHash: bob.pubkeyHash,
      recipientPublicKey: bob.pubkey,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: alice.privateKey
    });

    // The wire payload must not contain the plaintext in any readable form.
    expect(payload).not.toContain("library");
    expect(payload).not.toContain(
      await __UNSAFE_mockEncryptMessage("meet me at the library")
    );
    expect(isSealedDirectMessage(payload)).toBe(true);

    const opened = await decryptDirectMessage({
      payload,
      recipientPubkeyHash: bob.pubkeyHash,
      recipientPublicKey: bob.pubkey,
      recipientPrivateKey: bob.privateKey
    });
    expect(opened.body).toBe("meet me at the library");
    expect(opened.senderPublicKey).toBe(alice.pubkey);

    await expect(
      decryptDirectMessage({
        payload,
        recipientPubkeyHash: eve.pubkeyHash,
        recipientPublicKey: eve.pubkey,
        recipientPrivateKey: eve.privateKey
      })
    ).rejects.toThrow();
  });

  it("rejects a ciphertext re-addressed to a different conversation", async () => {
    const alice = await identity();
    const bob = await identity();

    const payload = await encryptDirectMessage({
      body: "hello",
      recipientPubkeyHash: bob.pubkeyHash,
      recipientPublicKey: bob.pubkey,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: alice.privateKey
    });

    // Same ciphertext, but the reader believes it was addressed to someone
    // else: the signature binds the recipient, so verification must fail.
    await expect(
      decryptDirectMessage({
        payload,
        recipientPubkeyHash: "0".repeat(64),
        recipientPublicKey: bob.pubkey,
        recipientPrivateKey: bob.privateKey
      })
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a forged sender identity inside the sealed payload", async () => {
    const alice = await identity();
    const bob = await identity();
    const mallory = await identity();

    const payload = await encryptDirectMessage({
      body: "transfer the funds",
      recipientPubkeyHash: bob.pubkeyHash,
      recipientPublicKey: bob.pubkey,
      // Mallory signs, but claims to be Alice.
      senderPublicKey: alice.pubkey,
      senderPrivateKey: mallory.privateKey
    });

    await expect(
      decryptDirectMessage({
        payload,
        recipientPubkeyHash: bob.pubkeyHash,
        recipientPublicKey: bob.pubkey,
        recipientPrivateKey: bob.privateKey
      })
    ).rejects.toThrow(/signature/i);
  });

  it("does not mistake a legacy base64 body for a sealed envelope", async () => {
    const legacy = await __UNSAFE_mockEncryptMessage("legacy body");
    expect(isSealedDirectMessage(legacy)).toBe(false);
    expect(isSealedDirectMessage("{not json")).toBe(false);
  });
});
