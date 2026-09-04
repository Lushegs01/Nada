"use client";

import {
  createGroupSenderKey,
  decryptDirectMessage,
  decryptWithPrekeys,
  encryptDirectMessage,
  encryptWithPrekeyBundle,
  hashPublicKey,
  isPrekeyMessage,
  isSealedDirectMessage,
  openSealedContentKey,
  sealContentKey,
  __UNSAFE_mockDecryptMessage,
  __UNSAFE_mockEncryptMessage,
  type SealedKeyEnvelope
} from "@nada/crypto";
import type { ContactRecord, IdentityRecord } from "@nada/db";

import { nadaDb } from "@/lib/db";
import {
  claimPrekeyBundle,
  consumePrekeys,
  resolvePrekeyPrivate
} from "@/lib/prekey-store";
import { useIdentityStore } from "@/stores/useIdentityStore";

/**
 * The single place NADA decides how a message body is protected on the wire.
 *
 * Every direct message used to go out through `mockEncryptMessage`, which
 * base64-encodes and nothing more, so the relay operator could read every
 * conversation the product described as private. Encryption now happens here,
 * once, so no send path can quietly skip it — and when a key genuinely is not
 * available the caller is told, rather than being handed a payload that only
 * looks encrypted.
 */

export interface EncryptedBody {
  ciphertext: string;
  /** False when no identity key was available and the body is only encoded. */
  encrypted: boolean;
  /**
   * True when the message was encrypted under a prekey, so it becomes
   * unreadable once that key is consumed. False means it is sealed to the
   * recipient's long-term identity key and stays decryptable for as long as
   * that key exists.
   */
  forwardSecret: boolean;
}

export interface DecryptedBody {
  body: string;
  /** True when the body arrived sealed and its signature verified. */
  encrypted: boolean;
  /** True when it arrived under a prekey rather than the identity key. */
  forwardSecret?: boolean;
  /** Sender key recovered from inside the sealed payload, when present. */
  senderPublicKey?: string;
}

/**
 * A public key is only usable once it hashes to the identity it claims to
 * belong to. Contacts can be written from several sources (invite link, an
 * inbound envelope, a Whispers profile), and one bad key silently reroutes a
 * whole conversation, so the check happens on the way in and again on the way
 * out rather than being assumed anywhere.
 */
export async function isKeyForIdentity(
  publicKey: string | undefined,
  pubkeyHash: string
): Promise<boolean> {
  if (!publicKey) return false;
  try {
    return (await hashPublicKey(publicKey)) === pubkeyHash;
  } catch {
    return false;
  }
}

/** The verified identity key for a peer, or null when we do not have one. */
export async function resolveRecipientKey(
  pubkeyHash: string
): Promise<string | null> {
  const contact = await nadaDb.contacts.get(pubkeyHash);
  if (!contact?.publicKey) return null;
  return (await isKeyForIdentity(contact.publicKey, pubkeyHash))
    ? contact.publicKey
    : null;
}

/**
 * Records a peer's identity key, but only if it actually belongs to them.
 *
 * `persistIncomingMessages` used to write `publicKey: envelope.sender` — the
 * *hash* — over whatever real key an invite link had supplied, destroying the
 * one piece of material needed to encrypt a reply. Verifying before writing
 * makes that class of corruption impossible.
 */
export async function learnPeerPublicKey(
  pubkeyHash: string,
  publicKey: string | undefined
): Promise<boolean> {
  if (!(await isKeyForIdentity(publicKey, pubkeyHash))) return false;
  const existing = await nadaDb.contacts.get(pubkeyHash);
  if (!existing || existing.publicKey === publicKey) {
    return Boolean(existing);
  }
  await nadaDb.contacts.update(pubkeyHash, { publicKey: publicKey! });
  return true;
}

interface SenderIdentity {
  pubkey: string;
  pubkeyHash: string;
  privateKey: string;
}

/**
 * The unlocked identity able to sign and open sealed payloads. Prefers the
 * in-memory store (the authoritative unlocked state) and falls back to the
 * locally cached key on the identity record.
 */
export function resolveSenderIdentity(
  identity?: Pick<IdentityRecord, "pubkey" | "pubkeyHash" | "localPrivateKey">
): SenderIdentity | null {
  const unlocked = useIdentityStore.getState().unlocked;
  if (unlocked) {
    return {
      pubkey: unlocked.pubkey,
      pubkeyHash: unlocked.pubkeyHash,
      privateKey: unlocked.privateKey
    };
  }
  if (identity?.localPrivateKey) {
    return {
      pubkey: identity.pubkey,
      pubkeyHash: identity.pubkeyHash,
      privateKey: identity.localPrivateKey
    };
  }
  return null;
}

