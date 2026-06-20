import { randomUUID } from "node:crypto";
import { Client } from "pg";

import { POSTGRES_SCHEMA_SQL } from "@nada/db";

import type { RelayEnv } from "./env";

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

export async function createStatusRepository(
  env: RelayEnv
): Promise<StatusRepository> {
  if (env.databaseUrl) {
    const client = new Client({ connectionString: env.databaseUrl });
    await client.connect();
    await client.query(POSTGRES_SCHEMA_SQL);
    return new PostgresStatusRepository(client);
  }

  return new MemoryStatusRepository();
}

class PostgresStatusRepository implements StatusRepository {
  constructor(private readonly client: Client) {}

  async close(): Promise<void> {
    await this.client.end();
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
    await this.client.query(
      "delete from status_updates where expires_at_ms <= $1",
      [Date.now()]
    );
    const result = await this.client.query(
      `select id, sender_pubkey_hash, ciphertext, dev_plaintext, created_at_ms
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
      ...(row.dev_plaintext ? { devPlaintext: row.dev_plaintext } : {}),
      id: row.id,
      senderPubkeyHash: row.sender_pubkey_hash,
      timestamp: Number(row.created_at_ms)
    }));
  }

  async upsertStatus(status: RelayStatusUpdate): Promise<void> {
    await this.client.query(
      `insert into status_updates
       (id, sender_pubkey_hash, ciphertext, dev_plaintext, created_at_ms, expires_at_ms, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (id) do update set
         sender_pubkey_hash = excluded.sender_pubkey_hash,
         ciphertext = excluded.ciphertext,
         dev_plaintext = excluded.dev_plaintext,
         created_at_ms = excluded.created_at_ms,
         expires_at_ms = excluded.expires_at_ms,
         updated_at = now()`,
      [
        status.id || randomUUID(),
        status.senderPubkeyHash,
        status.ciphertext,
        status.devPlaintext ?? null,
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
