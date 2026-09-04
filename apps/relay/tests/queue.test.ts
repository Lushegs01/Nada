import { describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import { createRelayQueue } from "../src/queue";

function env(): RelayEnv {
  return { relayQueueTtlSeconds: 60 } as unknown as RelayEnv;
}

const RECIPIENT = "a".repeat(64);

describe("offline envelope queue", () => {
  it("keeps undelivered envelopes when a replay is interrupted", async () => {
    const queue = await createRelayQueue(env(), null);
    await queue.enqueue(RECIPIENT, "first");
    await queue.enqueue(RECIPIENT, "second");
    await queue.enqueue(RECIPIENT, "third");

    // The socket dies after the first envelope. The drain used to DEL the
    // queue up front, so the rest were simply gone; they must survive.
    const claimed = await queue.drain(RECIPIENT);
    expect(claimed).toEqual(["first", "second", "third"]);
    await queue.restore(RECIPIENT, claimed.slice(1));

    expect(await queue.depth(RECIPIENT)).toBe(2);
    await expect(queue.drain(RECIPIENT)).resolves.toEqual(["second", "third"]);
  });

  it("recovers a backlog abandoned mid-replay by a crashed instance", async () => {
    const queue = await createRelayQueue(env(), null);
    await queue.enqueue(RECIPIENT, "queued-before-crash");

    // Claimed but never settled or restored — the relay died holding them.
    await queue.drain(RECIPIENT);
    // A later envelope lands while the old batch is still in flight.
    await queue.enqueue(RECIPIENT, "queued-after-crash");

    // The next connection gets both, oldest first.
    await expect(queue.drain(RECIPIENT)).resolves.toEqual([
      "queued-before-crash",
      "queued-after-crash"
    ]);
  });

  it("drops the backlog only once delivery is confirmed", async () => {
    const queue = await createRelayQueue(env(), null);
    await queue.enqueue(RECIPIENT, "delivered");

    const claimed = await queue.drain(RECIPIENT);
    expect(claimed).toEqual(["delivered"]);
    await queue.settle(RECIPIENT);

    await expect(queue.drain(RECIPIENT)).resolves.toEqual([]);
    expect(await queue.depth(RECIPIENT)).toBe(0);
  });

  it("restores nothing when everything was delivered", async () => {
    const queue = await createRelayQueue(env(), null);
    await queue.enqueue(RECIPIENT, "one");
    await queue.drain(RECIPIENT);
    await queue.restore(RECIPIENT, []);

    await expect(queue.drain(RECIPIENT)).resolves.toEqual([]);
  });
});
