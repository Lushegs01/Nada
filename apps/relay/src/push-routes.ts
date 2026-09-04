import type { FastifyInstance } from "fastify";
import webpush from "web-push";

import { PushSubscriptionRequestSchema } from "@nada/types";

import type { RelayDb } from "./db";
import type { RelayEnv } from "./env";
import { verifyIdentityProof } from "./identity-proof";
import { createPushRepository } from "./push-repository";

export async function registerPushRoutes(
  app: FastifyInstance,
  env: RelayEnv,
  db: RelayDb | null
): Promise<void> {
  const repository = await createPushRepository(db);

  if (env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject) {
    webpush.setVapidDetails(
      env.vapidSubject,
      env.vapidPublicKey,
      env.vapidPrivateKey
    );
  }

  app.addHook("onClose", async () => {
    await repository.close();
  });

  app.post("/api/v1/push/subscribe", async (request, reply) => {
    const result = PushSubscriptionRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_push_subscription",
        message: "Invalid push subscription request."
      });
    }

    // Require an identity proof: without this, an attacker could subscribe
    // their own browser endpoint against any user's pubkeyHash and receive
    // every push notification that user gets (titles, sender hash, chatId).
    const verification = verifyIdentityProof(result.data.proof, {
      context: "push-subscribe",
      binding: result.data.pubkeyHash
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.pubkeyHash) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }

    await repository.upsertSubscription(
      result.data.pubkeyHash,
      result.data.subscription
    );
    return reply.send({ success: true });
  });

  app.decorate("sendPushNotification", async (
    pubkeyHash: string,
    payload: string
  ) => {
    if (!env.vapidPublicKey || !env.vapidPrivateKey || !env.vapidSubject) {
      return;
    }

    const subscriptions = await repository.getSubscriptions(pubkeyHash);
    // Send in parallel — one slow VAPID endpoint should not block the rest.
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err) {
          // 404/410 mean the browser dropped the subscription; the endpoint is
          // dead for good, so stop retrying it on every future notification.
          const statusCode = (err as { statusCode?: number } | null)?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await repository.deleteSubscription(sub.endpoint);
            return;
          }
          throw err;
        }
      })
    );
    for (const r of results) {
      if (r.status === "rejected") {
        app.log.error(r.reason, "Failed to send push notification");
      }
    }
  });
}
