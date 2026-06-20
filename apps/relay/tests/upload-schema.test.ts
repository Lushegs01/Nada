import { describe, expect, it } from "vitest";

import { BlindUploadRequestSchema } from "@nada/types";

describe("blind upload request schema", () => {
  it("accepts encrypted blob metadata only", () => {
    const result = BlindUploadRequestSchema.safeParse({
      contentHash: "a".repeat(64),
      mimeType: "application/octet-stream",
      sizeBytes: 1024
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty content hashes", () => {
    expect(
      BlindUploadRequestSchema.safeParse({
        contentHash: "",
        sizeBytes: 1024
      }).success
    ).toBe(false);
  });
});
