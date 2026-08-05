import { describe, expect, it } from "vitest";

import { createPresenceBus } from "../src/presence-bus";
import type { RelayRedis } from "../src/redis";

/**
 * A minimal in-memory stand-in for Redis pub/sub shared by several simulated
 * relay instances, so the cross-instance behaviour can be exercised without a
 * live server.
 */
function createBroker(): { connect: () => RelayRedis } {
  const channels = new Map<string, Set<(raw: string) => void>>();

  return {
    connect(): RelayRedis {
      const own = new Map<string, (raw: string) => void>();
      return {
        subscriber: {
          subscribe: async (channel: string, handler: (raw: string) => void) => {
            own.set(channel, handler);
            const set = channels.get(channel) ?? new Set();
            set.add(handler);
            channels.set(channel, set);
          },
          unsubscribe: async (channel: string) => {
            const handler = own.get(channel);
            if (!handler) return;
            own.delete(channel);
            channels.get(channel)?.delete(handler);
          }
        },
        command: {
          publish: async (channel: string, message: string) => {
            const subscribers = channels.get(channel);
            if (!subscribers) return 0;
            subscribers.forEach((handler) => handler(message));
            return subscribers.size;
          }
        },
        close: async () => {}
      } as unknown as RelayRedis;
    }
  };
}

const alice = "a".repeat(64);

describe("presence bus", () => {
  it("delivers to a recipient connected to a different instance", async () => {
    // This is the bug that made the relay un-scalable: instance B held no
    // socket for alice, so without the bus it would file her as offline and
    // queue a message she is actually connected to receive on instance A.
    const broker = createBroker();
    const instanceA = createPresenceBus(broker.connect());
    const instanceB = createPresenceBus(broker.connect());

    const receivedOnA: string[] = [];
    await instanceA.track(alice, (payload) => receivedOnA.push(payload));

    const receivers = await instanceB.publish(alice, "envelope-1");

    expect(receivers).toBe(1);
    expect(receivedOnA).toEqual(["envelope-1"]);
  });

  it("reports zero receivers when no instance holds the recipient", async () => {
    const broker = createBroker();
    const instanceA = createPresenceBus(broker.connect());

    // Zero is the signal callers use to queue the envelope for later.
    expect(await instanceA.publish(alice, "envelope-1")).toBe(0);
  });

  it("does not echo an instance's own publish back to itself", async () => {
    // The publisher is also a subscriber whenever it holds the recipient
    // locally. It already delivered to those sockets directly, so a bus echo
    // would deliver the same envelope twice.
    const broker = createBroker();
    const instance = createPresenceBus(broker.connect());

    const received: string[] = [];
    await instance.track(alice, (payload) => received.push(payload));

    const receivers = await instance.publish(alice, "envelope-1");

    expect(receivers).toBe(0);
    expect(received).toEqual([]);
  });

  it("counts only remote receivers when the sender also holds the recipient", async () => {
    const broker = createBroker();
    const instanceA = createPresenceBus(broker.connect());
    const instanceB = createPresenceBus(broker.connect());

    await instanceA.track(alice, () => {});
    const receivedOnB: string[] = [];
    await instanceB.track(alice, (payload) => receivedOnB.push(payload));

    // A holds alice too (a second device), so its own subscription must not
    // inflate the remote count.
    expect(await instanceA.publish(alice, "envelope-1")).toBe(1);
    expect(receivedOnB).toEqual(["envelope-1"]);
  });

  it("stops receiving once the last local socket is released", async () => {
    const broker = createBroker();
    const instanceA = createPresenceBus(broker.connect());
    const instanceB = createPresenceBus(broker.connect());

    const receivedOnA: string[] = [];
    await instanceA.track(alice, (payload) => receivedOnA.push(payload));
    await instanceA.untrack(alice);

    expect(await instanceB.publish(alice, "envelope-1")).toBe(0);
    expect(receivedOnA).toEqual([]);
  });

  it("treats repeated tracking of one identity as a single subscription", async () => {
    // A user with several devices on one instance must not be counted twice,
    // or the remote-receiver discount would be wrong.
    const broker = createBroker();
    const instanceA = createPresenceBus(broker.connect());
    const instanceB = createPresenceBus(broker.connect());

    const receivedOnA: string[] = [];
    await instanceA.track(alice, (payload) => receivedOnA.push(payload));
    await instanceA.track(alice, (payload) => receivedOnA.push(payload));

    await instanceB.publish(alice, "envelope-1");

    expect(receivedOnA).toEqual(["envelope-1"]);
  });

  it("degrades to a no-op bus without Redis, preserving single-instance behaviour", async () => {
    const bus = createPresenceBus(null);
    await bus.track(alice, () => {
      throw new Error("must not be called");
    });
    expect(await bus.publish(alice, "envelope-1")).toBe(0);
    await bus.untrack(alice);
    await bus.close();
  });
});
