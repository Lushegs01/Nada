import { describe, expect, it } from "vitest";

import {
  CapabilityTokenPayloadSchema,
  ReferralRedeemRequestSchema,
  SubscriptionCheckoutRequestSchema
} from "../src";

describe("monetization schemas", () => {
  it("validates checkout requests without personal data", () => {
    const result = SubscriptionCheckoutRequestSchema.safeParse({
      pubkeyHash: "pubkey-hash-for-paid-plan",
      plan: "pro",
      successUrl: "https://nada.example/billing/success",
      cancelUrl: "https://nada.example/billing/cancel",
      referralCode: "NADA-LAUNCH",
      proof: {
        pubkey: "a".repeat(64),
        pubkeyHash: "pubkey-hash-for-paid-plan",
        signature: "sig",
        timestamp: 1234567890
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported referral codes and token payloads", () => {
    expect(
      ReferralRedeemRequestSchema.safeParse({
        pubkeyHash: "pubkey-hash-for-referral",
        referralCode: "no"
      }).success
    ).toBe(false);
    expect(
      CapabilityTokenPayloadSchema.safeParse({
        version: 1,
        pubkeyHash: "pubkey-hash-for-token",
        plan: "business",
        features: ["bot-api"],
        issuedAt: Date.now(),
        expiresAt: Date.now() + 1000
      }).success
    ).toBe(true);
  });
});
