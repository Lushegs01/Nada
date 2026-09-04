import { randomUUID } from "node:crypto";

import type { Queryable, RelayDb } from "./db";

export interface StatusKeyEnvelope {
  recipient: string;
  sealedKey: string;
}

export interface RelayStatusUpdate {
  ciphertext: string;
  devPlaintext?: string;
  id: string;
  senderPubkeyHash: string;
  timestamp: number;
  /**
   * The viewer's own sealed copy of the status key, when the author addressed
   * one to them. Absent means "not in this status's audience" — the ciphertext
   * is then undecryptable, which is the point.
   */
  sealedKey?: string;
}

export interface StatusWrite extends RelayStatusUpdate {
  /** Audience: one sealed key per viewer the author chose. */
  keyEnvelopes?: StatusKeyEnvelope[];
}

export interface StatusRepository {
  close: () => Promise<void>;
  deleteStatus: (id: string, senderPubkeyHash: string) => Promise<void>;
  /**
   * Statuses visible to `viewerPubkeyHash`. The viewer is always the
   * *authenticated* caller: each row carries only the sealed key addressed to
   * them, so the relay never hands one identity another identity's key.
   */
  listStatuses: (
    senderPubkeyHashes: string[],
    since: number,
    limit: number,
    viewerPubkeyHash: string
  ) => Promise<RelayStatusUpdate[]>;
  upsertStatus: (status: StatusWrite) => Promise<void>;
}

const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
const STATUS_SWEEP_INTERVAL_MS = 60 * 1000;

export async function createStatusRepository(
  db: RelayDb | null
): Promise<StatusRepository> {
  if (db) {
    return new PostgresStatusRepository(db);
  }

  return new MemoryStatusRepository();
}

class PostgresStatusRepository implements StatusRepository {
  private lastSweepAt = 0;

  constructor(private readonly db: RelayDb) {}

  /** Statements outside an explicit transaction run straight on the pool. */
  private get client(): Queryable {
    return this.db;
  }

  // The pool is owned by the relay server, not by any one repository, so
  // closing a repository must not tear down connections its siblings share.
  async close(): Promise<void> {}

