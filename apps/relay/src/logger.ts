import type { FastifyServerOptions } from "fastify";

import type { RelayEnv } from "./env";

export function createLoggerOption(env: RelayEnv): FastifyServerOptions["logger"] {
  if (env.zeroLogMode) {
    return false;
  }

  return {
    level: "info",
    redact: {
      censor: "[redacted]",
      paths: [
        "req.headers.authorization",
        "req.headers.stripe-signature",
        "req.headers.cookie",
        "req.headers.origin",
        "req.ip",
        "req.body.sender",
        "req.body.recipient",
        "req.body.recipients",
        "req.body.groupId",
        "req.body.callId",
        "req.body.ciphertext",
        "req.body.contentHash",
        "req.body.devPlaintext",
        "req.body.sealedSenderEnvelope",
        "req.body.capabilityToken",
        "req.body.referralCode",
        "req.body.stripeCustomerId",
        "req.body.stripeSubscriptionId",
        "envelope.sender",
        "envelope.recipient",
        "envelope.recipients",
        "envelope.groupId",
        "envelope.callId",
        "envelope.ciphertext",
        "envelope.devPlaintext",
        "envelope.sealedSenderEnvelope",
        "envelope.capabilityToken",
        "sender",
        "recipient",
        "ciphertext",
        "contentHash",
        "devPlaintext",
        "referralCode",
        "sealedSenderEnvelope",
        "capabilityToken",
        "*.sender",
        "*.recipient",
        "*.ciphertext",
        "*.contentHash",
        "*.devPlaintext",
        "*.sealedSenderEnvelope",
        "*.capabilityToken"
      ]
    }
  };
}
