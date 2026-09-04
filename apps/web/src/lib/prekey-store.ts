"use client";

import {
  createOneTimePrekeys,
  createSignedPrekey,
  type PrekeyBundle
} from "@nada/crypto";

import { nadaDb, type PrekeyRecord } from "@/lib/db";
import { getRelayHttpBaseUrl } from "@/lib/relay-url";
import { useIdentityStore } from "@/stores/useIdentityStore";

/**
 * Manages this device's prekeys: minting them, publishing the public halves,
 * consuming them on receipt, and replenishing before they run out.
 *
 * The private halves never leave this device and are never derived from the
 * seed phrase. Deleting one is what makes a message permanently unreadable, so
 * consumption is the mechanism, not an optimisation.
 */

/** How many one-time prekeys to keep published. */
const ONE_TIME_PREKEY_BATCH = 50;
/** Replenish once the relay reports fewer than this many left. */
const REPLENISH_THRESHOLD = 10;
/**
 * How long a signed prekey stays in use. Forward secrecy for messages that
 * exhausted the one-time supply is bounded by this window, so it is short
 * enough to matter and long enough that offline peers can still reach us.
 */
export const SIGNED_PREKEY_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * How long a rotated signed prekey is retained before deletion. It must outlive
 * the relay's offline queue, or a message queued under the previous prekey
 * would arrive after the key needed to open it was already gone.
 */
export const SIGNED_PREKEY_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;

async function currentSignedPrekey(): Promise<PrekeyRecord | null> {
  const signed = await nadaDb.prekeys.where("kind").equals("signed").toArray();
  if (signed.length === 0) return null;
  return signed.reduce((newest, record) =>
    record.createdAt > newest.createdAt ? record : newest
  );
}

/** The private half for a prekey id, or null once it has been consumed. */
export async function resolvePrekeyPrivate(id: string): Promise<string | null> {
  const record = await nadaDb.prekeys.get(id);
  return record?.privateKey ?? null;
}

/**
 * Deletes the prekeys a received message consumed.
 *
 * A one-time prekey goes immediately — that single deletion is what takes the
 * message out of reach of anyone who later obtains the identity key. The
 * signed prekey is left in place: it is shared across many messages and is
 * retired on its own schedule.
 */
export async function consumePrekeys(oneTimePrekeyId?: string): Promise<void> {
  if (!oneTimePrekeyId) return;
  await nadaDb.prekeys.delete(oneTimePrekeyId);
}

async function publish(args: {
  pubkeyHash: string;
  identityPubkey: string;
  signed: PrekeyRecord;
  signedSignature: string;
  oneTimePrekeys: { id: string; prekey: string }[];
}): Promise<boolean> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) return false;
  const proof = await useIdentityStore
    .getState()
    .signProof("prekey-publish", args.signed.id);
  if (!proof) return false;

  const response = await fetch(new URL("/api/v1/prekeys/publish", relayBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pubkeyHash: args.pubkeyHash,
      identityPubkey: args.identityPubkey,
      signedPrekeyId: args.signed.id,
      signedPrekey: args.signed.publicKey,
      signedPrekeySignature: args.signedSignature,
      oneTimePrekeys: args.oneTimePrekeys,
      proof
    })
  });
  return response.ok;
}

/**
 * Brings this device's prekeys up to date: mints a signed prekey if there is
 * none or the current one has aged out, tops up one-time prekeys, and publishes
 * the public halves.
 *
 * Best-effort by design. A failure here costs forward secrecy for new
 * conversations until the next attempt — messages still send, sealed to the
 * identity key — so it must never block or fail a send.
 */