/**
 * Encrypts a direct-message body for one recipient.
 *
 * Falls back to the legacy encoding only when there is no verified key for the
 * recipient and no unlocked identity to sign with — an unavoidable gap for a
 * contact NADA has never exchanged keys with. The `encrypted: false` in the
 * result is what lets the UI say so instead of implying protection that is
 * not there.
 */
export async function encryptDirectBody(args: {
  body: string;
  recipientPubkeyHash: string;
  identity?: Pick<IdentityRecord, "pubkey" | "pubkeyHash" | "localPrivateKey">;
  timestamp?: number;
}): Promise<EncryptedBody> {
  const sender = resolveSenderIdentity(args.identity);
  const recipientPublicKey = await resolveRecipientKey(args.recipientPubkeyHash);

  if (sender && recipientPublicKey) {
    // Prefer a prekey: it is the only path that survives the recipient's
    // identity key being compromised later. Falls through to the sealed box
    // when the recipient has published none, is on an older client, or the
    // relay is unreachable — degraded, but never a failed send.
    try {
      const bundle = await claimPrekeyBundle(
        args.recipientPubkeyHash,
        sender.pubkeyHash
      );
      if (bundle) {
        return {
          ciphertext: await encryptWithPrekeyBundle({
            body: args.body,
            bundle,
            recipientPubkeyHash: args.recipientPubkeyHash,
            senderPublicKey: sender.pubkey,
            senderPrivateKey: sender.privateKey,
            ...(args.timestamp ? { timestamp: args.timestamp } : {})
          }),
          encrypted: true,
          forwardSecret: true
        };
      }
    } catch {
      // A bundle that fails its signature check is a relay trying to insert
      // its own key. Fall back to the identity key, which that relay cannot
      // substitute, rather than trusting the bundle.
    }

    return {
      ciphertext: await encryptDirectMessage({
        body: args.body,
        recipientPubkeyHash: args.recipientPubkeyHash,
        recipientPublicKey,
        senderPublicKey: sender.pubkey,
        senderPrivateKey: sender.privateKey,
        ...(args.timestamp ? { timestamp: args.timestamp } : {})
      }),
      encrypted: true,
      forwardSecret: false
    };
  }

  return {
    ciphertext: await __UNSAFE_mockEncryptMessage(args.body),
    encrypted: false,
    forwardSecret: false
  };
}

/**
 * Opens an inbound direct-message body.
 *
 * Accepts every wire format on purpose: a user's existing history and any peer
 * still on an older client produce legacy payloads, and refusing those would
 * blank out conversations rather than protect them.
 *
 * The one payload never accepted is one that *claims* to be sealed and fails
 * verification. That is never downgraded to a legacy read — a forged message
 * shown as authentic is worse than one that fails to render.
 */
export async function decryptDirectBody(args: {
  ciphertext: string;
  identity: Pick<IdentityRecord, "pubkey" | "pubkeyHash" | "localPrivateKey">;
}): Promise<DecryptedBody | null> {
  if (isPrekeyMessage(args.ciphertext)) {
    const recipient = resolveSenderIdentity(args.identity);
    if (!recipient) return null;
    try {
      const opened = await decryptWithPrekeys({
        payload: args.ciphertext,
        recipientPubkeyHash: recipient.pubkeyHash,
        resolvePrekey: resolvePrekeyPrivate
      });
      // Deleting the one-time prekey now is what makes this message
      // unrecoverable from here on, including by us. It happens after a
      // successful open so a failed decrypt cannot burn a key.
      await consumePrekeys(opened.usedOneTimePrekeyId);
      return {
        body: opened.body,
        encrypted: true,
        forwardSecret: true,
        senderPublicKey: opened.senderPublicKey
      };
    } catch {
      return null;
    }
  }

  if (isSealedDirectMessage(args.ciphertext)) {
    const recipient = resolveSenderIdentity(args.identity);
    if (!recipient) return null;
    try {
      const opened = await decryptDirectMessage({
        payload: args.ciphertext,
        recipientPubkeyHash: recipient.pubkeyHash,
        recipientPublicKey: recipient.pubkey,
        recipientPrivateKey: recipient.privateKey
      });
      return {
        body: opened.body,
        encrypted: true,
        forwardSecret: false,
        senderPublicKey: opened.senderPublicKey
      };
    } catch {
      return null;
    }
  }

  try {
    return {
      body: await __UNSAFE_mockDecryptMessage(args.ciphertext),
      encrypted: false
    };
  } catch {
    // Not sealed and not base64 — an older client that put the body on the
    // wire as-is. Returning null here dropped those messages on the floor
    // rather than showing them, which is a worse outcome than rendering a
    // payload the relay could already read. It is still reported as
    // unencrypted, so nothing claims protection it does not have.
    return { body: args.ciphertext, encrypted: false };
  }
}

