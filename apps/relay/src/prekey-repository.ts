import type { Queryable, RelayDb } from "./db";

/**
 * Storage for the public halves of identity prekeys.
 *
 * The relay is a distribution point, not a trusted party: every signed prekey
 * it serves carries a signature by its owner's identity key, and senders verify
 * that before encrypting. A relay that substituted a prekey of its own would be
 * caught by that check.
 */

export interface SignedPrekeyPublication {
  pubkeyHash: string;
  identityPubkey: string;
  signedPrekeyId: string;
  signedPrekey: string;
  signedPrekeySignature: string;
  oneTimePrekeys: { id: string; prekey: string }[];
}

export interface PrekeyBundleRow {
  identityKey: string;
  signedPrekeyId: string;
  signedPrekey: string;
  signedPrekeySignature: string;
  oneTimePrekeyId?: string;
  oneTimePrekey?: string;
}

export interface PrekeyRepository {
  close: () => Promise<void>;
  publish: (publication: SignedPrekeyPublication) => Promise<void>;
  /** Takes a bundle, consuming one one-time prekey if any remain. */
  claimBundle: (pubkeyHash: string) => Promise<PrekeyBundleRow | null>;
  /** How many one-time prekeys an identity has left, so it can replenish. */
  countOneTimePrekeys: (pubkeyHash: string) => Promise<number>;
}

/** Ceiling on stored one-time prekeys, so an identity cannot fill the table. */
export const MAX_ONE_TIME_PREKEYS = 100;

export async function createPrekeyRepository(
  db: RelayDb | null
): Promise<PrekeyRepository> {
  return db ? new PostgresPrekeyRepository(db) : new MemoryPrekeyRepository();
}

class PostgresPrekeyRepository implements PrekeyRepository {
  constructor(private readonly db: RelayDb) {}

  private get client(): Queryable {
    return this.db;
  }

  async close(): Promise<void> {}

  async publish(publication: SignedPrekeyPublication): Promise<void> {
    await this.db.withTransaction(async (tx) => {
      await tx.query(
        `insert into identity_prekeys
           (pubkey_hash, identity_pubkey, signed_prekey_id, signed_prekey,
            signed_prekey_signature, created_at_ms, updated_at)
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (pubkey_hash) do update set
           identity_pubkey = excluded.identity_pubkey,
           signed_prekey_id = excluded.signed_prekey_id,
           signed_prekey = excluded.signed_prekey,
           signed_prekey_signature = excluded.signed_prekey_signature,
           created_at_ms = excluded.created_at_ms,
           updated_at = now()`,
        [
          publication.pubkeyHash,
          publication.identityPubkey,
          publication.signedPrekeyId,
          publication.signedPrekey,
          publication.signedPrekeySignature,
          Date.now()
        ]
      );

      if (publication.oneTimePrekeys.length === 0) return;
      // One statement rather than one per key: a client replenishing a full
      // batch must not be a hundred round trips.
      await tx.query(
        `insert into one_time_prekeys (id, pubkey_hash, prekey, created_at_ms)
         select id, $1, prekey, $2
         from unnest($3::text[], $4::text[]) as t(id, prekey)
         on conflict (id) do nothing`,
        [
          publication.pubkeyHash,
          Date.now(),
          publication.oneTimePrekeys.map((key) => key.id),
          publication.oneTimePrekeys.map((key) => key.prekey)
        ]
      );

      // Keep only the newest batch, so a client that republishes repeatedly
      // cannot grow this table without bound.
      await tx.query(
        `delete from one_time_prekeys
         where pubkey_hash = $1
           and id not in (
             select id from one_time_prekeys
             where pubkey_hash = $1
             order by created_at_ms desc, id desc
             limit $2
           )`,
        [publication.pubkeyHash, MAX_ONE_TIME_PREKEYS]
      );
    });
  }

  async claimBundle(pubkeyHash: string): Promise<PrekeyBundleRow | null> {
    return this.db.withTransaction(async (tx) => {
      const identity = await tx.query(
        `select identity_pubkey, signed_prekey_id, signed_prekey,
                signed_prekey_signature
         from identity_prekeys where pubkey_hash = $1`,
        [pubkeyHash]
      );
      const row = identity.rows[0];
      if (!row) return null;

      // FOR UPDATE SKIP LOCKED so two senders claiming at the same moment take
      // different keys rather than blocking or, worse, both taking the same one:
      // a one-time prekey used twice is a one-time prekey that is not one-time.
      const claimed = await tx.query(
        `delete from one_time_prekeys
         where id = (
           select id from one_time_prekeys
           where pubkey_hash = $1
           order by created_at_ms asc
           for update skip locked
           limit 1
         )
         returning id, prekey`,
        [pubkeyHash]
      );
      const oneTime = claimed.rows[0];

      return {
        identityKey: row.identity_pubkey,
        signedPrekeyId: row.signed_prekey_id,
        signedPrekey: row.signed_prekey,
        signedPrekeySignature: row.signed_prekey_signature,
        ...(oneTime
          ? { oneTimePrekeyId: oneTime.id, oneTimePrekey: oneTime.prekey }
          : {})
      };
    });
  }

  async countOneTimePrekeys(pubkeyHash: string): Promise<number> {
    const result = await this.client.query<{ count: string }>(
      "select count(*) as count from one_time_prekeys where pubkey_hash = $1",
      [pubkeyHash]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

class MemoryPrekeyRepository implements PrekeyRepository {
  private readonly identities = new Map<string, PrekeyBundleRow>();
  private readonly oneTime = new Map<string, { id: string; prekey: string }[]>();

  async close(): Promise<void> {
    this.identities.clear();
    this.oneTime.clear();
  }

  async publish(publication: SignedPrekeyPublication): Promise<void> {
    this.identities.set(publication.pubkeyHash, {
      identityKey: publication.identityPubkey,
      signedPrekeyId: publication.signedPrekeyId,
      signedPrekey: publication.signedPrekey,
      signedPrekeySignature: publication.signedPrekeySignature
    });
    const existing = this.oneTime.get(publication.pubkeyHash) ?? [];
    const known = new Set(existing.map((key) => key.id));
    const merged = [
      ...existing,
      ...publication.oneTimePrekeys.filter((key) => !known.has(key.id))
    ];
    this.oneTime.set(
      publication.pubkeyHash,
      merged.slice(Math.max(0, merged.length - MAX_ONE_TIME_PREKEYS))
    );
  }

  async claimBundle(pubkeyHash: string): Promise<PrekeyBundleRow | null> {
    const identity = this.identities.get(pubkeyHash);
    if (!identity) return null;
    const available = this.oneTime.get(pubkeyHash) ?? [];
    const claimed = available.shift();
    this.oneTime.set(pubkeyHash, available);
    return {
      ...identity,
      ...(claimed
        ? { oneTimePrekeyId: claimed.id, oneTimePrekey: claimed.prekey }
        : {})
    };
  }

  async countOneTimePrekeys(pubkeyHash: string): Promise<number> {
    return (this.oneTime.get(pubkeyHash) ?? []).length;
  }
}
