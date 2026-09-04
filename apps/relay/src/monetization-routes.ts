import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import Stripe from "stripe";

import {
  BillingPlanSchema,
  CapabilityIssueRequestSchema,
  ReferralRedeemRequestSchema,
  SubscriptionCheckoutRequestSchema,
  SubscriptionStatusRequestSchema,
  type BillingPlan,
  type PaidBillingPlan,
  type SubscriptionCheckoutResponse,
  type SubscriptionState,
  type SubscriptionStatusResponse
} from "@nada/types";

import {
  createCapabilityPayload,
  issueCapabilityToken
} from "./capability";
import type { RelayDb } from "./db";
import type { RelayEnv } from "./env";
import { verifyIdentityProof } from "./identity-proof";
import {
  createMonetizationRepository,
  type MonetizationRepository
} from "./monetization-repository";

const STRIPE_METADATA_KEYS = {
  plan: "plan",
  pubkeyHash: "pubkey_hash",
  referralCode: "referral_code"
} as const;

export async function registerMonetizationRoutes(
  app: FastifyInstance,
  env: RelayEnv,
  db: RelayDb | null
): Promise<void> {
  const repository = await createMonetizationRepository(db);
  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.post("/api/v1/subscription/checkout", async (request, reply) => {
    const result = SubscriptionCheckoutRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_checkout_request",
        message: "Invalid checkout request."
      });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "billing-checkout",
      binding: result.data.pubkeyHash
    });
    if (
      !verification.ok ||
      verification.pubkeyHash !== result.data.pubkeyHash
    ) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    if (!env.stripeSecretKey) {
      const response: SubscriptionCheckoutResponse = {
        configured: false,
        checkoutUrl: null,
        mode: "stripe_checkout",
        message: "Stripe is not configured for this relay."
      };
      return reply.code(503).send(response);
    }

    const priceId = priceIdForPlan(env, result.data.plan);
    if (!priceId) {
      const response: SubscriptionCheckoutResponse = {
        configured: false,
        checkoutUrl: null,
        mode: "stripe_checkout",
        message: "Stripe price is not configured for this plan."
      };
      return reply.code(503).send(response);
    }

    const stripe = new Stripe(env.stripeSecretKey);
    const metadata = {
      [STRIPE_METADATA_KEYS.plan]: result.data.plan,
      [STRIPE_METADATA_KEYS.pubkeyHash]: result.data.pubkeyHash,
      ...(result.data.referralCode
        ? { [STRIPE_METADATA_KEYS.referralCode]: result.data.referralCode }
        : {})
    };
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        cancel_url: result.data.cancelUrl,
        client_reference_id: result.data.pubkeyHash,
        customer_creation: "always",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata,
        mode: "subscription",
        subscription_data: { metadata },
        success_url: result.data.successUrl
      });
    } catch (err) {
      app.log.error({ err }, "Stripe checkout session creation failed");
      return reply.code(502).send({
        code: "stripe_checkout_failed",
        message: "Failed to create Stripe checkout session."
      });
    }

    const response: SubscriptionCheckoutResponse = {
      configured: true,
      checkoutUrl: session.url,
      mode: "stripe_checkout"
    };
    return reply.send(response);
  });

  // Subscription status mints capability tokens. It MUST be authenticated:
  // without a proof, anyone who knows or guesses a pubkeyHash gets a signed
  // capability token impersonating that user and unlocking their paid
  // features. Switched from GET (?pubkey_hash=…) to POST (proof in body).
  app.post("/api/v1/subscription/status", async (request, reply) => {
    const result = SubscriptionStatusRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_subscription_status_request",
        message: "Invalid subscription status request."
      });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "subscription-status",
      binding: result.data.pubkeyHash
    });
    if (
      !verification.ok ||
      verification.pubkeyHash !== result.data.pubkeyHash
    ) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    const snapshot = await repository.getSubscription(result.data.pubkeyHash);
    const capabilityToken = await maybeIssueCapabilityToken(
      env,
      repository,
      snapshot.pubkeyHash,
      snapshot.plan,
      snapshot.currentPeriodEnd
    );
    const response: SubscriptionStatusResponse = {
      capabilityToken,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      plan: snapshot.plan,
      pubkeyHash: snapshot.pubkeyHash,
      status: snapshot.status
    };
    return reply.send(response);
  });

  app.post("/api/v1/capability/issue", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (
      !env.capabilityIssuerSecret ||
      !matchesBearerSecret(authHeader, env.capabilityIssuerSecret)
    ) {
      return reply.code(401).send({
        code: "capability_issuer_unauthorized",
        message: "Capability issuer authorization failed."
      });
    }

    if (!env.capabilityTokenSecret) {
      return reply.code(503).send({
        code: "capability_signing_not_configured",
        message: "Capability token signing is not configured."
      });
    }

    const result = CapabilityIssueRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_capability_request",
        message: "Invalid capability request."
      });
    }

    const payload = createCapabilityPayload({
      plan: result.data.plan,
      pubkeyHash: result.data.pubkeyHash,
      ...(result.data.expiresAt ? { expiresAt: result.data.expiresAt } : {})
    });
    const token = issueCapabilityToken(payload, env.capabilityTokenSecret);
    await repository.storeCapabilityToken(
      payload.pubkeyHash,
      payload.plan,
      token,
      payload.expiresAt
    );
    return reply.send({ token, payload });
  });

  app.post("/api/v1/referral/redeem", async (request, reply) => {
    const result = ReferralRedeemRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_referral_request",
        message: "Invalid referral request."
      });
    }

    const verification = verifyIdentityProof(result.data.proof, {
      context: "referral-redeem",
      binding: result.data.pubkeyHash
    });
    if (
      !verification.ok ||
      verification.pubkeyHash !== result.data.pubkeyHash
    ) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    const reward = await repository.redeemReferral(
      result.data.pubkeyHash,
      result.data.referralCode
    );
    return reply.send({
      accepted: true,
      reward,
      message: "Referral redeemed without contact-book or identity upload."
    });
  });

  await app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_request, body, done) => {
        done(null, body);
      }
    );

    webhookScope.post("/api/v1/subscription/webhook", async (request, reply) => {
      if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
        return reply.code(503).send({
          code: "stripe_webhook_not_configured",
          message: "Stripe webhook verification is not configured."
        });
      }

      const signature = request.headers["stripe-signature"];
      if (typeof signature !== "string" || !Buffer.isBuffer(request.body)) {
        return reply.code(400).send({
          code: "invalid_stripe_webhook",
          message: "Invalid Stripe webhook."
        });
      }

      const stripe = new Stripe(env.stripeSecretKey);
      // constructEvent throws synchronously on a bad signature; without
      // this try/catch a single forged webhook becomes an unhandled
      // rejection that crashes the process and leaks the raw body to logs.
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          request.body,
          signature,
          env.stripeWebhookSecret
        );
      } catch {
        return reply.code(400).send({
          code: "invalid_stripe_signature",
          message: "Invalid Stripe webhook signature."
        });
      }
      // Claim the event before doing any work. Stripe retries on any non-2xx
      // and can redeliver on success, so without this a single subscription
      // update could be applied several times — and, because deliveries can
      // arrive out of order, a replayed "updated" could resurrect a
      // subscription that a later "deleted" had already ended.
      let claimed: boolean;
      try {
        claimed = await repository.claimStripeEvent(event.id, event.type);
      } catch (err) {
        app.log.error({ err, eventId: event.id }, "Stripe event claim failed");
        // Ask Stripe to retry rather than silently skipping a real event.
        return reply.code(500).send({
          code: "stripe_webhook_processing_failed",
          message: "Failed to process Stripe webhook."
        });
      }
      if (!claimed) {
        app.log.info({ eventId: event.id }, "Stripe webhook already processed");
        return reply.send({ received: true, duplicate: true });
      }

      try {
        await handleStripeEvent(event, repository, app);
      } catch (err) {
        app.log.error({ err, eventType: event.type }, "Stripe webhook handler failed");
        return reply.code(500).send({
          code: "stripe_webhook_processing_failed",
          message: "Failed to process Stripe webhook."
        });
      }
      return reply.send({ received: true });
    });
  });
}

