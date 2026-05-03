import { readEnv } from "./env";
import { createRelayServer } from "./server";

try {
  // @ts-ignore - natively available in Node 20+
  process.loadEnvFile(".env");
} catch {
  // Ignore in production if not present
}

const env = readEnv();
const server = await createRelayServer(env);

await server.listen({
  host: "0.0.0.0",
  port: env.port
});
