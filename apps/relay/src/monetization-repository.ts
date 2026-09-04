import { createHash, randomUUID } from "node:crypto";

import {
  type BillingPlan,
  type PubkeyHash,
  type SubscriptionState
} from "@nada/types";

import type { Queryable, RelayDb } from "./db";

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
  /**
   * Stripe's own `created` timestamp for the event carrying this state, in ms.
   * Writes are applied only when this is at least as recent as the last event
   * already applied to the row — Stripe does not order its deliveries, and an
   * out-of-order "updated" would otherwise undo a "deleted".
   */
  eventAt: number;
}

export interface MonetizationRepository {
  close: () => Promise<void>;
  getSubscription: (pubkeyHash: PubkeyHash) => Promise<SubscriptionSnapshot>;
  /**
   * Records a Stripe event id and reports whether this process is the one that
   * claimed it. Stripe retries every non-2xx delivery and can deliver the same
   * event more than once even on success, so the handler must be able to tell
   * a first delivery from a replay before it writes anything.
   */
  claimStripeEvent: (eventId: string, eventType: string) => Promise<boolean>;
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
  db: RelayDb | null
): Promise<MonetizationRepository> {
  if (db) {
    return new PostgresMonetizationRepository(db);
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
  constructor(private readonly client: Queryable) {}

  // The shared pool is owned and closed by the relay server.
  async close(): Promise<void> {}

  async claimStripeEvent(eventId: string, eventType: string): Promise<boolean> {
    // The primary key does the arbitration: exactly one caller inserts a row,
    // every replay sees `do nothing` and a zero row count.
    const result = await this.client.query(
      `insert into stripe_events (event_id, event_type, processed_at)
       values ($1, $2, now())
       on conflict (event_id) do nothing`,
      [eventId, eventType]
    );
    return (result.rowCount ?? 0) > 0;
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
    // One redemption per (identity, code): a retried request must not stack
    // rewards, and the unique index makes that true even under concurrency.
    await this.client.query(
      `insert into referral_redemptions
       (id, pubkey_hash, referral_code, reward, created_at)
       values ($1, $2, $3, $4, now())
       on conflict (pubkey_hash, referral_code) do nothing`,
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
    // Keyed on the Stripe subscription id, not on a freshly generated uuid.
    // The old `on conflict (id)` could never fire — `id` was random on every
    // call — so each webhook delivery inserted another row and the table grew
    // one row per retry, with `order by updated_at desc limit 1` papering over
    // the mess at read time.
    // `where excluded.last_event_at >= subscriptions.last_event_at` is what
    // makes delivery order irrelevant: a stale event finds a newer row and its
    // update is skipped rather than applied.
    await this.client.query(
      `insert into subscriptions
       (id, pubkey_hash, stripe_customer_id, stripe_subscription_id, plan,
        status, current_period_end, last_event_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), $8, now(), now())
       on conflict (stripe_subscription_id) do update set
        pubkey_hash = excluded.pubkey_hash,
        stripe_customer_id = excluded.stripe_customer_id,
        plan = excluded.plan,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        last_event_at = excluded.last_event_at,
        updated_at = now()
       where excluded.last_event_at >= subscriptions.last_event_at`,
      [
        randomUUID(),
        write.pubkeyHash,
        write.stripeCustomerId,
        write.stripeSubscriptionId,
        write.plan,
        write.status,
        write.currentPeriodEnd,
        write.eventAt
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
  private readonly subscriptions = new Map<
    PubkeyHash,
    SubscriptionSnapshot & { eventAt: number }
  >();
  private readonly processedStripeEvents = new Set<string>();

  async close(): Promise<void> {
    this.subscriptions.clear();
    this.processedStripeEvents.clear();
  }

  async claimStripeEvent(eventId: string): Promise<boolean> {
    if (this.processedStripeEvents.has(eventId)) return false;
    this.processedStripeEvents.add(eventId);
    return true;
  }

  async getSubscription(pubkeyHash: PubkeyHash): Promise<SubscriptionSnapshot> {
    return this.subscriptions.get(pubkeyHash) ?? freeSnapshot(pubkeyHash);
  }

  // The in-memory repository has nowhere to record a redemption, so the
  // arguments are deliberately unused; the signature still has to match.
  async redeemReferral(): Promise<string> {
    return "pro-retention-preview";
  }

  async storeCapabilityToken(): Promise<void> {}

  async upsertSubscription(write: SubscriptionWrite): Promise<void> {
    const existing = this.subscriptions.get(write.pubkeyHash);
    if (existing && existing.eventAt > write.eventAt) return;
    this.subscriptions.set(write.pubkeyHash, {
      currentPeriodEnd: write.currentPeriodEnd,
      eventAt: write.eventAt,
      plan: write.plan,
      pubkeyHash: write.pubkeyHash,
      status: write.status
    });
  }
}
