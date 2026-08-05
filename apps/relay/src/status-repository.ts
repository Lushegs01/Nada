import { randomUUID } from "node:crypto";

import type { Queryable, RelayDb } from "./db";

export interface RelayStatusUpdate {
  ciphertext: string;
  devPlaintext?: string;
  id: string;
  senderPubkeyHash: string;
  timestamp: number;
}

export interface StatusRepository {
  close: () => Promise<void>;
  deleteStatus: (id: string, senderPubkeyHash: string) => Promise<void>;
  listStatuses: (
    senderPubkeyHashes: string[],
    since: number,
    limit: number
  ) => Promise<RelayStatusUpdate[]>;
  upsertStatus: (status: RelayStatusUpdate) => Promise<void>;
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

  constructor(private readonly client: Queryable) {}

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
    await this.client.query(
      "delete from status_updates where expires_at_ms <= $1",
      [now]
    );
  }

  async deleteStatus(id: string, senderPubkeyHash: string): Promise<void> {
    await this.client.query(
      `delete from status_updates
       where id = $1 and sender_pubkey_hash = $2`,
      [id, senderPubkeyHash]
    );
  }

  async listStatuses(
    senderPubkeyHashes: string[],
    since: number,
    limit: number
  ): Promise<RelayStatusUpdate[]> {
    await this.sweepExpired(Date.now());
    const result = await this.client.query(
      `select id, sender_pubkey_hash, ciphertext, created_at_ms
       from status_updates
       where sender_pubkey_hash = any($1::text[])
         and created_at_ms >= $2
         and expires_at_ms > $3
       order by created_at_ms desc
       limit $4`,
      [senderPubkeyHashes, since, Date.now(), limit]
    );

    return result.rows.map((row) => ({
      ciphertext: row.ciphertext,
      id: row.id,
      senderPubkeyHash: row.sender_pubkey_hash,
      timestamp: Number(row.created_at_ms)
    }));
  }

  async upsertStatus(status: RelayStatusUpdate): Promise<void> {
    await this.client.query(
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
        status.id || randomUUID(),
        status.senderPubkeyHash,
        status.ciphertext,
        status.timestamp,
        status.timestamp + STATUS_TTL_MS
      ]
    );
  }
}

class MemoryStatusRepository implements StatusRepository {
  private readonly statuses = new Map<string, RelayStatusUpdate>();

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
    limit: number
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
      .slice(0, limit);
  }

  async upsertStatus(status: RelayStatusUpdate): Promise<void> {
    this.statuses.set(status.id, status);
  }
}
