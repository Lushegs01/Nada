import { describe, expect, it, vi } from "vitest";

import { encryptFileForBlindUpload } from "../src/lib/file-encryption";

describe("file encryption helper", () => {
  it("encrypts file bytes before blind upload", async () => {
    vi.stubGlobal("btoa", (value: string) =>
      Buffer.from(value, "binary").toString("base64")
    );

    const file = new File(["secret"], "note.txt", { type: "text/plain" });
    const encrypted = await encryptFileForBlindUpload(file);

    expect(encrypted.contentHash).toHaveLength(64);
    expect(encrypted.encryptedBlobBase64).not.toContain("secret");
    expect(encrypted.keyBase64).not.toHaveLength(0);
    expect(encrypted.nonceBase64).not.toHaveLength(0);
  });
});
