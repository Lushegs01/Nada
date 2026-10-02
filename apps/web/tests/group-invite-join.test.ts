import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createAnonymousIdentity,
  createGroupSenderKey,
  createSeedPhrase,
  encryptGroupMessage
} from "@nada/crypto";
import type { GroupMessageEnvelope } from "@nada/types";

import { getChatPref, nadaDb } from "../src/lib/db";
import { encodeMessagePayload } from "../src/lib/media-message";
import { groupKeyForEpoch, sealKeyForMembers } from "../src/lib/message-crypto";
import {
  persistIncomingGroupMessages,
  upsertGroupFromInvite
} from "../src/utils/helpers";

// One member's device, Mia's, in a group Owen owns. Jo joins through the
// group's link; Xan once held a link and was never let back in.

type Identity = Awaited<ReturnType<typeof createAnonymousIdentity>>;
type Device = Parameters<typeof persistIncomingGroupMessages>[0];
type Invite = Parameters<typeof upsertGroupFromInvite>[1];

const GROUP = "8c7d4a8e-1f0b-4c9e-9a51-6c2b2f1d3e4a";

let owen: Identity;
let mia: Identity;
let jo: Identity;
let xan: Identity;
let firstKey: string;
let miasDevice: Device;

function deviceOf(identity: Identity): Device {
  return {
    pubkey: identity.pubkey,
    pubkeyHash: identity.pubkeyHash,
    localPrivateKey: identity.privateKey
  } as Device;
}

function inviteWith(key: string, members: string[]): Invite {
  return {
    version: 1,
    kind: "group",
    groupId: GROUP,
    title: "Book club",
    ownerPubkeyHash: owen.pubkeyHash,
    memberPubkeyHashes: members,
    senderKeyPackage: key
  } as Invite;
}

/** A group message as `from` would send it: under `key`, labelled `epoch`. */
async function message(
  from: Identity,
  key: string,
  epoch: number,
  payload: { members?: string[]; text: string; type?: "system" | "text" },
  sealFor: Identity[] = []
): Promise<GroupMessageEnvelope> {
  const body = encodeMessagePayload({
    version: 1,
    type: payload.type ?? "text",
    text: payload.text,
    ...(payload.members ? { members: payload.members } : {})
  });
  const sealed = await sealKeyForMembers(
    key,
    sealFor.map((member) => member.pubkeyHash),
    Object.fromEntries(sealFor.map((member) => [member.pubkeyHash, member.pubkey]))
  );
  return {
    type: "group-message",
    id: crypto.randomUUID(),
    groupId: GROUP,
    recipients: [mia.pubkeyHash],
    sender: from.pubkeyHash,
    timestamp: Date.now(),
    ciphertext: JSON.stringify(await encryptGroupMessage(body, key)),
    messageKind: payload.type ?? "text",
    senderPublicKey: from.pubkey,
    keyEpoch: epoch,
    ...(sealed.envelopes.length > 0 ? { keyEnvelopes: sealed.envelopes } : {})
  };
}

async function shown(envelope: GroupMessageEnvelope): Promise<boolean> {
  return Boolean(await nadaDb.messages.get(envelope.id));
}

async function group() {
  const chat = await nadaDb.chats.get(GROUP);
  if (!chat) throw new Error("Mia is not in the group");
  return chat;
}

beforeEach(async () => {
  await Promise.all(nadaDb.tables.map((table) => table.clear()));
  [owen, mia, jo, xan] = (await Promise.all(
    Array.from({ length: 4 }, () => createAnonymousIdentity(createSeedPhrase()))
  )) as [Identity, Identity, Identity, Identity];
  firstKey = await createGroupSenderKey();
  miasDevice = deviceOf(mia);
  await upsertGroupFromInvite(miasDevice, inviteWith(firstKey, [owen.pubkeyHash]));
});