export async function ensurePrekeysPublished(): Promise<void> {
  const unlocked = useIdentityStore.getState().unlocked;
  if (!unlocked) return;
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) return;

  try {
    const existing = await currentSignedPrekey();
    const expired =
      !existing || Date.now() - existing.createdAt > SIGNED_PREKEY_LIFETIME_MS;

    let signedRecord = existing;
    let signedSignature: string | null = null;
    if (expired) {
      const minted = await createSignedPrekey(unlocked.privateKey);
      signedRecord = {
        id: minted.id,
        kind: "signed",
        publicKey: minted.publicKey,
        privateKey: minted.privateKey,
        createdAt: minted.createdAt
      };
      await nadaDb.prekeys.put(signedRecord);
      signedSignature = minted.signature;
    }
    if (!signedRecord) return;

    // Retire signed prekeys old enough that nothing queued can still need them.
    const stale = await nadaDb.prekeys.where("kind").equals("signed").toArray();
    await Promise.all(
      stale
        .filter(
          (record) =>
            record.id !== signedRecord.id &&
            Date.now() - record.createdAt > SIGNED_PREKEY_RETENTION_MS
        )
        .map((record) => nadaDb.prekeys.delete(record.id))
    );

    const remaining = await remoteOneTimeCount(relayBaseUrl, unlocked.pubkeyHash);
    const needsTopUp = remaining === null || remaining < REPLENISH_THRESHOLD;
    if (!expired && !needsTopUp) return;

    let oneTimePayload: { id: string; prekey: string }[] = [];
    if (needsTopUp) {
      const minted = await createOneTimePrekeys(ONE_TIME_PREKEY_BATCH);
      await nadaDb.prekeys.bulkPut(
        minted.map((key) => ({
          id: key.id,
          kind: "one-time" as const,
          publicKey: key.publicKey,
          privateKey: key.privateKey,
          createdAt: Date.now()
        }))
      );
      oneTimePayload = minted.map((key) => ({ id: key.id, prekey: key.publicKey }));
    }

    // A re-publish of an unchanged signed prekey still needs its signature, so
    // mint one over the same key rather than storing it.
    if (!signedSignature) {
      const { getSodium } = await import("@nada/crypto");
      const sodium = await getSodium();
      signedSignature = sodium.to_base64(
        sodium.crypto_sign_detached(
          sodium.from_base64(signedRecord.publicKey, sodium.base64_variants.ORIGINAL),
          sodium.from_base64(unlocked.privateKey, sodium.base64_variants.ORIGINAL)
        ),
        sodium.base64_variants.ORIGINAL
      );
    }

    if (!signedSignature) return;
    await publish({
      pubkeyHash: unlocked.pubkeyHash,
      identityPubkey: unlocked.pubkey,
      signed: signedRecord,
      signedSignature,
      oneTimePrekeys: oneTimePayload
    });
  } catch {
    // Forward secrecy is an upgrade, never a gate: a failure here must not
    // stop the user sending or receiving anything.
  }
}

async function remoteOneTimeCount(
  relayBaseUrl: string,
  pubkeyHash: string
): Promise<number | null> {
  const proof = await useIdentityStore
    .getState()
    .signProof("prekey-status", pubkeyHash);
  if (!proof) return null;
  try {
    const response = await fetch(new URL("/api/v1/prekeys/status", relayBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pubkeyHash, proof })
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { oneTimePrekeysRemaining?: number };
    return payload.oneTimePrekeysRemaining ?? null;
  } catch {
    return null;
  }
}

/**
 * Claims a recipient's prekey bundle, consuming one of their one-time prekeys.
 *
 * Null means no forward-secret path is available — the recipient has published
 * nothing, or the relay is unreachable — and the caller falls back to a sealed
 * box. The bundle's signature is verified by the crypto layer before use, so a
 * relay cannot substitute a key of its own here.
 */
export async function claimPrekeyBundle(
  recipientPubkeyHash: string,
  requesterPubkeyHash: string
): Promise<PrekeyBundle | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) return null;
  const proof = await useIdentityStore
    .getState()
    .signProof("prekey-claim", recipientPubkeyHash);
  if (!proof) return null;

  try {
    const response = await fetch(new URL("/api/v1/prekeys/claim", relayBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pubkeyHash: recipientPubkeyHash,
        requester: requesterPubkeyHash,
        proof
      })
    });
    if (!response.ok) return null;
    return (await response.json()) as PrekeyBundle;
  } catch {
    return null;
  }
}
