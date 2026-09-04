import type { WebSocket } from "ws";

/**
 * Per-connection safety rails for the WebSocket surface.
 *
 * HTTP routes sit behind `@fastify/rate-limit`, but until now a registered
 * socket could send envelopes as fast as it could write them: no message
 * ceiling, no frame-size ceiling, and no limit on how many sockets one
 * identity could hold open. Each of those is a single-client denial of service
 * against a shared relay, so they are enforced here rather than left to the
 * edge.
 */

/** Largest frame the relay will accept. Envelopes are JSON, not media. */
export const MAX_SOCKET_PAYLOAD_BYTES = 512 * 1024;
/**
 * Fan-out units per socket per window before the relay pushes back.
 *
 * Counted in deliveries, not envelopes: one group message addressed to 512
 * recipients is 512 units, not one. Without that weighting the ceiling was
 * 240 envelopes x 512 recipients = ~123,000 deliveries a minute from a single
 * socket, which is an amplifier rather than a limit.
 */
export const SOCKET_MESSAGE_LIMIT = 2_400;
export const SOCKET_MESSAGE_WINDOW_MS = 60_000;
/** Simultaneous sockets one identity may hold on a single instance. */
export const MAX_SOCKETS_PER_IDENTITY = 8;
/** How often to sweep for sockets that stopped answering pings. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

interface Bucket {
  count: number;
  windowStartedAt: number;
}

/**
 * Fixed-window message counter, keyed per socket. Deliberately per-process:
 * it bounds what one connection can do to the instance holding it, which is
 * exactly the resource being protected. Cross-instance fairness is the HTTP
 * limiter's job.
 */
export class SocketMessageLimiter {
  private readonly buckets = new WeakMap<object, Bucket>();

  constructor(
    private readonly limit: number = SOCKET_MESSAGE_LIMIT,
    private readonly windowMs: number = SOCKET_MESSAGE_WINDOW_MS
  ) {}

  /**
   * Charges `cost` fan-out units to the socket and reports whether it stayed
   * within budget. `cost` is the number of deliveries the envelope will
   * produce, so a group message is charged for every recipient it names.
   */
  allow(socket: object, cost = 1, now: number = Date.now()): boolean {
    const charge = Math.max(1, cost);
    const bucket = this.buckets.get(socket);
    if (!bucket || now - bucket.windowStartedAt >= this.windowMs) {
      this.buckets.set(socket, { count: charge, windowStartedAt: now });
      return charge <= this.limit;
    }
    bucket.count += charge;
    return bucket.count <= this.limit;
  }

  release(socket: object): void {
    this.buckets.delete(socket);
  }
}

const OPEN = 1;

/**
 * Writes to a socket only when it is actually open, and reports whether the
 * write happened. `ws.send()` on a closing or closed socket surfaces as an
 * asynchronous error rather than a throw, so an unchecked send silently
 * "succeeds" — which is how a message gets marked delivered and then lost.
 */
export function trySend(socket: WebSocket, payload: string): boolean {
  if (socket.readyState !== OPEN) {
    return false;
  }
  try {
    socket.send(payload);
    return true;
  } catch {
    return false;
  }
}
