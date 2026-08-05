import { createClient } from "redis";

import type { RelayEnv } from "./env";

type RedisClient = ReturnType<typeof createClient>;

export interface RelayRedisLogger {
  error: (details: unknown, message: string) => void;
}

export interface RelayRedis {
  /** Connection for ordinary commands: queue operations and rate limiting. */
  command: RedisClient;
  /**
   * Dedicated connection for pub/sub. Redis puts a connection into subscriber
   * mode once it subscribes, after which it may not issue ordinary commands,
   * so the two uses cannot share one socket.
   */
  subscriber: RedisClient;
  close: () => Promise<void>;
}

/**
 * Opens the relay's shared Redis connections, or returns null when REDIS_URL
 * is unset (local development and tests, which fall back to in-process
 * behaviour). Every consumer shares these two connections rather than opening
 * its own.
 */
export async function createRelayRedis(
  env: RelayEnv,
  logger?: RelayRedisLogger
): Promise<RelayRedis | null> {
  if (!env.redisUrl) {
    return null;
  }

  const command = createClient({ url: env.redisUrl });
  const subscriber = command.duplicate();

  // node-redis emits 'error' on the client. With no listener this is an
  // unhandled error event that takes the process down — the same failure mode
  // the Postgres pool guards against. The client reconnects on its own, so
  // logging and continuing is the correct response.
  command.on("error", (error) => {
    logger?.error({ err: error }, "Redis command client error");
  });
  subscriber.on("error", (error) => {
    logger?.error({ err: error }, "Redis subscriber client error");
  });

  await command.connect();
  await subscriber.connect();

  return {
    command,
    subscriber,
    close: async () => {
      // quit() rejects if the socket is already gone; closing must not throw
      // during shutdown.
      await Promise.allSettled([command.quit(), subscriber.quit()]);
    }
  };
}
