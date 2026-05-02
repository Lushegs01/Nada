import fastify from "fastify";
import cors from "@fastify/cors";
import { createRelayServer } from "./apps/relay/dist/server.js";

async function run() {
  const env = {
    allowedOrigin: "http://localhost:3000",
    mediaMaxBytes: 25 * 1024 * 1024,
    mediaStorageDir: ".nada-media",
    port: 8080,
    nodeEnv: "development"
  };
  const app = await createRelayServer(env);
  
  await app.listen({ port: 8080 });
  console.log("Server listening on 8080");
}
run().catch(console.error);