  /**
   * Deletes expired statuses at most once per sweep interval. This used to run
   * on every single list call, which turned a read-only status poll into a
   * table-wide DELETE — at institution scale that is continuous write
   * amplification and index bloat for rows the query already filters out by
   * `expires_at_ms`. Correctness does not depend on the sweep: every read is
   * still bounded by `expires_at_ms > now`, so an unswept row is never served.
   */
  private async sweepExpired(now: number): Promise<void> {
    if (now - this.lastSweepAt < STATUS_SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    // Sweep the audience keys with the statuses they belong to.
    await this.db.withTransaction(async (tx) => {
      await tx.query(
        `delete from status_key_envelopes
         where status_id in (
           select id from status_updates where expires_at_ms <= $1
         )`,
        [now]
      );
      await tx.query("delete from status_updates where expires_at_ms <= $1", [now]);
    });
  }

  async deleteStatus(id: string, senderPubkeyHash: string): Promise<void> {
    // The status and its audience keys must go together: leaving orphaned
    // key rows behind would keep a deleted status's key material alive.
    await this.db.withTransaction(async (tx) => {
      const result = await tx.query(
        `delete from status_updates
         where id = $1 and sender_pubkey_hash = $2`,
        [id, senderPubkeyHash]
      );
      if (!result.rowCount) return;
      await tx.query("delete from status_key_envelopes where status_id = $1", [id]);
    });
  }

  async listStatuses(
    senderPubkeyHashes: string[],
    since: number,
    limit: number,
    viewerPubkeyHash: string
  ): Promise<RelayStatusUpdate[]> {
    await this.sweepExpired(Date.now());
    // The join is a LEFT JOIN pinned to the viewer, so the query can never
    // return an envelope belonging to a different identity, and a status with
    // no audience row for this viewer comes back undecryptable rather than
    // hidden — the client can then show "not shared with you" honestly.
    const result = await this.client.query(
      `select s.id, s.sender_pubkey_hash, s.ciphertext, s.created_at_ms,
              e.sealed_key
       from status_updates s
       left join status_key_envelopes e
         on e.status_id = s.id and e.recipient_pubkey_hash = $5
       where s.sender_pubkey_hash = any($1::text[])
         and s.created_at_ms >= $2
         and s.expires_at_ms > $3
       order by s.created_at_ms desc
       limit $4`,
      [senderPubkeyHashes, since, Date.now(), limit, viewerPubkeyHash]
    );

    return result.rows.map((row) => ({
      ciphertext: row.ciphertext,
      id: row.id,
      senderPubkeyHash: row.sender_pubkey_hash,
      timestamp: Number(row.created_at_ms),
      ...(row.sealed_key ? { sealedKey: row.sealed_key as string } : {})
    }));
  }

  async upsertStatus(status: StatusWrite): Promise<void> {
    const id = status.id || randomUUID();
    const envelopes = status.keyEnvelopes ?? [];
    // One transaction so a status is never visible without the audience keys
    // that make it readable, and a re-publish never leaves a stale audience.
    await this.db.withTransaction(async (tx) => {
      await tx.query(
        // dev_plaintext is intentionally never persisted server-side: the
        // Postgres schema stays metadata-only (enforced by @nada/db tests).
        `insert into status_updates
         (id, sender_pubkey_hash, ciphertext, created_at_ms, expires_at_ms, updated_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (id) do update set
           sender_pubkey_hash = excluded.sender_pubkey_hash,
           ciphertext = excluded.ciphertext,
           created_at_ms = excluded.created_at_ms,
           expires_at_ms = excluded.expires_at_ms,
           updated_at = now()`,
        [
          id,
          status.senderPubkeyHash,
          status.ciphertext,
          status.timestamp,
          status.timestamp + STATUS_TTL_MS
        ]
      );
      await tx.query("delete from status_key_envelopes where status_id = $1", [id]);
      if (envelopes.length === 0) return;
      // One statement rather than one per recipient: a status shared with a
      // few hundred contacts must not be a few hundred round trips.
      await tx.query(
        `insert into status_key_envelopes
           (status_id, recipient_pubkey_hash, sealed_key, created_at_ms)
         select $1, recipient, sealed_key, $4
         from unnest($2::text[], $3::text[]) as t(recipient, sealed_key)
         on conflict (status_id, recipient_pubkey_hash) do update set
           sealed_key = excluded.sealed_key`,
        [
          id,
          envelopes.map((envelope) => envelope.recipient),
          envelopes.map((envelope) => envelope.sealedKey),
          status.timestamp
        ]
      );
    });
  }
}

class MemoryStatusRepository implements StatusRepository {
  private readonly statuses = new Map<string, StatusWrite>();

  async close(): Promise<void> {
    this.statuses.clear();
  }

  async deleteStatus(id: string, senderPubkeyHash: string): Promise<void> {
    const existing = this.statuses.get(id);
    if (existing?.senderPubkeyHash === senderPubkeyHash) {
      this.statuses.delete(id);
    }
  }

  async listStatuses(
    senderPubkeyHashes: string[],
    since: number,
    limit: number,
    viewerPubkeyHash: string
  ): Promise<RelayStatusUpdate[]> {
    const now = Date.now();
    const senderSet = new Set(senderPubkeyHashes);
    for (const [id, status] of this.statuses.entries()) {
      if (status.timestamp + STATUS_TTL_MS <= now) {
        this.statuses.delete(id);
      }
    }

    return Array.from(this.statuses.values())
      .filter(
        (status) =>
          senderSet.has(status.senderPubkeyHash) &&
          status.timestamp >= since &&
          status.timestamp + STATUS_TTL_MS > now
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map((status) => {
        const sealed = status.keyEnvelopes?.find(
          (envelope) => envelope.recipient === viewerPubkeyHash
        );
        return {
          ciphertext: status.ciphertext,
          id: status.id,
          senderPubkeyHash: status.senderPubkeyHash,
          timestamp: status.timestamp,
          ...(status.devPlaintext ? { devPlaintext: status.devPlaintext } : {}),
          ...(sealed ? { sealedKey: sealed.sealedKey } : {})
        };
      });
  }

  async upsertStatus(status: StatusWrite): Promise<void> {
    this.statuses.set(status.id, status);
  }
}
