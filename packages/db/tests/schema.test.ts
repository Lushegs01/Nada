import { describe, expect, it } from "vitest";

import {
  ClientTableNameSchema,
  MessageRecordSchema,
  POSTGRES_SCHEMA_SQL
} from "../src";

describe("db schemas", () => {
  it("defines required client tables", () => {
    expect(ClientTableNameSchema.options).toContain("identity");
    expect(ClientTableNameSchema.options).toContain("messages");
  });

  it("validates a local message record", () => {
    expect(
      MessageRecordSchema.safeParse({
        id: "00000000-0000-4000-8000-000000000000",
        chatId: "chat",
        senderPubkeyHash: "a".repeat(64),
        recipientPubkeyHash: "b".repeat(64),
        direction: "outbound",
        body: "hello",
        encryptedPayload: "ciphertext",
        status: "sent",
        createdAt: Date.now()
      }).success
    ).toBe(true);
  });

  it("keeps server schema metadata-only", () => {
    expect(POSTGRES_SCHEMA_SQL).not.toMatch(/phone|email|plaintext/i);
  });
});
