/**
 * A tiny bounded time-to-live cache for short-lived, viewer-independent query
 * results.
 *
 * The Whispers feed is polled by every open client on a fixed interval, so at
 * institution scale the same aggregate queries are re-executed continuously
 * with identical inputs. Holding those results for a few seconds collapses
 * that repeated work without any visible staleness, since the poll interval is
 * far longer than the TTL.
 *
 * Entries are bounded by count and evicted oldest-first, so a long-running
 * relay cannot accumulate unbounded cache state.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { expiresAt: number; value: T }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number
  ) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    // Re-inserting moves the key to the newest position, which keeps the
    // Map's insertion order usable as an eviction order.
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: now + this.ttlMs, value });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /**
   * Returns the cached value, or computes, stores and returns it. Concurrent
   * callers share one in-flight computation: the promise itself is cached, so
   * a burst of simultaneous pollers issues a single set of queries rather than
   * one set each.
   */
  async resolve(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    // Coalesce concurrent misses onto one computation. A rejected promise is
    // never stored, so a failed query is retried rather than cached.
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const pending = compute()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, pending);
    return pending;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
