import { describe, expect, it } from "vitest";

import {
  createGroupSenderKey,
  decryptGroupMessage,
  encryptGroupMessage
} from "../src";

describe("group sender key scaffold", () => {
  it("encrypts and decrypts a group message payload", async () => {
    // ⚠️ MVP_ONLY — replace before production
    const senderKey = await createGroupSenderKey();
    const payload = await encryptGroupMessage("hello group", senderKey);

    await expect(decryptGroupMessage(payload, senderKey)).resolves.toBe(
      "hello group"
    );
  });
});
