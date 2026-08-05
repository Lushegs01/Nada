import { randomUUID } from "node:crypto";

import type { PubkeyHash } from "@nada/types";

import type { RelayRedis } from "./redis";

export type PresenceDeliver = (serializedPayload: string) => void;

export interface PresenceBus {
  /**
   * Registers interest in envelopes for `pubkeyHash`, because this instance
   * now holds at least one socket for that identity. Idempotent.
   */
  track: (pubkeyHash: PubkeyHash, deliver: PresenceDeliver) => Promise<void>;
  /** Drops interest once this instance holds no more sockets for the identity. */
  untrack: (pubkeyHash: PubkeyHash) => Promise<void>;
  /**
   * Hands `serializedPayload` to every *other* relay instance holding a socket
   * for `pubkeyHash`, and resolves with how many such instances received it.
   * Zero means no other instance has the recipient connected, which — combined
   * with the caller's own local check — is what makes "the recipient is
   * offline everywhere, queue it" a safe conclusion.
   */
  publish: (pubkeyHash: PubkeyHash, serializedPayload: string) => Promise<number>;
  close: () => Promise<void>;
}

interface BusMessage {
  origin: string;
  payload: string;
}

function channelFor(pubkeyHash: PubkeyHash): string {
  return `relay:deliver:${pubkeyHash}`;
}

/**
 * Creates the cross-instance delivery bus.
 *
 * The relay's socket registry is per-process, so with more than one instance a
 * sender on instance A cannot see a recipient connected to instance B: the
 * message would be misfiled as "recipient offline" and queued instead of
 * delivered. This bus closes that gap, which is what allows the relay to run
 * more than one instance at all.
 *
 * Without Redis it degrades to a no-op bus, preserving exact single-instance
 * behaviour for local development and tests.
 */
export function createPresenceBus(redis: RelayRedis | null): PresenceBus {
  if (!redis) {
    return {
      track: async () => {},
      untrack: async () => {},
      publish: async () => 0,
      close: async () => {}
    };
  }

  // Identifies this process so it can ignore the echo of its own publishes —
  // the publisher is also a subscriber whenever it holds a socket for the
  // recipient, and delivering both locally and via the bus would duplicate.
  const instanceId = randomUUID();
  const tracked = new Set<PubkeyHash>();

  return {
    async track(pubkeyHash, deliver) {
      if (tracked.has(pubkeyHash)) return;
      tracked.add(pubkeyHash);

      try {
        await redis.subscriber.subscribe(channelFor(pubkeyHash), (raw) => {
          let message: BusMessage;
          try {
            message = JSON.parse(raw) as BusMessage;
          } catch {
            return;
          }
          if (message.origin === instanceId) return;
          deliver(message.payload);
        });
      } catch (error) {
        // Leaving a phantom entry would make later track() calls no-op, so the
        // identity must be released before the error propagates.
        tracked.delete(pubkeyHash);
        throw error;
      }
    },

    async untrack(pubkeyHash) {
      if (!tracked.delete(pubkeyHash)) return;
      await redis.subscriber.unsubscribe(channelFor(pubkeyHash));
    },

    async publish(pubkeyHash, serializedPayload) {
      const message: BusMessage = {
        origin: instanceId,
        payload: serializedPayload
      };
      const receivers = await redis.command.publish(
        channelFor(pubkeyHash),
        JSON.stringify(message)
      );
      // PUBLISH counts this instance's own subscription when it holds the
      // recipient locally; the caller has already delivered to those sockets
      // directly, so discount it to leave only genuinely remote receivers.
      const ownSubscription = tracked.has(pubkeyHash) ? 1 : 0;
      return Math.max(0, receivers - ownSubscription);
    },

    async close() {
      tracked.clear();
    }
  };
}
