import {
  BlindUploadResponseSchema,
  type BlindUploadResponse
} from "@nada/types";
import type { EncryptedFileRecord } from "@nada/db";

import { getRelayHttpBaseUrl } from "@/lib/relay-url";

export async function requestBlindUploadSlot(
  encryptedFile: EncryptedFileRecord
): Promise<BlindUploadResponse | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) {
    return null;
  }

  const response = await fetch(new URL("/api/v1/upload/request", relayBaseUrl), {
    body: JSON.stringify({
      contentHash: encryptedFile.contentHash,
      mimeType: encryptedFile.mimeType,
      sizeBytes: encryptedFile.sizeBytes
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();
  const result = BlindUploadResponseSchema.safeParse(payload);
  return result.success ? result.data : null;
}
