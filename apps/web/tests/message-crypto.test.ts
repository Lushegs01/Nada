import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatRecord, ContactRecord, GroupKeyRecord } from "@nada/db";

// Dexie needs a real IndexedDB, which this suite does not: the behaviour under
// test is key handling, so the contacts table is stood up in memory.
const contacts = new Map<string, ContactRecord>();
/** Keyed "groupId\u0000epoch", mirroring Dexie's [groupId+epoch] primary key. */
const groupKeys = new Map<string, GroupKeyRecord>();
const chats = new Map<string, Partial<ChatRecord>>();

vi.mock("@/lib/db", () => ({
  nadaDb: {
    contacts: {
      get: async (id: string) => contacts.get(id),
      put: async (record: ContactRecord) => {
        contacts.set(record.pubkeyHash, record);
      },
      update: async (id: string, patch: Partial<ContactRecord>) => {
        const existing = contacts.get(id);
        if (existing) contacts.set(id, { ...existing, ...patch });
      }
    },
    groupKeys: {
      get: async ([groupId, epoch]: [string, number]) =>
        groupKeys.get(`${groupId}\u0000${epoch}`),
      put: async (record: GroupKeyRecord) => {
        groupKeys.set(`${record.groupId}\u0000${record.epoch}`, record);
      },
      where: (field: string) => ({
        equals: (value: string) => ({
          toArray: async () =>
            [...groupKeys.values()].filter(
              (record) => (record as Record<string, unknown>)[field] === value
            )
        })
      })
    },
    chats: {
      update: async (id: string, patch: Partial<ChatRecord>) => {
        chats.set(id, { ...(chats.get(id) ?? {}), ...patch });
      }
    }
  }
}));

const {
  createAnonymousIdentity,
  createGroupSenderKey,
  createSeedPhrase,
  decryptGroupMessage,
  encryptGroupMessage,
  sealContentKey
} = await import("@nada/crypto");
const {
  decryptDirectBody,
  encryptDirectBody,
  groupKeyForEpoch,
  isKeyForIdentity,
  latestGroupEpoch,
  learnPeerPublicKey,
  openKeyForSelf,
  resolveRecipientKey,
  rotateGroupKey,
  sealKeyForMembers,
  storeGroupKey
} = await import("@/lib/message-crypto");
const { useIdentityStore } = await import("@/stores/useIdentityStore");

type Identity = Awaited<ReturnType<typeof createAnonymousIdentity>>;

function asRecord(identity: Identity) {
  return {
    pubkey: identity.pubkey,
    pubkeyHash: identity.pubkeyHash,
    localPrivateKey: identity.privateKey
  };
}

function addContact(identity: Identity, publicKey = identity.pubkey): void {
  contacts.set(identity.pubkeyHash, {
    id: identity.pubkeyHash,
    pubkeyHash: identity.pubkeyHash,
    publicKey,
    localDisplayName: "Peer",
    addedAt: Date.now(),
    trustStatus: "unverified"
  });
}

let alice: Identity;
let bob: Identity;

beforeEach(async () => {
  contacts.clear();
  groupKeys.clear();
  chats.clear();
  useIdentityStore.getState().setUnlocked(null);
  alice = await createAnonymousIdentity(createSeedPhrase());
  bob = await createAnonymousIdentity(createSeedPhrase());
});

describe("public key integrity", () => {
  it("only accepts a key that hashes to the identity claiming it", async () => {
    await expect(isKeyForIdentity(alice.pubkey, alice.pubkeyHash)).resolves.toBe(true);
    // The exact corruption the old inbound path wrote: the hash as the key.
    await expect(isKeyForIdentity(alice.pubkeyHash, alice.pubkeyHash)).resolves.toBe(false);
    await expect(isKeyForIdentity(bob.pubkey, alice.pubkeyHash)).resolves.toBe(false);
    await expect(isKeyForIdentity(undefined, alice.pubkeyHash)).resolves.toBe(false);
  });

  it("refuses to resolve or learn an unverifiable key", async () => {
    addContact(alice, alice.pubkeyHash);
    await expect(resolveRecipientKey(alice.pubkeyHash)).resolves.toBeNull();

    await expect(learnPeerPublicKey(alice.pubkeyHash, bob.pubkey)).resolves.toBe(false);
    expect(contacts.get(alice.pubkeyHash)?.publicKey).toBe(alice.pubkeyHash);

    await expect(learnPeerPublicKey(alice.pubkeyHash, alice.pubkey)).resolves.toBe(true);
    expect(contacts.get(alice.pubkeyHash)?.publicKey).toBe(alice.pubkey);
    await expect(resolveRecipientKey(alice.pubkeyHash)).resolves.toBe(alice.pubkey);
  });
});

