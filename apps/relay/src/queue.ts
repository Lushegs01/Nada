import type { PubkeyHash } from "@nada/types";

import type { RelayEnv } from "./env";
import type { RelayRedis } from "./redis";

export interface RelayQueue {
  close: () => Promise<void>;
  /**
   * Takes the recipient's queued envelopes for delivery. Anything returned
   * here is held in an in-flight list, not destroyed: call `settle` once the
   * envelopes are actually on the wire, or `restore` when they are not.
   */
  drain: (recipient: PubkeyHash) => Promise<string[]>;
  /** Confirms a successful hand-off; drops the in-flight copy. */
  settle: (recipient: PubkeyHash) => Promise<void>;
  /** Returns undelivered envelopes to the head of the queue, oldest first. */
  restore: (recipient: PubkeyHash, envelopes: string[]) => Promise<void>;
  enqueue: (recipient: PubkeyHash, serializedEnvelope: string) => Promise<void>;
  /** Current queue depth, for observability. */
  depth: (recipient: PubkeyHash) => Promise<number>;
}

/**
 * Builds the offline-envelope queue on the relay's shared Redis connection.
 * Falls back to an in-process queue only when Redis is not configured, which
 * is a development-only mode: an in-memory queue loses every queued envelope
 * on restart and is invisible to other instances.
 */
export async function createRelayQueue(
  env: RelayEnv,
  redis: RelayRedis | null
): Promise<RelayQueue> {
  if (redis) {
    return new RedisRelayQueue(redis, env.relayQueueTtlSeconds);
  }

  return new MemoryRelayQueue();
}

/**
 * Atomically hands the whole queue to one consumer.
 *
 * Any leftovers in the in-flight list belong to a previous delivery attempt
 * that never completed — a socket that died mid-drain, or a relay instance
 * that was killed between taking the envelopes and writing them out. They are
 * prepended so replay order stays oldest-first, and the merged list is parked
 * in-flight rather than deleted, so a crash during this delivery leaves the
 * envelopes recoverable by the next attempt instead of destroying them.
 *
 * This is at-least-once: a crash after the socket write but before `settle`
 * redelivers. Clients already deduplicate by envelope id on write, so a
 * duplicate is invisible while a lost message would not be.
 */
const CLAIM_SCRIPT = `
  local queued = redis.call('LRANGE', KEYS[1], 0, -1)
  local inflight = redis.call('LRANGE', KEYS[2], 0, -1)
  for i = 1, #queued do
    inflight[#inflight + 1] = queued[i]
  end
  redis.call('DEL', KEYS[1])
  if #inflight > 0 then
    redis.call('DEL', KEYS[2])
    for i = 1, #inflight do
      redis.call('RPUSH', KEYS[2], inflight[i])
    end
    redis.call('EXPIRE', KEYS[2], ARGV[1])
  end
  return inflight
`;

/** Puts undelivered envelopes back at the head of the queue, oldest first. */
const RESTORE_SCRIPT = `
  for i = #ARGV, 2, -1 do
    redis.call('LPUSH', KEYS[1], ARGV[i])
  end
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  redis.call('DEL', KEYS[2])
  return 1
`;

class RedisRelayQueue implements RelayQueue {
  constructor(
    private readonly redis: RelayRedis,
    private readonly ttlSeconds: number
  ) {}

  // The shared Redis connections are owned and closed by the relay server.
  async close(): Promise<void> {}

  async drain(recipient: PubkeyHash): Promise<string[]> {
    const claimed = await this.redis.command.eval(CLAIM_SCRIPT, {
      keys: [this.keyFor(recipient), this.inflightKeyFor(recipient)],
      arguments: [String(this.ttlSeconds)]
    });
    return Array.isArray(claimed) ? (claimed as string[]) : [];
  }

  async settle(recipient: PubkeyHash): Promise<void> {
    await this.redis.command.del(this.inflightKeyFor(recipient));
  }

  async restore(recipient: PubkeyHash, envelopes: string[]): Promise<void> {
    if (envelopes.length === 0) {
      await this.settle(recipient);
      return;
    }
    await this.redis.command.eval(RESTORE_SCRIPT, {
      keys: [this.keyFor(recipient), this.inflightKeyFor(recipient)],
      arguments: [String(this.ttlSeconds), ...envelopes]
    });
  }

  async enqueue(
    recipient: PubkeyHash,
    serializedEnvelope: string
  ): Promise<void> {
    const key = this.keyFor(recipient);
    await this.redis.command
      .multi()
      .rPush(key, serializedEnvelope)
      .expire(key, this.ttlSeconds)
      .exec();
  }

  async depth(recipient: PubkeyHash): Promise<number> {
    return this.redis.command.lLen(this.keyFor(recipient));
  }

  private keyFor(recipient: PubkeyHash): string {
    return `relay_queue:${recipient}`;
  }

  private inflightKeyFor(recipient: PubkeyHash): string {
    return `relay_queue_inflight:${recipient}`;
  }
}

class MemoryRelayQueue implements RelayQueue {
  private readonly messagesByRecipient = new Map<PubkeyHash, string[]>();
  private readonly inflightByRecipient = new Map<PubkeyHash, string[]>();

  async close(): Promise<void> {
    this.messagesByRecipient.clear();
    this.inflightByRecipient.clear();
  }

  async drain(recipient: PubkeyHash): Promise<string[]> {
    const inflight = this.inflightByRecipient.get(recipient) ?? [];
    const queued = this.messagesByRecipient.get(recipient) ?? [];
    const claimed = [...inflight, ...queued];
    this.messagesByRecipient.delete(recipient);
    if (claimed.length > 0) {
      this.inflightByRecipient.set(recipient, claimed);
    }
    return claimed;
  }

  async settle(recipient: PubkeyHash): Promise<void> {
    this.inflightByRecipient.delete(recipient);
  }

  async restore(recipient: PubkeyHash, envelopes: string[]): Promise<void> {
    this.inflightByRecipient.delete(recipient);
    if (envelopes.length === 0) return;
    const pending = this.messagesByRecipient.get(recipient) ?? [];
    this.messagesByRecipient.set(recipient, [...envelopes, ...pending]);
  }

  async enqueue(
    recipient: PubkeyHash,
    serializedEnvelope: string
  ): Promise<void> {
    const messages = this.messagesByRecipient.get(recipient) ?? [];
    messages.push(serializedEnvelope);
    this.messagesByRecipient.set(recipient, messages);
  }

  async depth(recipient: PubkeyHash): Promise<number> {
    return (this.messagesByRecipient.get(recipient) ?? []).length;
  }
}
