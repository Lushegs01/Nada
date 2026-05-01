import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

import {
  BlindUploadRequestSchema,
  type BlindUploadResponse
} from "@nada/types";

export async function registerUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/upload/request", async (request, reply) => {
    const result = BlindUploadRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_upload_request",
        message: "Invalid upload request."
      });
    }

    const response: BlindUploadResponse = {
      uploadId: randomUUID(),
      contentHash: result.data.contentHash,
      expiresAt: Date.now() + 15 * 60 * 1000,
      uploadUrl: null,
      storage: "client-encrypted-blind-upload-mvp"
    };

    return reply.send(response);
  });

  app.get("/api/v1/download/:contentHash", async (_request, reply) =>
    reply.code(404).send({
      code: "blind_download_not_configured",
      message: "Encrypted blob storage is not configured for this relay."
    })
  );
}
