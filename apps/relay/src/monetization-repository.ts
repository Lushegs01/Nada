import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";

import { POSTGRES_SCHEMA_SQL } from "@nada/db";
import {
  type BillingPlan,
  type PubkeyHash,
  type SubscriptionState
} from "@nada/types";

import type { RelayEnv } from "./env";

export interface SubscriptionSnapshot {
  currentPeriodEnd: number | null;
  plan: BillingPlan;
  pubkeyHash: PubkeyHash;
  status: SubscriptionState;
}

export interface SubscriptionWrite {
  currentPeriodEnd: number | null;
  plan: BillingPlan;
  pubkeyHash: PubkeyHash;
  status: SubscriptionState;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

export interface MonetizationRepository {
  close: () => Promise<void>;
  getSubscription: (pubkeyHash: PubkeyHash) => Promise<SubscriptionSnapshot>;
  redeemReferral: (
    pubkeyHash: PubkeyHash,
    referralCode: string
  ) => Promise<string>;
  storeCapabilityToken: (
    pubkeyHash: PubkeyHash,
    plan: BillingPlan,
    token: string,
    expiresAt: number
  ) => Promise<void>;
  upsertSubscription: (write: SubscriptionWrite) => Promise<void>;
}

export async function createMonetizationRepository(
  env: RelayEnv
): Promise<MonetizationRepository> {
  if (env.databaseUrl) {
    const client = new Client({ connectionString: env.databaseUrl });
    await client.connect();
    await client.query(POSTGRES_SCHEMA_SQL);
    return new PostgresMonetizationRepository(client);
  }

  return new MemoryMonetizationRepository();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function freeSnapshot(pubkeyHash: PubkeyHash): SubscriptionSnapshot {
  return {
    currentPeriodEnd: null,
    plan: "free",
    pubkeyHash,
    status: "none"
  };
}

class PostgresMonetizationRepository implements MonetizationRepository {
  constructor(private readonly client: Client) {}

  async close(): Promise<void> {
    await this.client.end();
  }

  async getSubscription(pubkeyHash: PubkeyHash): Promise<SubscriptionSnapshot> {
    const result = await this.client.query<{
      current_period_end: Date | null;
      plan: BillingPlan;
      status: SubscriptionState;
    }>(
      `select plan, status, current_period_end
       from subscriptions
       where pubkey_hash = $1
       order by updated_at desc
       limit 1`,
      [pubkeyHash]
    );
    const row = result.rows[0];
    if (!row) {
      return freeSnapshot(pubkeyHash);
    }

    return {
      currentPeriodEnd: row.current_period_end?.getTime() ?? null,
      plan: row.plan,
      pubkeyHash,
      status: row.status
    };
  }

  async redeemReferral(
    pubkeyHash: PubkeyHash,
    referralCode: string
  ): Promise<string> {
    const reward = "pro-retention-preview";
    await this.ensureUser(pubkeyHash, "free", "none", null);
    await this.client.query(
      `insert into referral_redemptions
       (id, pubkey_hash, referral_code, reward, created_at)
       values ($1, $2, $3, $4, now())`,
      [randomUUID(), pubkeyHash, referralCode, reward]
    );
    return reward;
  }

  async storeCapabilityToken(
    pubkeyHash: PubkeyHash,
    plan: BillingPlan,
    token: string,
    expiresAt: number
  ): Promise<void> {
    await this.ensureUser(pubkeyHash, plan, "active", null);
    await this.client.query(
      `insert into capability_tokens
       (id, pubkey_hash, plan, token_hash, expires_at, created_at)
       values ($1, $2, $3, $4, to_timestamp($5 / 1000.0), now())`,
      [randomUUID(), pubkeyHash, plan, hashToken(token), expiresAt]
    );
  }

  async upsertSubscription(write: SubscriptionWrite): Promise<void> {
    await this.ensureUser(
      write.pubkeyHash,
      write.plan,
      write.status,
      write.stripeCustomerId
    );
    await this.client.query(
      `insert into subscriptions
       (id, pubkey_hash, stripe_customer_id, stripe_subscription_id, plan,
        status, current_period_end, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), now(), now())
       on conflict (id) do update set
        plan = excluded.plan,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        updated_at = now()`,
      [
        randomUUID(),
        write.pubkeyHash,
        write.stripeCustomerId,
        write.stripeSubscriptionId,
        write.plan,
        write.status,
        write.currentPeriodEnd
      ]
    );
  }

  private async ensureUser(
    pubkeyHash: PubkeyHash,
    plan: BillingPlan,
    status: SubscriptionState,
    stripeCustomerId: string | null
  ): Promise<void> {
    await this.client.query(
      `insert into users
       (id, pubkey_hash, created_at, plan, subscription_status,
        stripe_customer_id, capability_pubkey_version)
       values ($1, $2, now(), $3, $4, $5, 1)
       on conflict (pubkey_hash) do update set
        plan = excluded.plan,
        subscription_status = excluded.subscription_status,
        stripe_customer_id = coalesce(excluded.stripe_customer_id, users.stripe_customer_id)`,
      [randomUUID(), pubkeyHash, plan, status, stripeCustomerId]
    );
  }
}

class MemoryMonetizationRepository implements MonetizationRepository {
  private readonly subscriptions = new Map<PubkeyHash, SubscriptionSnapshot>();

  async close(): Promise<void> {
    this.subscriptions.clear();
  }

  async getSubscription(pubkeyHash: PubkeyHash): Promise<SubscriptionSnapshot> {
    return this.subscriptions.get(pubkeyHash) ?? freeSnapshot(pubkeyHash);
  }

  async redeemReferral(
    _pubkeyHash: PubkeyHash,
    _referralCode: string
  ): Promise<string> {
    return "pro-retention-preview";
  }

  async storeCapabilityToken(): Promise<void> {}

  async upsertSubscription(write: SubscriptionWrite): Promise<void> {
    this.subscriptions.set(write.pubkeyHash, {
      currentPeriodEnd: write.currentPeriodEnd,
      plan: write.plan,
      pubkeyHash: write.pubkeyHash,
      status: write.status
    });
  }
}
