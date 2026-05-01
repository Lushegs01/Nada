import { readEnv } from "./env";
import { createRelayServer } from "./server";

const env = readEnv();
const server = await createRelayServer(env);

await server.listen({
  host: "0.0.0.0",
  port: env.port
});
