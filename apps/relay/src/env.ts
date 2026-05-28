import { z } from "zod";

const EnvSchema = z.object({
  ALLOWED_ORIGIN: z.string().min(1),
  ALLOW_DEV_PLAINTEXT: z.string().optional(),
  CAPABILITY_ISSUER_SECRET: z.string().min(32).optional(),
  CAPABILITY_TOKEN_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().url().optional(),
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().optional(),
  MEDIA_STORAGE_DIR: z.string().min(1).optional(),
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive(),
  REDIS_URL: z.string().url().optional(),
  RELAY_QUEUE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  STRIPE_PRICE_BUSINESS: z.string().min(1).optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().min(1).optional(),
  STRIPE_PRICE_PRO: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  TURN_USERNAME: z.string().min(1).optional(),
  TURN_CREDENTIAL: z.string().min(1).optional(),
  TURN_SHARED_SECRET: z.string().min(16).optional(),
  TURN_URLS: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
  ZERO_LOG_MODE: z.string().optional()
});

export interface RelayEnv {
  allowedOrigin: string;
  allowDevPlaintext: boolean;
  capabilityIssuerSecret: string | undefined;
  capabilityTokenSecret: string | undefined;
  databaseUrl: string | undefined;
  mediaMaxBytes: number;
  mediaStorageDir: string;
  nodeEnv: string;
  port: number;
  redisUrl: string | undefined;
  relayQueueTtlSeconds: number;
  stripePriceBusiness: string | undefined;
  stripePriceEnterprise: string | undefined;
  stripePricePro: string | undefined;
  stripeSecretKey: string | undefined;
  stripeWebhookSecret: string | undefined;
  turnUsername: string | undefined;
  turnCredential: string | undefined;
  turnSharedSecret: string | undefined;
  turnUrls: string[];
  vapidPrivateKey: string | undefined;
  vapidPublicKey: string | undefined;
  vapidSubject: string | undefined;
  zeroLogMode: boolean;
}

export function readEnv(): RelayEnv {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error("Relay environment is invalid.");
  }

  const nodeEnv = result.data.NODE_ENV ?? "development";
  return {
    allowedOrigin: result.data.ALLOWED_ORIGIN,
    allowDevPlaintext: result.data.ALLOW_DEV_PLAINTEXT === "true",
    capabilityIssuerSecret: result.data.CAPABILITY_ISSUER_SECRET,
    capabilityTokenSecret: result.data.CAPABILITY_TOKEN_SECRET,
    databaseUrl: result.data.DATABASE_URL,
    mediaMaxBytes: result.data.MEDIA_MAX_BYTES ?? 25 * 1024 * 1024,
    mediaStorageDir: result.data.MEDIA_STORAGE_DIR ?? ".nada-media",
    nodeEnv,
    port: result.data.PORT,
    redisUrl: result.data.REDIS_URL,
    relayQueueTtlSeconds: result.data.RELAY_QUEUE_TTL_SECONDS ?? 604800, // default: 7 days
    stripePriceBusiness: result.data.STRIPE_PRICE_BUSINESS,
    stripePriceEnterprise: result.data.STRIPE_PRICE_ENTERPRISE,
    stripePricePro: result.data.STRIPE_PRICE_PRO,
    stripeSecretKey: result.data.STRIPE_SECRET_KEY,
    stripeWebhookSecret: result.data.STRIPE_WEBHOOK_SECRET,
    turnUsername: result.data.TURN_USERNAME,
    turnCredential: result.data.TURN_CREDENTIAL,
    turnSharedSecret: result.data.TURN_SHARED_SECRET,
    turnUrls: result.data.TURN_URLS
      ? result.data.TURN_URLS.split(",")
          .map((u) => u.trim())
          .filter((u) => u.length > 0)
      : [
          "turn:global.relay.metered.ca:80",
          "turn:global.relay.metered.ca:80?transport=tcp",
          "turn:global.relay.metered.ca:443",
          "turns:global.relay.metered.ca:443?transport=tcp"
        ],
    vapidPrivateKey: result.data.VAPID_PRIVATE_KEY,
    vapidPublicKey: result.data.VAPID_PUBLIC_KEY,
    vapidSubject: result.data.VAPID_SUBJECT ?? "mailto:admin@nada.local",
    zeroLogMode:
      result.data.ZERO_LOG_MODE === "true" || nodeEnv === "production"
  };
}