describe("direct message bodies", () => {
  it("seals a body the recipient can open and a third party cannot", async () => {
    useIdentityStore.getState().setUnlocked({
      pubkey: alice.pubkey,
      pubkeyHash: alice.pubkeyHash,
      privateKey: alice.privateKey
    });
    addContact(bob);

    const sent = await encryptDirectBody({
      body: "the reading room, 8pm",
      recipientPubkeyHash: bob.pubkeyHash,
      identity: asRecord(alice)
    });
    expect(sent.encrypted).toBe(true);
    expect(sent.ciphertext).not.toContain("reading room");

    // Bob reads it. His own unlocked identity takes over from Alice's.
    useIdentityStore.getState().setUnlocked({
      pubkey: bob.pubkey,
      pubkeyHash: bob.pubkeyHash,
      privateKey: bob.privateKey
    });
    const opened = await decryptDirectBody({
      ciphertext: sent.ciphertext,
      identity: asRecord(bob)
    });
    // forwardSecret is false here: no relay is configured in this suite, so
    // no prekey bundle can be claimed and the sealed-box path is used.
    expect(opened).toEqual({
      body: "the reading room, 8pm",
      encrypted: true,
      forwardSecret: false,
      senderPublicKey: alice.pubkey
    });

    // A third identity holds a valid key of its own and still cannot read it.
    const eve = await createAnonymousIdentity(createSeedPhrase());
    useIdentityStore.getState().setUnlocked({
      pubkey: eve.pubkey,
      pubkeyHash: eve.pubkeyHash,
      privateKey: eve.privateKey
    });
    await expect(
      decryptDirectBody({ ciphertext: sent.ciphertext, identity: asRecord(eve) })
    ).resolves.toBeNull();
  });

  it("reports honestly when no key is available instead of implying secrecy", async () => {
    useIdentityStore.getState().setUnlocked({
      pubkey: alice.pubkey,
      pubkeyHash: alice.pubkeyHash,
      privateKey: alice.privateKey
    });
    // Bob is known only by a corrupted key, so nothing can be sealed to him.
    addContact(bob, bob.pubkeyHash);

    const sent = await encryptDirectBody({
      body: "hello",
      recipientPubkeyHash: bob.pubkeyHash,
      identity: asRecord(alice)
    });
    expect(sent.encrypted).toBe(false);
    expect(sent.forwardSecret).toBe(false);

    const opened = await decryptDirectBody({
      ciphertext: sent.ciphertext,
      identity: asRecord(bob)
    });
    expect(opened).toEqual({ body: "hello", encrypted: false });
  });

  it("still reads legacy bodies written before sealing existed", async () => {
    const legacy = Buffer.from("older history").toString("base64");
    await expect(
      decryptDirectBody({ ciphertext: legacy, identity: asRecord(bob) })
    ).resolves.toEqual({ body: "older history", encrypted: false });
  });
});

describe("shared content keys", () => {
  it("seals a group key to reachable members and names the rest", async () => {
    const carol = await createAnonymousIdentity(createSeedPhrase());
    addContact(bob);
    addContact(carol, carol.pubkeyHash);

    const senderKey = await createGroupSenderKey();
    const { envelopes, unreachable } = await sealKeyForMembers(senderKey, [
      bob.pubkeyHash,
      carol.pubkeyHash,
      "never-seen"
    ]);

    expect(envelopes.map((envelope) => envelope.recipient)).toEqual([bob.pubkeyHash]);
    expect(unreachable).toEqual([carol.pubkeyHash, "never-seen"]);
    // The group key itself must never appear on the wire.
    expect(JSON.stringify(envelopes)).not.toContain(senderKey);

    useIdentityStore.getState().setUnlocked({
      pubkey: bob.pubkey,
      pubkeyHash: bob.pubkeyHash,
      privateKey: bob.privateKey
    });
    const recovered = await openKeyForSelf({ envelopes, identity: asRecord(bob) });
    expect(recovered).toBe(senderKey);

    const ciphertext = await encryptGroupMessage("group business", recovered!);
    await expect(decryptGroupMessage(ciphertext, recovered!)).resolves.toBe(
      "group business"
    );

    // Carol was never sealed to, so she has no envelope to open.
    useIdentityStore.getState().setUnlocked({
      pubkey: carol.pubkey,
      pubkeyHash: carol.pubkeyHash,
      privateKey: carol.privateKey
    });
    await expect(
      openKeyForSelf({ envelopes, identity: asRecord(carol) })
    ).resolves.toBeNull();
  });
});

describe("legacy and unknown bodies", () => {
  it("renders a plaintext body from an older client rather than dropping it", async () => {
    // Call logs used to go out as raw JSON. Returning null for these silently
    // lost the message; it is shown, and reported as unencrypted.
    const raw = JSON.stringify({ callId: "abc", mode: "voice", status: "ended" });
    await expect(
      decryptDirectBody({ ciphertext: raw, identity: asRecord(bob) })
    ).resolves.toEqual({ body: raw, encrypted: false });
  });

  it("never downgrades a failed sealed envelope to a legacy read", async () => {
    useIdentityStore.getState().setUnlocked({
      pubkey: alice.pubkey,
      pubkeyHash: alice.pubkeyHash,
      privateKey: alice.privateKey
    });
    addContact(bob);
    const sealed = await encryptDirectBody({
      body: "secret",
      recipientPubkeyHash: bob.pubkeyHash,
      identity: asRecord(alice)
    });

    // Alice cannot open her own sealed message to Bob. It must fail closed,
    // not fall through to the permissive legacy branch.
    await expect(
      decryptDirectBody({ ciphertext: sealed.ciphertext, identity: asRecord(alice) })
    ).resolves.toBeNull();
  });
});

