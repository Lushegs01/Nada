import { readEnv } from "./env";
import { createRelayServer } from "./server";

try {
  // Natively available in Node 20.12+ / 22+, which package.json requires.
  process.loadEnvFile(".env");
} catch {
  // Ignore in production if not present
}

const env = readEnv();
const server = await createRelayServer(env);

/**
 * Graceful shutdown.
 *
 * Container platforms send SIGTERM and then kill the process a short time
 * later. Without a handler the relay dies mid-flight on every single deploy:
 * open WebSockets are severed without a close frame (so clients sit waiting on
 * a TCP timeout instead of reconnecting to a healthy instance), the Postgres
 * pool and both Redis connections are dropped without draining, and Fastify's
 * onClose hooks — which is where socket teardown and connection cleanup live —
 * never run at all.
 *
 * `server.close()` stops accepting new connections, runs those hooks, and
 * lets in-flight requests finish. The watchdog is the backstop: if a hook
 * wedges, exiting on our own terms beats being SIGKILLed with an unknown
 * amount of work half-done.
 */
const SHUTDOWN_GRACE_MS = 15_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  server.log.info({ signal }, "Relay shutting down");

  const watchdog = setTimeout(() => {
    server.log.error({ signal }, "Relay shutdown timed out; forcing exit");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  watchdog.unref();

  try {
    await server.close();
    clearTimeout(watchdog);
    process.exit(0);
  } catch (error) {
    server.log.error({ err: error }, "Relay shutdown failed");
    clearTimeout(watchdog);
    process.exit(1);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

// An unhandled rejection used to be a silent no-op in some Node modes and a
// hard crash in others. Log it explicitly so a background failure (a Redis
// command, a push send) is diagnosable rather than a mystery restart.
process.on("unhandledRejection", (reason) => {
  server.log.error({ err: reason }, "Unhandled promise rejection");
});

await server.listen({
  host: "0.0.0.0",
  port: env.port
});
