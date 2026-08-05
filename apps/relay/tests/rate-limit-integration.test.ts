import rateLimit from "@fastify/rate-limit";
import fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import {
  buildRateLimitKey,
  isRateLimitAllowListed,
  resolveRateLimitMax
} from "../src/rate-limit";

// Deliberately tiny ceilings so the limits are reachable in a test.
const env = {
  rateLimitIdentityMax: 3,
  rateLimitIpMax: 2
} as unknown as RelayEnv;

const CAMPUS_IP = "198.51.100.10";
const alice = "a".repeat(64);
const bob = "b".repeat(64);

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

/** Mirrors the relay's own rate-limit registration. */
async function buildApp(): Promise<FastifyInstance> {
  const instance = fastify({ trustProxy: true });
  await instance.register(rateLimit, {
    hook: "preHandler",
    keyGenerator: buildRateLimitKey,
    max: (_request: unknown, key: string) => resolveRateLimitMax(env, key),
    allowList: (request: FastifyRequest) => isRateLimitAllowListed(request),
    skipOnError: true,
    timeWindow: "1 minute"
  });
  instance.post("/q", async () => ({ ok: true }));
  instance.get("/health", async () => ({ ok: true }));
  app = instance;
  return instance;
}

function post(
  instance: FastifyInstance,
  payload: Record<string, unknown>,
  ip = CAMPUS_IP
): Promise<{ statusCode: number }> {
  return instance.inject({
    method: "POST",
    url: "/q",
    payload,
    headers: { "x-forwarded-for": ip }
  });
}

describe("rate limiting end to end", () => {
  it("gives each student their own budget behind one campus IP", async () => {
    // The regression this locks down: with the previous IP-only keying, one
    // institution's NAT address meant ~13 students could exhaust the limit for
    // the entire campus. Identity keying has to survive the real plugin
    // pipeline, which requires the body to be parsed before the key is built.
    const instance = await buildApp();

    expect((await post(instance, { viewerPubkeyHash: alice })).statusCode).toBe(200);
    expect((await post(instance, { viewerPubkeyHash: alice })).statusCode).toBe(200);
    expect((await post(instance, { viewerPubkeyHash: alice })).statusCode).toBe(200);
    // Alice has spent her budget...
    expect((await post(instance, { viewerPubkeyHash: alice })).statusCode).toBe(429);

    // ...but Bob, on the very same IP, is untouched.
    expect((await post(instance, { viewerPubkeyHash: bob })).statusCode).toBe(200);
    expect((await post(instance, { viewerPubkeyHash: bob })).statusCode).toBe(200);
  });

  it("still bounds requests that carry no identity, by IP", async () => {
    const instance = await buildApp();

    expect((await post(instance, {}, "203.0.113.5")).statusCode).toBe(200);
    expect((await post(instance, {}, "203.0.113.5")).statusCode).toBe(200);
    expect((await post(instance, {}, "203.0.113.5")).statusCode).toBe(429);
    // A different address has its own bucket.
    expect((await post(instance, {}, "203.0.113.6")).statusCode).toBe(200);
  });

  it("never rate limits the health probe", async () => {
    const instance = await buildApp();

    for (let i = 0; i < 5; i += 1) {
      const response = await instance.inject({
        method: "GET",
        url: "/health",
        headers: { "x-forwarded-for": CAMPUS_IP }
      });
      expect(response.statusCode).toBe(200);
    }
  });
});
