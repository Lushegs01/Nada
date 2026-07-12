import fastify from "fastify";
import { describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import { registerWhisperRoutes } from "../src/whisper-routes";

const env = { databaseUrl: undefined } as unknown as RelayEnv;

describe("whisper feed route", () => {
  it("returns the exact feed total independently of the requested page size", async () => {
    const app = fastify();
    await registerWhisperRoutes(app, env);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/whispers/query",
        payload: {
          viewerPubkeyHash: "campos-dashboard-readonly",
          limit: 1,
          since: 0
        }
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json<{ echoes: unknown[]; total: number }>();
      expect(payload.echoes).toHaveLength(1);
      expect(payload.total).toBeGreaterThan(payload.echoes.length);
    } finally {
      await app.close();
    }
  });
});
