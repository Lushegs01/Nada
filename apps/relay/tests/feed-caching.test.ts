import { describe, expect, it, vi } from "vitest";

import { TtlCache } from "../src/ttl-cache";
import { defaultFeedSince, requestMatchesEtag, weakEtag } from "../src/whisper-routes";

describe("ttl cache", () => {
  it("serves a cached value until the ttl elapses, then recomputes", async () => {
    const cache = new TtlCache<number>(1000, 10);
    const compute = vi.fn(async () => 42);

    const now = Date.now();
    vi.setSystemTime(now);
    expect(await cache.resolve("k", compute)).toBe(42);
    expect(await cache.resolve("k", compute)).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);

    vi.setSystemTime(now + 1001);
    expect(await cache.resolve("k", compute)).toBe(42);
    expect(compute).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("collapses a burst of concurrent misses into one computation", async () => {
    // The point of the cache at scale: every client polls the same feed on the
    // same interval, so simultaneous misses must not each hit the database.
    const cache = new TtlCache<number>(1000, 10);
    let calls = 0;
    const compute = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 7;
    };

    const results = await Promise.all([
      cache.resolve("k", compute),
      cache.resolve("k", compute),
      cache.resolve("k", compute)
    ]);

    expect(results).toEqual([7, 7, 7]);
    expect(calls).toBe(1);
  });

  it("does not cache a failed computation", async () => {
    const cache = new TtlCache<number>(1000, 10);
    let attempt = 0;
    const compute = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("db down");
      return 5;
    };

    await expect(cache.resolve("k", compute)).rejects.toThrow("db down");
    expect(await cache.resolve("k", compute)).toBe(5);
  });

  it("evicts oldest-first so a long-running relay stays bounded", () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });

  it("clears everything on invalidation", async () => {
    const cache = new TtlCache<number>(10_000, 10);
    await cache.resolve("k", async () => 1);
    cache.clear();
    expect(await cache.resolve("k", async () => 2)).toBe(2);
  });
});

describe("feed since bucketing", () => {
  it("returns the same lower bound for polls within one bucket", () => {
    // An unbucketed `Date.now() - window` changes every millisecond, so no two
    // pollers would ever share a cache key.
    const base = 1_760_000_000_000;
    expect(defaultFeedSince(base)).toBe(defaultFeedSince(base + 9_999));
  });

  it("advances once the bucket rolls over", () => {
    const base = 1_760_000_000_000;
    expect(defaultFeedSince(base + 20_000)).toBeGreaterThan(defaultFeedSince(base));
  });
});

describe("feed etag", () => {
  it("is stable for identical payloads and differs for changed ones", () => {
    expect(weakEtag('{"echoes":[],"total":0}')).toBe(weakEtag('{"echoes":[],"total":0}'));
    expect(weakEtag('{"echoes":[],"total":0}')).not.toBe(
      weakEtag('{"echoes":[],"total":1}')
    );
  });

  it("is marked weak, since it asserts semantic not byte equivalence", () => {
    expect(weakEtag("payload").startsWith('W/"')).toBe(true);
  });

  it("matches a validator the client replays", () => {
    const etag = weakEtag("payload");
    expect(requestMatchesEtag(etag, etag)).toBe(true);
    expect(requestMatchesEtag(`W/"other", ${etag}`, etag)).toBe(true);
    expect(requestMatchesEtag("*", etag)).toBe(true);
  });

  it("does not match a stale or absent validator", () => {
    const etag = weakEtag("payload");
    expect(requestMatchesEtag(undefined, etag)).toBe(false);
    expect(requestMatchesEtag(weakEtag("older"), etag)).toBe(false);
  });
});
