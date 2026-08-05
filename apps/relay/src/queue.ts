import type { PubkeyHash } from "@nada/types";

import type { RelayEnv } from "./env";
import type { RelayRedis } from "./redis";

export interface RelayQueue {
  close: () => Promise<void>;
  drain: (recipient: PubkeyHash) => Promise<string[]>;
  enqueue: (recipient: PubkeyHash, serializedEnvelope: string) => Promise<void>;
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

class RedisRelayQueue implements RelayQueue {
  constructor(
    private readonly redis: RelayRedis,
    private readonly ttlSeconds: number
  ) {}

  // The shared Redis connections are owned and closed by the relay server.
  async close(): Promise<void> {}

  async drain(recipient: PubkeyHash): Promise<string[]> {
    const key = this.keyFor(recipient);
    // Atomically take the whole queue: reading then deleting in two steps can
    // drop envelopes that arrive between the read and the delete, and popping
    // one at a time costs a round trip per envelope.
    const [items] = await this.redis.command
      .multi()
      .lRange(key, 0, -1)
      .del(key)
      .exec();

    return Array.isArray(items) ? (items as string[]) : [];
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

  private keyFor(recipient: PubkeyHash): string {
    return `relay_queue:${recipient}`;
  }
}

class MemoryRelayQueue implements RelayQueue {
  private readonly messagesByRecipient = new Map<PubkeyHash, string[]>();

  async close(): Promise<void> {
    this.messagesByRecipient.clear();
  }

  async drain(recipient: PubkeyHash): Promise<string[]> {
    const messages = this.messagesByRecipient.get(recipient) ?? [];
    this.messagesByRecipient.delete(recipient);
    return messages;
  }

  async enqueue(
    recipient: PubkeyHash,
    serializedEnvelope: string
  ): Promise<void> {
    const messages = this.messagesByRecipient.get(recipient) ?? [];
    messages.push(serializedEnvelope);
    this.messagesByRecipient.set(recipient, messages);
  }
}
