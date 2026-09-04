import type {
  FastifyRateLimitOptions,
  FastifyRateLimitStore,
  FastifyRateLimitStoreCtor
} from "@fastify/rate-limit";
import type { RouteOptions } from "fastify";
import type { FastifyRequest } from "fastify";

import type { RelayEnv } from "./env";

/**
 * Fields a request body may carry that identify the acting NADA identity.
 * Checked in order; `proof.pubkeyHash` wins because routes carrying a proof
 * verify it, so that value is authenticated rather than merely asserted.
 */
const IDENTITY_BODY_FIELDS = [
  "pubkeyHash",
  "viewerPubkeyHash",
  "recipient",
  "follower",
  "sender",
  "authorPubkeyHash",
  "reactorPubkeyHash"
] as const;

export const IDENTITY_KEY_PREFIX = "id:";
export const IP_KEY_PREFIX = "ip:";

/** Paths that must never consume rate-limit budget. */
const ALLOW_LISTED_PATHS = new Set(["/health"]);

function isPubkeyHashLike(value: unknown): value is string {
  // Pubkey hashes are 64-char hex. Anything else (including the CampOS
  // dashboard's readonly sentinel) is still usable as a bucket label, so we
  // only require a bounded non-empty string here.
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

/**
 * Derives the rate-limit bucket for a request.
 *
 * Returns an identity-scoped key when the request names an identity, and only
 * falls back to the client IP when it does not. This split is the whole point:
 * an institution NATs thousands of students behind a handful of egress IPs, so
 * an IP-keyed limit counts an entire campus as one client. Keying on identity
 * gives every student their own budget while still bounding any single client.
 *
 * The identity in a non-proof request body is client-asserted, so this is
 * abuse hygiene rather than authentication — a client that rotates the field
 * can spread itself across buckets. That is an accepted trade: volumetric
 * attacks belong to the edge/CDN layer, and the routes that actually matter
 * verify an identity proof before doing any work.
 */
export function buildRateLimitKey(request: FastifyRequest): string {
  const body: unknown = (request as { body?: unknown }).body;

  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    const record = body as Record<string, unknown>;

    const proof = record["proof"];
    if (proof && typeof proof === "object") {
      const proofHash = (proof as Record<string, unknown>)["pubkeyHash"];
      if (isPubkeyHashLike(proofHash)) {
        return `${IDENTITY_KEY_PREFIX}${proofHash}`;
      }
    }

    for (const field of IDENTITY_BODY_FIELDS) {
      const value = record[field];
      if (isPubkeyHashLike(value)) {
        return `${IDENTITY_KEY_PREFIX}${value}`;
      }
    }
  }

  return `${IP_KEY_PREFIX}${request.ip}`;
}

/** Per-request ceiling: generous for a known identity, tighter for a bare IP. */
export function resolveRateLimitMax(env: RelayEnv, key: string): number {
  return key.startsWith(IDENTITY_KEY_PREFIX)
    ? env.rateLimitIdentityMax
    : env.rateLimitIpMax;
}

export function isRateLimitAllowListed(request: FastifyRequest): boolean {
  return ALLOW_LISTED_PATHS.has(request.url.split("?")[0] ?? "");
}

/**
 * Minimal Redis client surface used by the store, so the relay's existing
 * node-redis connection can back rate limiting without pulling in ioredis
 * (which the plugin's bundled RedisStore requires for `defineCommand`).
 */
export interface RateLimitRedis {
  eval: (
    script: string,
    options: { keys: string[]; arguments: string[] }
  ) => Promise<unknown>;
}

// INCR the counter and attach the window TTL on first use. Returning PTTL with
// the count lets the plugin report an accurate Retry-After.
const INCR_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  local ttl = redis.call('PTTL', KEYS[1])
  if ttl == -1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return {current, ttl}
`;

/** Fallback window when the plugin constructs a store without one. */
const DEFAULT_WINDOW_MS = 60_000;

function toMilliseconds(window: number | string | undefined): number {
  if (typeof window === "number") return window;
  if (typeof window === "string") {
    const parsed = Number(window);
    if (Number.isFinite(parsed)) return parsed;
  }
  return DEFAULT_WINDOW_MS;
}

/**
 * Builds a `@fastify/rate-limit` store class backed by shared Redis, so limits
 * are enforced across every relay instance instead of per-process. Without
 * this, running N instances silently multiplies every limit by N.
 */
export function createRedisRateLimitStore(
  redis: RateLimitRedis,
  namespace = "nada-rate-limit:"
): FastifyRateLimitStoreCtor {
  return class RedisRateLimitStore implements FastifyRateLimitStore {
    private readonly timeWindow: number;

    // The plugin declares `FastifyRateLimitOptions` as an empty interface but
    // passes the resolved options through at runtime, so the window is read
    // from a widened view of the same object rather than assumed.
    constructor(options: FastifyRateLimitOptions) {
      this.timeWindow = toMilliseconds(
        (options as { timeWindow?: number | string }).timeWindow
      );
    }

    incr(
      key: string,
      callback: (
        error: Error | null,
        result?: { current: number; ttl: number }
      ) => void
    ): void {
      redis
        .eval(INCR_SCRIPT, {
          keys: [`${namespace}${key}`],
          arguments: [String(this.timeWindow)]
        })
        .then((raw) => {
          const [current, ttl] = raw as [number, number];
          callback(null, { current: Number(current), ttl: Number(ttl) });
        })
        .catch((error: Error) => {
          callback(error);
        });
    }

    child(
      routeOptions: RouteOptions & { path: string; prefix: string }
    ): FastifyRateLimitStore {
      const routeWindow = (routeOptions as { timeWindow?: number | string })
        .timeWindow;
      return new RedisRateLimitStore({
        timeWindow: routeWindow ?? this.timeWindow
      } as FastifyRateLimitOptions);
    }
  };
}