describe("joining through an invite link", () => {
  it("lets a joiner reach members who never saw the link", async () => {
    const joined = await message(jo, firstKey, 1, {
      text: "joined the group",
      type: "system"
    });
    await persistIncomingGroupMessages(miasDevice, [joined]);

    expect(await shown(joined)).toBe(true);
    // Mia's device now sends the group to Jo, and can seal its key to her.
    expect((await group()).memberPubkeyHashes).toContain(jo.pubkeyHash);
    expect((await getChatPref(GROUP)).memberKeys?.[jo.pubkeyHash]).toBe(jo.pubkey);
  });

  it("never lets anyone but the owner move the group to a key of their own", async () => {
    // Xan knows the group's id, seals a fresh key to Mia and writes under it.
    const evilKey = await createGroupSenderKey();
    const takeover = await message(xan, evilKey, 2, { text: "read me" }, [mia]);
    await persistIncomingGroupMessages(miasDevice, [takeover]);

    expect(await shown(takeover)).toBe(false);
    expect(await group()).toMatchObject({ groupKeyEpoch: 1, groupSenderKey: firstKey });
    expect(await groupKeyForEpoch(GROUP, 2)).toBeNull();
    expect((await group()).memberPubkeyHashes).not.toContain(xan.pubkeyHash);
  });

  it("opens a group it is already in without changing it", async () => {
    const newKey = await createGroupSenderKey();
    await persistIncomingGroupMessages(miasDevice, [
      await message(owen, newKey, 2, { text: "reset" }, [mia])
    ]);

    // An old link reopened — or a crafted one naming someone else as owner —
    // leaves the group on its current key, owner and members.
    for (const invite of [
      inviteWith(firstKey, [owen.pubkeyHash]),
      {
        ...inviteWith(await createGroupSenderKey(), [xan.pubkeyHash]),
        ownerPubkeyHash: xan.pubkeyHash
      }
    ]) {
      const { joined } = await upsertGroupFromInvite(miasDevice, invite);
      expect(joined).toBe(false);
      expect(await group()).toMatchObject({
        groupKeyEpoch: 2,
        groupSenderKey: newKey,
        ownerPubkeyHash: owen.pubkeyHash
      });
      expect((await group()).memberPubkeyHashes).not.toContain(xan.pubkeyHash);
    }
  });
});

describe("the owner resetting the key", () => {
  it("drops whoever the owner leaves out, and what they write afterwards", async () => {
    await persistIncomingGroupMessages(miasDevice, [
      await message(jo, firstKey, 1, { text: "joined the group", type: "system" })
    ]);
    expect((await group()).memberPubkeyHashes).toContain(jo.pubkeyHash);

    const newKey = await createGroupSenderKey();
    const reset = await message(
      owen,
      newKey,
      2,
      {
        members: [owen.pubkeyHash, mia.pubkeyHash],
        text: "reset the group key",
        type: "system"
      },
      [mia]
    );
    await persistIncomingGroupMessages(miasDevice, [reset]);

    expect(await shown(reset)).toBe(true);
    const afterReset = await group();
    expect(afterReset).toMatchObject({ groupKeyEpoch: 2, groupSenderKey: newKey });
    expect([...afterReset.memberPubkeyHashes].sort()).toEqual(
      [owen.pubkeyHash, mia.pubkeyHash].sort()
    );
    // History stays readable under the key it was written with.
    expect(await groupKeyForEpoch(GROUP, 1)).toBe(firstKey);

    // Jo still holds the old key. What she writes with it no longer counts.
    const late = await message(jo, firstKey, 1, { text: "still here?" });
    await persistIncomingGroupMessages(miasDevice, [late]);
    expect(await shown(late)).toBe(false);
    expect((await group()).memberPubkeyHashes).not.toContain(jo.pubkeyHash);
  });

  it("ignores a member list from anyone but the owner", async () => {
    const coup = await message(jo, firstKey, 1, {
      members: [jo.pubkeyHash],
      text: "reset the group key",
      type: "system"
    });
    await persistIncomingGroupMessages(miasDevice, [coup]);
    expect((await group()).memberPubkeyHashes).toContain(owen.pubkeyHash);
  });
});
