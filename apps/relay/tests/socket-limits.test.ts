import { describe, expect, it } from "vitest";

import {
  SOCKET_MESSAGE_LIMIT,
  SOCKET_MESSAGE_WINDOW_MS,
  SocketMessageLimiter
} from "../src/socket-limits";

describe("socket fan-out budget", () => {
  it("charges a group message once per recipient", () => {
    const limiter = new SocketMessageLimiter();
    const socket = {};

    // 512 recipients is the schema's ceiling for a single envelope. Charged
    // per envelope instead of per delivery, the old limit permitted 240 of
    // these a minute — roughly 123,000 deliveries from one socket.
    const perEnvelope = 512;
    const affordable = Math.floor(SOCKET_MESSAGE_LIMIT / perEnvelope);
    for (let index = 0; index < affordable; index += 1) {
      expect(limiter.allow(socket, perEnvelope)).toBe(true);
    }
    expect(limiter.allow(socket, perEnvelope)).toBe(false);
  });

  it("lets ordinary one-to-one traffic through", () => {
    const limiter = new SocketMessageLimiter();
    const socket = {};
    for (let index = 0; index < SOCKET_MESSAGE_LIMIT; index += 1) {
      expect(limiter.allow(socket)).toBe(true);
    }
    expect(limiter.allow(socket)).toBe(false);
  });

  it("refuses a single envelope that alone exceeds the whole budget", () => {
    const limiter = new SocketMessageLimiter(10, SOCKET_MESSAGE_WINDOW_MS);
    expect(limiter.allow({}, 11)).toBe(false);
  });

  it("resets when the window rolls over", () => {
    const limiter = new SocketMessageLimiter(5, 1_000);
    const socket = {};
    expect(limiter.allow(socket, 5, 0)).toBe(true);
    expect(limiter.allow(socket, 1, 500)).toBe(false);
    expect(limiter.allow(socket, 5, 1_100)).toBe(true);
  });

  it("budgets each socket separately", () => {
    const limiter = new SocketMessageLimiter(2, SOCKET_MESSAGE_WINDOW_MS);
    const a = {};
    const b = {};
    expect(limiter.allow(a, 2)).toBe(true);
    expect(limiter.allow(a, 1)).toBe(false);
    expect(limiter.allow(b, 2)).toBe(true);
  });
});