/**
 * Constant-time bearer comparison. `===` on secrets short-circuits at the
 * first differing byte, which leaks the secret's prefix to anyone who can
 * measure response timing across many requests.
 */
function matchesBearerSecret(
  header: string | undefined,
  secret: string
): boolean {
  if (typeof header !== "string") return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const provided = Buffer.from(header, "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function priceIdForPlan(env: RelayEnv, plan: PaidBillingPlan): string | null {
  if (plan === "pro") {
    return env.stripePricePro ?? null;
  }

  if (plan === "business") {
    return env.stripePriceBusiness ?? null;
  }

  return env.stripePriceEnterprise ?? null;
}

async function maybeIssueCapabilityToken(
  env: RelayEnv,
  repository: MonetizationRepository,
  pubkeyHash: string,
  plan: BillingPlan,
  currentPeriodEnd: number | null
): Promise<string | null> {
  if (!env.capabilityTokenSecret || plan === "free") {
    return null;
  }

  const payload = createCapabilityPayload({
    plan,
    pubkeyHash,
    ...(currentPeriodEnd ? { expiresAt: currentPeriodEnd } : {})
  });
  const token = issueCapabilityToken(payload, env.capabilityTokenSecret);
  await repository.storeCapabilityToken(pubkeyHash, plan, token, payload.expiresAt);
  return token;
}

async function handleStripeEvent(
  event: Stripe.Event,
  repository: MonetizationRepository,
  app: FastifyInstance
): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const pubkeyHash = session.metadata?.[STRIPE_METADATA_KEYS.pubkeyHash];
    const planParse = BillingPlanSchema.safeParse(
      session.metadata?.[STRIPE_METADATA_KEYS.plan]
    );
    if (!planParse.success) {
      app.log.warn({ eventId: event.id }, "Stripe webhook missing/invalid plan metadata");
      return;
    }
    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (pubkeyHash && customerId && subscriptionId) {
      await repository.upsertSubscription({
        currentPeriodEnd: null,
        plan: planParse.data,
        pubkeyHash,
        status: "active",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId
      });
    }
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const pubkeyHash = subscription.metadata[STRIPE_METADATA_KEYS.pubkeyHash];
    const planParse = BillingPlanSchema.safeParse(
      subscription.metadata[STRIPE_METADATA_KEYS.plan]
    );
    if (!planParse.success) {
      app.log.warn({ eventId: event.id }, "Stripe webhook missing/invalid plan metadata");
      return;
    }
    // subscription.customer can be null for customer.subscription.deleted
    // events after the underlying customer record has been purged. The
    // previous code would crash here with "cannot read property 'id' of null".
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id ?? null;
    if (pubkeyHash && customerId) {
      const currentPeriodEnd = (subscription as any).current_period_end
        ? (subscription as any).current_period_end * 1000
        : null;
      await repository.upsertSubscription({
        currentPeriodEnd,
        plan: planParse.data,
        pubkeyHash,
        status: normalizeStripeStatus(subscription.status),
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id
      });
    }
  }
}

function normalizeStripeStatus(
  status: Stripe.Subscription.Status
): SubscriptionState {
  if (
    status === "trialing" ||
    status === "active" ||
    status === "past_due" ||
    status === "canceled" ||
    status === "incomplete" ||
    status === "unpaid"
  ) {
    return status;
  }

  return "none";
}
