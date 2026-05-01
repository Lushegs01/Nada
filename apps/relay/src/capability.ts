import { createHmac } from "node:crypto";

import {
  CapabilityTokenPayloadSchema,
  type BillingPlan,
  type CapabilityTokenPayload,
  type PubkeyHash
} from "@nada/types";

const TOKEN_VERSION = 1;

const FEATURES_BY_PLAN: Record<BillingPlan, string[]> = {
  free: ["messaging", "basic-calls", "standard-themes"],
  pro: [
    "messaging",
    "basic-calls",
    "larger-files",
    "advanced-themes",
    "scheduled-messages",
    "encrypted-backup"
  ],
  business: [
    "messaging",
    "basic-calls",
    "larger-files",
    "anonymous-verified-profile",
    "product-catalog",
    "bot-api",
    "zk-analytics"
  ],
  enterprise: [
    "messaging",
    "basic-calls",
    "larger-files",
    "self-hosted-relay",
    "sla",
    "admin-controls",
    "compliance-docs"
  ]
};

function encodeBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createCapabilityPayload({
  expiresAt,
  plan,
  pubkeyHash
}: {
  expiresAt?: number;
  plan: BillingPlan;
  pubkeyHash: PubkeyHash;
}): CapabilityTokenPayload {
  const issuedAt = Date.now();
  return {
    version: TOKEN_VERSION,
    pubkeyHash,
    plan,
    features: FEATURES_BY_PLAN[plan],
    issuedAt,
    expiresAt: expiresAt ?? issuedAt + 30 * 24 * 60 * 60 * 1000
  };
}

export function issueCapabilityToken(
  payload: CapabilityTokenPayload,
  secret: string
): string {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyCapabilityToken(
  token: string,
  secret: string
): CapabilityTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (signature !== expectedSignature) {
    return null;
  }

  const result = CapabilityTokenPayloadSchema.safeParse(
    JSON.parse(decodeBase64Url(encodedPayload))
  );
  if (!result.success || result.data.expiresAt <= Date.now()) {
    return null;
  }

  return result.data;
}
