import { createClient } from "redis";

import type { PubkeyHash } from "@nada/types";

import type { RelayEnv } from "./env";

export interface RelayQueue {
  close: () => Promise<void>;
  drain: (recipient: PubkeyHash) => Promise<string[]>;
  enqueue: (recipient: PubkeyHash, serializedEnvelope: string) => Promise<void>;
}

type RedisClient = ReturnType<typeof createClient>;

export async function createRelayQueue(env: RelayEnv): Promise<RelayQueue> {
  if (env.redisUrl) {
    const client = createClient({ url: env.redisUrl });
    await client.connect();
    return new RedisRelayQueue(client, env.relayQueueTtlSeconds);
  }

  return new MemoryRelayQueue();
}

class RedisRelayQueue implements RelayQueue {
  constructor(
    private readonly client: RedisClient,
    private readonly ttlSeconds: number
  ) {}

  async close(): Promise<void> {
    await this.client.quit();
  }

  async drain(recipient: PubkeyHash): Promise<string[]> {
    const key = this.keyFor(recipient);
    const items: string[] = [];

    for (;;) {
      const item = await this.client.lPop(key);
      if (!item) {
        return items;
      }

      items.push(item);
    }
  }

  async enqueue(
    recipient: PubkeyHash,
    serializedEnvelope: string
  ): Promise<void> {
    const key = this.keyFor(recipient);
    await this.client.rPush(key, serializedEnvelope);
    await this.client.expire(key, this.ttlSeconds);
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
