import { z } from "zod";

const EnvSchema = z.object({
  ALLOWED_ORIGIN: z.string().min(1),
  ALLOW_DEV_PLAINTEXT: z.string().optional(),
  CAPABILITY_ISSUER_SECRET: z.string().min(32).optional(),
  CAPABILITY_TOKEN_SECRET: z.string().min(32).optional(),
  CONTEST_ADMIN_PUBKEY_HASHES: z.string().optional(),
  CONTEST_METRICS_TOKEN: z.string().min(16).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().url().optional(),
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().optional(),
  MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  MEDIA_S3_BUCKET: z.string().min(1).optional(),
  MEDIA_S3_ENDPOINT: z.string().url().optional(),
  MEDIA_S3_REGION: z.string().min(1).optional(),
  MEDIA_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_STORAGE_DIR: z.string().min(1).optional(),
  MEDIA_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive(),
  RATE_LIMIT_IDENTITY_MAX: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().optional(),
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
  /**
   * Identities allowed to administer contests, as pubkey hashes.
   *
   * Contest administration reuses NADA's one identity system rather than
   * inventing a second: an admin proves control of an Ed25519 key exactly as
   * every other authenticated call does, and this list decides which keys are
   * privileged. Empty means contest administration is disabled entirely, which
   * is the correct default for a relay that is not running one.
   */
  contestAdminPubkeyHashes: string[];
  /** Bearer token gating the aggregate contest metrics endpoint. */
  contestMetricsToken: string | undefined;
  databasePoolMax: number | undefined;
  databaseUrl: string | undefined;
  mediaMaxBytes: number;
  mediaS3AccessKeyId: string | undefined;
  mediaS3Bucket: string | undefined;
  mediaS3Endpoint: string | undefined;
  mediaS3Region: string;
  mediaS3SecretAccessKey: string | undefined;
  mediaStorageDir: string;
  mediaTtlSeconds: number;
  nodeEnv: string;
  port: number;
  rateLimitIdentityMax: number;
  rateLimitIpMax: number;
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
    contestAdminPubkeyHashes: (result.data.CONTEST_ADMIN_PUBKEY_HASHES ?? "")
      .split(",")
      .map((hash) => hash.trim().toLowerCase())
      .filter((hash) => hash.length > 0),
    contestMetricsToken: result.data.CONTEST_METRICS_TOKEN,
    databasePoolMax: result.data.DATABASE_POOL_MAX,
    databaseUrl: result.data.DATABASE_URL,
    mediaMaxBytes: result.data.MEDIA_MAX_BYTES ?? 25 * 1024 * 1024,
    mediaS3AccessKeyId: result.data.MEDIA_S3_ACCESS_KEY_ID,
    mediaS3Bucket: result.data.MEDIA_S3_BUCKET,
    mediaS3Endpoint: result.data.MEDIA_S3_ENDPOINT,
    mediaS3Region: result.data.MEDIA_S3_REGION ?? "auto",
    mediaS3SecretAccessKey: result.data.MEDIA_S3_SECRET_ACCESS_KEY,
    mediaStorageDir: result.data.MEDIA_STORAGE_DIR ?? ".nada-media",
    // Attachments are conversation data, not archives. The relay refuses to
    // serve an object past this age; a bucket lifecycle rule set to the same
    // window is what actually reclaims the bytes.
    mediaTtlSeconds: result.data.MEDIA_TTL_SECONDS ?? 30 * 24 * 60 * 60,
    nodeEnv,
    port: result.data.PORT,
    // Per-identity ceiling. A normal client spends ~9 requests/minute on
    // background polling, so this leaves wide headroom for interactive bursts
    // while still stopping one runaway client.
    rateLimitIdentityMax: result.data.RATE_LIMIT_IDENTITY_MAX ?? 240,
    // Per-IP ceiling, applied ONLY to requests that carry no identity at all.
    // It must never gate identity-bearing traffic: a campus NAT presents
    // thousands of students as one IP, and counting them together is what made
    // the previous 120/minute IP limit unusable at institution scale.
    rateLimitIpMax: result.data.RATE_LIMIT_IP_MAX ?? 600,
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
