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
/** Envelopes per identity per window before the relay pushes back. */
export const SOCKET_MESSAGE_LIMIT = 240;
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

  /** Returns false once the socket has exceeded its budget for this window. */
  allow(socket: object, now: number = Date.now()): boolean {
    const bucket = this.buckets.get(socket);
    if (!bucket || now - bucket.windowStartedAt >= this.windowMs) {
      this.buckets.set(socket, { count: 1, windowStartedAt: now });
      return true;
    }
    bucket.count += 1;
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
