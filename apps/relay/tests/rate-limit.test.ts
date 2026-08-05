import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import {
  buildRateLimitKey,
  createRedisRateLimitStore,
  isRateLimitAllowListed,
  resolveRateLimitMax
} from "../src/rate-limit";

const env = {
  rateLimitIdentityMax: 240,
  rateLimitIpMax: 600
} as unknown as RelayEnv;

function request(
  body: unknown,
  ip = "203.0.113.7",
  url = "/api/v1/whispers/query"
): FastifyRequest {
  return { body, ip, url, headers: {} } as unknown as FastifyRequest;
}

const alice = "a".repeat(64);
const bob = "b".repeat(64);

describe("rate limit keying", () => {
  it("gives each identity its own bucket behind one shared campus IP", () => {
    // The failure this guards against: an institution NATs every student
    // behind a handful of egress addresses, so an IP-keyed limit counts the
    // whole campus as a single client and throttles everyone at once.
    const campusIp = "198.51.100.10";
    const aliceKey = buildRateLimitKey(
      request({ viewerPubkeyHash: alice }, campusIp)
    );
    const bobKey = buildRateLimitKey(request({ viewerPubkeyHash: bob }, campusIp));

    expect(aliceKey).not.toBe(bobKey);
    expect(aliceKey).toContain(alice);
    expect(bobKey).toContain(bob);
  });

  it("prefers the verified proof identity over other body fields", () => {
    const key = buildRateLimitKey(
      request({ proof: { pubkeyHash: alice }, viewerPubkeyHash: bob })
    );
    expect(key).toBe(`id:${alice}`);
  });

  it("reads the identity from each of the request shapes routes use", () => {
    expect(buildRateLimitKey(request({ pubkeyHash: alice }))).toBe(`id:${alice}`);
    expect(buildRateLimitKey(request({ recipient: alice }))).toBe(`id:${alice}`);
    expect(buildRateLimitKey(request({ follower: alice }))).toBe(`id:${alice}`);
    expect(buildRateLimitKey(request({ viewerPubkeyHash: alice }))).toBe(
      `id:${alice}`
    );
  });

  it("falls back to the client IP when no identity is present", () => {
    expect(buildRateLimitKey(request(undefined, "203.0.113.9"))).toBe(
      "ip:203.0.113.9"
    );
    expect(buildRateLimitKey(request({}, "203.0.113.9"))).toBe("ip:203.0.113.9");
  });

  it("does not treat a raw Buffer body (Stripe webhook) as an identity", () => {
    const key = buildRateLimitKey(
      request(Buffer.from('{"pubkeyHash":"x"}'), "203.0.113.11")
    );
    expect(key).toBe("ip:203.0.113.11");
  });

  it("applies the identity ceiling to identities and the IP ceiling to bare IPs", () => {
    expect(resolveRateLimitMax(env, `id:${alice}`)).toBe(240);
    expect(resolveRateLimitMax(env, "ip:203.0.113.7")).toBe(600);
  });

  it("exempts the health probe so uptime checks never consume budget", () => {
    expect(isRateLimitAllowListed(request({}, "1.2.3.4", "/health"))).toBe(true);
    expect(isRateLimitAllowListed(request({}, "1.2.3.4", "/health?probe=1"))).toBe(
      true
    );
    expect(isRateLimitAllowListed(request({}, "1.2.3.4", "/stats"))).toBe(false);
  });
});

describe("redis rate limit store", () => {
  it("counts through Redis so limits hold across instances", async () => {
    const counters = new Map<string, number>();
    const redis = {
      eval: async (_script: string, options: { keys: string[] }) => {
        const key = options.keys[0]!;
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return [next, 60_000];
      }
    };

    const Store = createRedisRateLimitStore(redis);
    // Two stores standing in for two relay instances sharing one Redis.
    const instanceA = new Store({ timeWindow: 60_000 });
    const instanceB = new Store({ timeWindow: 60_000 });

    const incr = (store: { incr: (k: string, cb: any) => void }, key: string) =>
      new Promise<{ current: number; ttl: number }>((resolve, reject) => {
        store.incr(key, (error: Error | null, result: any) =>
          error ? reject(error) : resolve(result)
        );
      });

    expect((await incr(instanceA, `id:${alice}`)).current).toBe(1);
    // The second instance continues the same tally rather than starting over.
    expect((await incr(instanceB, `id:${alice}`)).current).toBe(2);
    expect((await incr(instanceA, `id:${bob}`)).current).toBe(1);
  });

  it("surfaces Redis failures to the caller so the plugin can skip on error", async () => {
    const redis = {
      eval: async () => {
        throw new Error("redis down");
      }
    };
    const Store = createRedisRateLimitStore(redis);
    const store = new Store({ timeWindow: 60_000 });

    await expect(
      new Promise((resolve, reject) => {
        store.incr("id:x", (error: Error | null, result: unknown) =>
          error ? reject(error) : resolve(result)
        );
      })
    ).rejects.toThrow("redis down");
  });
});
