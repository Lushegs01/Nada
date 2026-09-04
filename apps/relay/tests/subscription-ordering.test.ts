import { describe, expect, it } from "vitest";

import { createMonetizationRepository } from "../src/monetization-repository";

const PUBKEY_HASH = "a".repeat(64);

function write(overrides: Partial<Parameters<
  Awaited<ReturnType<typeof createMonetizationRepository>>["upsertSubscription"]
>[0]> = {}) {
  return {
    currentPeriodEnd: null,
    eventAt: 1_000,
    plan: "pro" as const,
    pubkeyHash: PUBKEY_HASH,
    status: "active" as const,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    ...overrides
  };
}

describe("subscription event ordering", () => {
  it("ignores an event older than the state already applied", async () => {
    const repository = await createMonetizationRepository(null);

    await repository.upsertSubscription(write({ eventAt: 1_000 }));
    // The cancellation happens later in Stripe's clock.
    await repository.upsertSubscription(
      write({ eventAt: 2_000, status: "canceled", plan: "free" })
    );
    // ...but a retried "updated" from before it arrives afterwards. Applying it
    // would hand a cancelled customer their paid plan back.
    await repository.upsertSubscription(
      write({ eventAt: 1_500, status: "active", plan: "pro" })
    );

    const snapshot = await repository.getSubscription(PUBKEY_HASH);
    expect(snapshot.status).toBe("canceled");
    expect(snapshot.plan).toBe("free");
  });

  it("applies a newer event", async () => {
    const repository = await createMonetizationRepository(null);
    await repository.upsertSubscription(write({ eventAt: 1_000, status: "active" }));
    await repository.upsertSubscription(
      write({ eventAt: 3_000, status: "past_due" })
    );

    expect((await repository.getSubscription(PUBKEY_HASH)).status).toBe("past_due");
  });

  it("treats a redelivery of the same event as a no-op", async () => {
    const repository = await createMonetizationRepository(null);
    await repository.upsertSubscription(write({ eventAt: 5_000, status: "active" }));
    await repository.upsertSubscription(write({ eventAt: 5_000, status: "active" }));

    expect((await repository.getSubscription(PUBKEY_HASH)).status).toBe("active");
  });

  it("claims each Stripe event id exactly once", async () => {
    const repository = await createMonetizationRepository(null);
    await expect(repository.claimStripeEvent("evt_1", "x")).resolves.toBe(true);
    await expect(repository.claimStripeEvent("evt_1", "x")).resolves.toBe(false);
    await expect(repository.claimStripeEvent("evt_2", "x")).resolves.toBe(true);
  });
});
