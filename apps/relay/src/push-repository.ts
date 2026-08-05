import { randomUUID } from "node:crypto";

import type { PubkeyHash } from "@nada/types";

import type { Queryable, RelayDb } from "./db";

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushRepository {
  close: () => Promise<void>;
  upsertSubscription: (
    pubkeyHash: PubkeyHash,
    subscription: PushSubscriptionData
  ) => Promise<void>;
  getSubscriptions: (
    pubkeyHash: PubkeyHash
  ) => Promise<PushSubscriptionData[]>;
  deleteSubscription: (endpoint: string) => Promise<void>;
}

export async function createPushRepository(
  db: RelayDb | null
): Promise<PushRepository> {
  if (db) {
    return new PostgresPushRepository(db);
  }

  return new MemoryPushRepository();
}

class PostgresPushRepository implements PushRepository {
  constructor(private readonly client: Queryable) {}

  // The shared pool is owned and closed by the relay server.
  async close(): Promise<void> {}

  async upsertSubscription(
    pubkeyHash: PubkeyHash,
    subscription: PushSubscriptionData
  ): Promise<void> {
    await this.client.query(
      `insert into push_subscriptions
       (id, pubkey_hash, endpoint, auth, p256dh, created_at, updated_at)
       values ($1, $2, $3, $4, $5, now(), now())
       on conflict (endpoint) do update set
        pubkey_hash = excluded.pubkey_hash,
        auth = excluded.auth,
        p256dh = excluded.p256dh,
        updated_at = now()`,
      [
        randomUUID(),
        pubkeyHash,
        subscription.endpoint,
        subscription.keys.auth,
        subscription.keys.p256dh
      ]
    );
  }

  async getSubscriptions(
    pubkeyHash: PubkeyHash
  ): Promise<PushSubscriptionData[]> {
    const result = await this.client.query(
      `select endpoint, auth, p256dh
       from push_subscriptions
       where pubkey_hash = $1`,
      [pubkeyHash]
    );
    return result.rows.map((row) => ({
      endpoint: row.endpoint,
      keys: {
        auth: row.auth,
        p256dh: row.p256dh
      }
    }));
  }

  async deleteSubscription(endpoint: string): Promise<void> {
    await this.client.query(
      `delete from push_subscriptions where endpoint = $1`,
      [endpoint]
    );
  }
}

class MemoryPushRepository implements PushRepository {
  private readonly subscriptionsByPubkey = new Map<PubkeyHash, PushSubscriptionData[]>();

  async close(): Promise<void> {
    this.subscriptionsByPubkey.clear();
  }

  async upsertSubscription(
    pubkeyHash: PubkeyHash,
    subscription: PushSubscriptionData
  ): Promise<void> {
    // In memory, we just add it or replace if endpoint matches
    const existing = this.subscriptionsByPubkey.get(pubkeyHash) ?? [];
    const index = existing.findIndex((s) => s.endpoint === subscription.endpoint);
    if (index >= 0) {
      existing[index] = subscription;
    } else {
      existing.push(subscription);
    }
    this.subscriptionsByPubkey.set(pubkeyHash, existing);
  }

  async getSubscriptions(
    pubkeyHash: PubkeyHash
  ): Promise<PushSubscriptionData[]> {
    return this.subscriptionsByPubkey.get(pubkeyHash) ?? [];
  }

  async deleteSubscription(endpoint: string): Promise<void> {
    for (const [pubkeyHash, subs] of this.subscriptionsByPubkey.entries()) {
      const filtered = subs.filter((s) => s.endpoint !== endpoint);
      if (filtered.length !== subs.length) {
        this.subscriptionsByPubkey.set(pubkeyHash, filtered);
      }
    }
  }
}
