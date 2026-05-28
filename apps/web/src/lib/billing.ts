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
import { useIdentityStore } from "@/stores/useIdentityStore";

export async function fetchSubscriptionStatus(
  pubkeyHash: string
): Promise<SubscriptionStatusResponse | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) {
    return null;
  }

  // The relay's subscription/status endpoint now requires an identity proof
  // and is POST-only — anyone with a pubkeyHash used to be able to mint a
  // capability token for that user via a plain GET.
  const proof = await useIdentityStore
    .getState()
    .signProof("subscription-status", pubkeyHash);
  if (!proof) {
    return null;
  }

  const response = await fetch(
    new URL("/api/v1/subscription/status", relayBaseUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pubkeyHash, proof })
    }
  );
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

  const proof = await useIdentityStore
    .getState()
    .signProof("billing-checkout", pubkeyHash);
  if (!proof) {
    return null;
  }

  const response = await fetch(
    new URL("/api/v1/subscription/checkout", relayBaseUrl),
    {
      body: JSON.stringify({
        cancelUrl,
        plan,
        pubkeyHash,
        proof,
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

  const proof = await useIdentityStore
    .getState()
    .signProof("referral-redeem", pubkeyHash);
  if (!proof) {
    return null;
  }

  const response = await fetch(new URL("/api/v1/referral/redeem", relayBaseUrl), {
    body: JSON.stringify({ pubkeyHash, referralCode, proof }),
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
