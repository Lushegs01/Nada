import { describe, expect, it } from "vitest";

import {
  createAnonymousIdentity,
  createOneTimePrekeys,
  createSeedPhrase,
  createSignedPrekey,
  decryptWithPrekeys,
  encryptWithPrekeyBundle,
  isPrekeyMessage,
  isSealedDirectMessage,
  verifyPrekeyBundle,
  type PrekeyBundle,
  type PrekeyPair
} from "../src/index";

async function identity() {
  return createAnonymousIdentity(createSeedPhrase());
}

/** A recipient's published bundle plus the private halves they keep. */
async function prekeyState(recipient: Awaited<ReturnType<typeof identity>>) {
  const signed = await createSignedPrekey(recipient.privateKey);
  const oneTime = await createOneTimePrekeys(2);
  const held = new Map<string, string>([
    [signed.id, signed.privateKey],
    ...oneTime.map((key) => [key.id, key.privateKey] as [string, string])
  ]);
  const bundle = (oneTimePrekey?: PrekeyPair): PrekeyBundle => ({
    identityKey: recipient.pubkey,
    signedPrekeyId: signed.id,
    signedPrekey: signed.publicKey,
    signedPrekeySignature: signed.signature,
    ...(oneTimePrekey
      ? { oneTimePrekeyId: oneTimePrekey.id, oneTimePrekey: oneTimePrekey.publicKey }
      : {})
  });
  return {
    signed,
    oneTime,
    held,
    bundle,
    resolve: async (id: string) => held.get(id) ?? null
  };
}

describe("prekey messages", () => {
  it("round-trips through a one-time prekey", async () => {
    const alice = await identity();
    const bob = await identity();
    const state = await prekeyState(bob);

    const payload = await encryptWithPrekeyBundle({
      body: "forward secret",
      bundle: state.bundle(state.oneTime[0]),
      recipientPubkeyHash: bob.pubkeyHash,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: alice.privateKey
    });

    expect(payload).not.toContain("forward secret");
    expect(isPrekeyMessage(payload)).toBe(true);
    // A v3 message must not be mistaken for a v2 sealed box.
    expect(isSealedDirectMessage(payload)).toBe(false);

    const opened = await decryptWithPrekeys({
      payload,
      recipientPubkeyHash: bob.pubkeyHash,
      resolvePrekey: state.resolve
    });
    expect(opened.body).toBe("forward secret");
    expect(opened.senderPublicKey).toBe(alice.pubkey);
    expect(opened.usedOneTimePrekeyId).toBe(state.oneTime[0]!.id);
  });

  it("becomes undecryptable once the consumed prekeys are gone", async () => {
    const alice = await identity();
    const bob = await identity();
    const state = await prekeyState(bob);

    const payload = await encryptWithPrekeyBundle({
      body: "should not survive key loss",
      bundle: state.bundle(state.oneTime[0]),
      recipientPubkeyHash: bob.pubkeyHash,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: alice.privateKey
    });

    // The recipient deletes the one-time prekey on use, as the client does.
    state.held.delete(state.oneTime[0]!.id);

    // This is the whole point: even holding the long-term identity private key,
    // the message cannot be reconstructed. Under the v2 sealed-box format the
    // identity key alone was always enough.
    await expect(
      decryptWithPrekeys({
        payload,
        recipientPubkeyHash: bob.pubkeyHash,
        resolvePrekey: state.resolve
      })
    ).rejects.toThrow(/already been consumed/i);
  });

  it("still works when one-time prekeys are exhausted", async () => {
    const alice = await identity();
    const bob = await identity();
    const state = await prekeyState(bob);

    // An attacker can drain a victim's one-time prekeys. Falling back to the
    // signed prekey keeps forward secrecy bounded by its rotation rather than
    // collapsing to the identity key.
    const payload = await encryptWithPrekeyBundle({
      body: "signed prekey only",
      bundle: state.bundle(),
      recipientPubkeyHash: bob.pubkeyHash,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: alice.privateKey
    });

    const opened = await decryptWithPrekeys({
      payload,
      recipientPubkeyHash: bob.pubkeyHash,
      resolvePrekey: state.resolve
    });
    expect(opened.body).toBe("signed prekey only");
    expect(opened.usedOneTimePrekeyId).toBeUndefined();

    // Rotating the signed prekey away closes even that window.
    state.held.delete(state.signed.id);
    await expect(
      decryptWithPrekeys({
        payload,
        recipientPubkeyHash: bob.pubkeyHash,
        resolvePrekey: state.resolve
      })
    ).rejects.toThrow(/no longer held/i);
  });

  it("refuses a bundle whose signed prekey was not signed by that identity", async () => {
    const alice = await identity();
    const bob = await identity();
    const relay = await identity();

    // A malicious relay substituting a prekey it holds the private half of is
    // the attack the signature exists to stop.
    const substituted = await createSignedPrekey(relay.privateKey);
    const forged: PrekeyBundle = {
      identityKey: bob.pubkey,
      signedPrekeyId: substituted.id,
      signedPrekey: substituted.publicKey,
      signedPrekeySignature: substituted.signature
    };

    await expect(verifyPrekeyBundle(forged)).resolves.toBe(false);
    await expect(
      encryptWithPrekeyBundle({
        body: "intercepted",
        bundle: forged,
        recipientPubkeyHash: bob.pubkeyHash,
        senderPublicKey: alice.pubkey,
        senderPrivateKey: alice.privateKey
      })
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a forged sender inside the payload", async () => {
    const alice = await identity();
    const bob = await identity();
    const mallory = await identity();
    const state = await prekeyState(bob);

    const payload = await encryptWithPrekeyBundle({
      body: "transfer the funds",
      bundle: state.bundle(state.oneTime[0]),
      recipientPubkeyHash: bob.pubkeyHash,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: mallory.privateKey
    });

    await expect(
      decryptWithPrekeys({
        payload,
        recipientPubkeyHash: bob.pubkeyHash,
        resolvePrekey: state.resolve
      })
    ).rejects.toThrow(/signature/i);
  });

  it("binds a ciphertext to one recipient", async () => {
    const alice = await identity();
    const bob = await identity();
    const state = await prekeyState(bob);

    const payload = await encryptWithPrekeyBundle({
      body: "hello",
      bundle: state.bundle(state.oneTime[0]),
      recipientPubkeyHash: bob.pubkeyHash,
      senderPublicKey: alice.pubkey,
      senderPrivateKey: alice.privateKey
    });

    await expect(
      decryptWithPrekeys({
        payload,
        recipientPubkeyHash: "0".repeat(64),
        resolvePrekey: state.resolve
      })
    ).rejects.toThrow(/signature/i);
  });

  it("mints distinct prekeys every time", async () => {
    const keys = await createOneTimePrekeys(8);
    expect(new Set(keys.map((key) => key.id)).size).toBe(8);
    expect(new Set(keys.map((key) => key.publicKey)).size).toBe(8);
  });
});