/**
 * Seals a shared content key (a group sender key, a status key) to every
 * member NADA holds a verified identity key for.
 *
 * Returns the members it could not seal to so callers can decide what to do
 * about them, rather than silently shipping a plaintext key for everyone as
 * the old group envelopes did.
 */
export async function sealKeyForMembers(
  contentKey: string,
  memberPubkeyHashes: string[]
): Promise<{ envelopes: SealedKeyEnvelope[]; unreachable: string[] }> {
  const recipients: { pubkeyHash: string; publicKey: string }[] = [];
  const unreachable: string[] = [];

  for (const pubkeyHash of memberPubkeyHashes) {
    const publicKey = await resolveRecipientKey(pubkeyHash);
    if (publicKey) {
      recipients.push({ pubkeyHash, publicKey });
    } else {
      unreachable.push(pubkeyHash);
    }
  }

  return { envelopes: await sealContentKey(contentKey, recipients), unreachable };
}

/** Opens this identity's copy of a shared content key. */
export async function openKeyForSelf(args: {
  envelopes: SealedKeyEnvelope[] | undefined;
  identity: Pick<IdentityRecord, "pubkey" | "pubkeyHash" | "localPrivateKey">;
}): Promise<string | null> {
  if (!args.envelopes || args.envelopes.length === 0) return null;
  const self = resolveSenderIdentity(args.identity);
  if (!self) return null;
  return openSealedContentKey({
    envelopes: args.envelopes,
    recipientPubkeyHash: self.pubkeyHash,
    recipientPublicKey: self.pubkey,
    recipientPrivateKey: self.privateKey
  });
}

/** Contacts that still have no usable identity key, for UI that explains why. */
export async function contactsMissingKeys(
  contacts: ContactRecord[]
): Promise<string[]> {
  const missing: string[] = [];
  for (const contact of contacts) {
    if (!(await isKeyForIdentity(contact.publicKey, contact.pubkeyHash))) {
      missing.push(contact.pubkeyHash);
    }
  }
  return missing;
}

// ── Group key epochs ────────────────────────────────────────────────────────

/**
 * Records a group key at a given epoch.
 *
 * Keys accumulate rather than replace: a member who was present for epoch 2
 * must still be able to read epoch-2 history after the group rotates to
 * epoch 3. Only the *current* epoch is used for new messages.
 */
export async function storeGroupKey(args: {
  groupId: string;
  epoch: number;
  senderKey: string;
  createdByPubkeyHash: string;
  createdAt: number;
}): Promise<void> {
  await nadaDb.groupKeys.put({
    groupId: args.groupId,
    epoch: args.epoch,
    senderKey: args.senderKey,
    createdByPubkeyHash: args.createdByPubkeyHash,
    createdAt: args.createdAt
  });
}

/** The key for one epoch, or null when this identity was never given it. */
export async function groupKeyForEpoch(
  groupId: string,
  epoch: number
): Promise<string | null> {
  const record = await nadaDb.groupKeys.get([groupId, epoch]);
  return record?.senderKey ?? null;
}

/** The highest epoch this identity holds a key for. */
export async function latestGroupEpoch(groupId: string): Promise<number> {
  const records = await nadaDb.groupKeys.where("groupId").equals(groupId).toArray();
  return records.reduce((highest, record) => Math.max(highest, record.epoch), 0);
}

/**
 * Mints the next key epoch for a group.
 *
 * This is what makes group membership revocable. The new key is only ever
 * sealed to the members the group holds *now*, so anyone dropped from the
 * member list — or holding an invite link that carried an older key — can read
 * nothing sent from this point on. History under previous epochs is untouched
 * for everyone who legitimately received those keys.
 *
 * Returns the new epoch and key; the caller is responsible for putting them on
 * the wire, which happens naturally because every group send seals the current
 * key to every member.
 */
export async function rotateGroupKey(
  groupId: string,
  rotatedByPubkeyHash: string
): Promise<{ epoch: number; senderKey: string }> {
  const epoch = (await latestGroupEpoch(groupId)) + 1;
  const senderKey = await createGroupSenderKey();
  const now = Date.now();
  await storeGroupKey({
    groupId,
    epoch,
    senderKey,
    createdByPubkeyHash: rotatedByPubkeyHash,
    createdAt: now
  });
  await nadaDb.chats.update(groupId, {
    groupSenderKey: senderKey,
    groupKeyEpoch: epoch,
    updatedAt: now
  });
  return { epoch, senderKey };
}
