import { describe, expect, it } from "vitest";

import {
  MAX_BUFFERED_EVENTS,
  MAX_TRACKED_DELIVERIES,
  appendBounded,
  trackDelivery,
  useSocketStore
} from "@/stores/useSocketStore";

describe("inbound buffer bounds", () => {
  it("keeps the newest events and drops the oldest past the cap", () => {
    let buffer: number[] = [];
    for (let index = 0; index < MAX_BUFFERED_EVENTS + 50; index += 1) {
      buffer = appendBounded(buffer, index);
    }

    // A PWA can stay installed for weeks; before the cap, every envelope a
    // session ever received stayed in memory for the session's whole life.
    expect(buffer).toHaveLength(MAX_BUFFERED_EVENTS);
    expect(buffer[0]).toBe(50);
    expect(buffer.at(-1)).toBe(MAX_BUFFERED_EVENTS + 49);
  });

  it("bounds delivery receipts, evicting the oldest ids first", () => {
    let deliveries: Record<string, "sent"> = {};
    for (let index = 0; index < MAX_TRACKED_DELIVERIES + 5; index += 1) {
      deliveries = trackDelivery(deliveries, `msg-${index}`, "sent") as Record<
        string,
        "sent"
      >;
    }

    const keys = Object.keys(deliveries);
    expect(keys).toHaveLength(MAX_TRACKED_DELIVERIES);
    expect(deliveries["msg-0"]).toBeUndefined();
    expect(deliveries[`msg-${MAX_TRACKED_DELIVERIES + 4}`]).toBe("sent");
  });

  it("updating an existing receipt does not grow the map", () => {
    const first = trackDelivery({}, "msg-1", "sent");
    const second = trackDelivery(first, "msg-1", "delivered");
    expect(Object.keys(second)).toEqual(["msg-1"]);
    expect(second["msg-1"]).toBe("delivered");
  });
});

describe("acknowledging processed events", () => {
  it("removes only the acknowledged ids from the named buffer", () => {
    // Only the id matters to acknowledge(); the rest of each envelope is
    // irrelevant here, so these stand in for full ones.
    useSocketStore.setState({
      incomingReactions: [{ id: "a" }, { id: "b" }, { id: "c" }] as never,
      incomingDeletions: [{ id: "a" }] as never
    });

    useSocketStore.getState().acknowledge("incomingReactions", ["a", "c"]);

    expect(
      useSocketStore.getState().incomingReactions.map((event) => event.id)
    ).toEqual(["b"]);
    // Acknowledging one buffer must not touch another that shares an id.
    expect(
      useSocketStore.getState().incomingDeletions.map((event) => event.id)
    ).toEqual(["a"]);
  });

  it("is a no-op for an empty id list", () => {
    useSocketStore.setState({ incoming: [{ id: "x" }] as never });
    useSocketStore.getState().acknowledge("incoming", []);
    expect(useSocketStore.getState().incoming).toHaveLength(1);
  });
});
