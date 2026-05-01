import {
  ReferralRedeemResponseSchema,
  SubscriptionCheckoutResponseSchema,
  SubscriptionStatusResponseSchema,
  type PaidBillingPlan,
  type ReferralRedeemResponse,
  type SubscriptionCheckoutResponse,
  type SubscriptionStatusResponse
} from "@nada/types";

import { getRelayHttpBaseUrl } from "@/lib/relay-url";

export async function fetchSubscriptionStatus(
  pubkeyHash: string
): Promise<SubscriptionStatusResponse | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) {
    return null;
  }

  const url = new URL("/api/v1/subscription/status", relayBaseUrl);
  url.searchParams.set("pubkey_hash", pubkeyHash);
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  const result = SubscriptionStatusResponseSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export async function startCheckout({
  cancelUrl,
  plan,
  pubkeyHash,
  referralCode,
  successUrl
}: {
  cancelUrl: string;
  plan: PaidBillingPlan;
  pubkeyHash: string;
  referralCode?: string;
  successUrl: string;
}): Promise<SubscriptionCheckoutResponse | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) {
    return null;
  }

  const response = await fetch(
    new URL("/api/v1/subscription/checkout", relayBaseUrl),
    {
      body: JSON.stringify({
        cancelUrl,
        plan,
        pubkeyHash,
        ...(referralCode ? { referralCode } : {}),
        successUrl
      }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    }
  );

  const payload: unknown = await response.json();
  const result = SubscriptionCheckoutResponseSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export async function redeemReferral({
  pubkeyHash,
  referralCode
}: {
  pubkeyHash: string;
  referralCode: string;
}): Promise<ReferralRedeemResponse | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) {
    return null;
  }

  const response = await fetch(new URL("/api/v1/referral/redeem", relayBaseUrl), {
    body: JSON.stringify({ pubkeyHash, referralCode }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  const result = ReferralRedeemResponseSchema.safeParse(payload);
  return result.success ? result.data : null;
}