describe("group admission", () => {
  it("only treats a sealed key as evidence of deliberate inclusion", async () => {
    const stranger = await createAnonymousIdentity(createSeedPhrase());
    const senderKey = await createGroupSenderKey();

    // A stranger fanning a group envelope at someone produces no envelope
    // addressed to them, so there is no key to open and nothing to admit them
    // to. The relay holds no group membership, so this is the only check.
    const envelopes = await sealContentKey(senderKey, [
      { pubkeyHash: stranger.pubkeyHash, publicKey: stranger.pubkey }
    ]);
    useIdentityStore.getState().setUnlocked({
      pubkey: bob.pubkey,
      pubkeyHash: bob.pubkeyHash,
      privateKey: bob.privateKey
    });
    await expect(
      openKeyForSelf({ envelopes, identity: asRecord(bob) })
    ).resolves.toBeNull();
  });
});

describe("group key rotation", () => {
  const GROUP = "study-group";

  it("mints a new epoch and leaves history readable", async () => {
    await storeGroupKey({
      groupId: GROUP,
      epoch: 1,
      senderKey: await createGroupSenderKey(),
      createdByPubkeyHash: alice.pubkeyHash,
      createdAt: Date.now()
    });
    const original = await groupKeyForEpoch(GROUP, 1);

    const rotated = await rotateGroupKey(GROUP, alice.pubkeyHash);
    expect(rotated.epoch).toBe(2);
    expect(rotated.senderKey).not.toBe(original);

    // The old epoch survives, so messages sent under it still open.
    await expect(groupKeyForEpoch(GROUP, 1)).resolves.toBe(original);
    await expect(groupKeyForEpoch(GROUP, 2)).resolves.toBe(rotated.senderKey);
    await expect(latestGroupEpoch(GROUP)).resolves.toBe(2);
  });

  it("cuts off anyone the new key is not sealed to", async () => {
    const staying = bob;
    const removed = await createAnonymousIdentity(createSeedPhrase());
    addContact(staying);
    addContact(removed);

    await storeGroupKey({
      groupId: GROUP,
      epoch: 1,
      senderKey: await createGroupSenderKey(),
      createdByPubkeyHash: alice.pubkeyHash,
      createdAt: Date.now()
    });
    const { senderKey: newKey } = await rotateGroupKey(GROUP, alice.pubkeyHash);

    // The rotation is sealed to the members that remain — the removed member
    // simply is not addressed, so there is no envelope for them to open.
    const { envelopes } = await sealKeyForMembers(newKey, [staying.pubkeyHash]);

    useIdentityStore.getState().setUnlocked({
      pubkey: staying.pubkey,
      pubkeyHash: staying.pubkeyHash,
      privateKey: staying.privateKey
    });
    await expect(
      openKeyForSelf({ envelopes, identity: asRecord(staying) })
    ).resolves.toBe(newKey);

    useIdentityStore.getState().setUnlocked({
      pubkey: removed.pubkey,
      pubkeyHash: removed.pubkeyHash,
      privateKey: removed.privateKey
    });
    await expect(
      openKeyForSelf({ envelopes, identity: asRecord(removed) })
    ).resolves.toBeNull();

    // And a message under the new epoch is opaque to them even if they kept
    // the key they held before.
    const oldKey = await groupKeyForEpoch(GROUP, 1);
    const ciphertext = await encryptGroupMessage("after the reset", newKey);
    await expect(decryptGroupMessage(ciphertext, oldKey!)).rejects.toThrow();
  });

  it("keeps epochs monotonic across repeated rotations", async () => {
    await storeGroupKey({
      groupId: GROUP,
      epoch: 1,
      senderKey: await createGroupSenderKey(),
      createdByPubkeyHash: alice.pubkeyHash,
      createdAt: Date.now()
    });
    const first = await rotateGroupKey(GROUP, alice.pubkeyHash);
    const second = await rotateGroupKey(GROUP, alice.pubkeyHash);
    expect([first.epoch, second.epoch]).toEqual([2, 3]);
    expect(first.senderKey).not.toBe(second.senderKey);
  });

  it("scopes keys to their own group", async () => {
    await storeGroupKey({
      groupId: "group-a",
      epoch: 1,
      senderKey: await createGroupSenderKey(),
      createdByPubkeyHash: alice.pubkeyHash,
      createdAt: Date.now()
    });
    await expect(groupKeyForEpoch("group-b", 1)).resolves.toBeNull();
    await expect(latestGroupEpoch("group-b")).resolves.toBe(0);
  });
});
