import type { FastifyInstance } from "fastify";
import webpush from "web-push";
import { z } from "zod";

import { PubkeyHashSchema } from "@nada/types";

import type { RelayEnv } from "./env";
import { createPushRepository } from "./push-repository";

const PushSubscriptionRequestSchema = z.object({
  pubkeyHash: PubkeyHashSchema,
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1)
    })
  })
});

export async function registerPushRoutes(
  app: FastifyInstance,
  env: RelayEnv
): Promise<void> {
  const repository = await createPushRepository(env);

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

    await repository.upsertSubscription(
      result.data.pubkeyHash,
      result.data.subscription
    );
    return reply.send({ success: true });
  });

  // Attach a helper to the app instance so the websocket routes can trigger pushes
  app.decorate("sendPushNotification", async (
    pubkeyHash: string,
    payload: string
  ) => {
    if (!env.vapidPublicKey || !env.vapidPrivateKey || !env.vapidSubject) {
      return; // Push not configured
    }

    const subscriptions = await repository.getSubscriptions(pubkeyHash);
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription expired or unsubscribed
          await repository.deleteSubscription(sub.endpoint);
        } else {
          app.log.error(err, "Failed to send push notification");
        }
      }
    }
  });
}
