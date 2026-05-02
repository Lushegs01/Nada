import type { FastifyInstance } from "fastify";
import Stripe from "stripe";

import {
  CapabilityIssueRequestSchema,
  ReferralRedeemRequestSchema,
  SubscriptionCheckoutRequestSchema,
  SubscriptionStatusQuerySchema,
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
import type { RelayEnv } from "./env";
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
  env: RelayEnv
): Promise<void> {
  const repository = await createMonetizationRepository(env);
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
    const session = await stripe.checkout.sessions.create({
      cancel_url: result.data.cancelUrl,
      client_reference_id: result.data.pubkeyHash,
      customer_creation: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      mode: "subscription",
      subscription_data: { metadata },
      success_url: result.data.successUrl
    });

    const response: SubscriptionCheckoutResponse = {
      configured: true,
      checkoutUrl: session.url,
      mode: "stripe_checkout"
    };
    return reply.send(response);
  });

  app.get("/api/v1/subscription/status", async (request, reply) => {
    const result = SubscriptionStatusQuerySchema.safeParse(request.query);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_subscription_status_query",
        message: "Invalid subscription status query."
      });
    }

    const snapshot = await repository.getSubscription(result.data.pubkey_hash);
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
      authHeader !== `Bearer ${env.capabilityIssuerSecret}`
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
      const event = stripe.webhooks.constructEvent(
        request.body,
        signature,
        env.stripeWebhookSecret
      );
      await handleStripeEvent(event, repository);
      return reply.send({ received: true });
    });
  });
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
  repository: MonetizationRepository
): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const pubkeyHash = session.metadata?.[STRIPE_METADATA_KEYS.pubkeyHash];
    const plan = session.metadata?.[STRIPE_METADATA_KEYS.plan] as
      | BillingPlan
      | undefined;
    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (pubkeyHash && plan && customerId && subscriptionId) {
      await repository.upsertSubscription({
        currentPeriodEnd: null,
        plan,
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
    const plan = subscription.metadata[STRIPE_METADATA_KEYS.plan] as
      | BillingPlan
      | undefined;
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    if (pubkeyHash && plan) {
      const currentPeriodEnd = (subscription as any).current_period_end
        ? (subscription as any).current_period_end * 1000
        : null;
      await repository.upsertSubscription({
        currentPeriodEnd,
        plan,
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
