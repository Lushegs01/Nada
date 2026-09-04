import { describe, expect, it } from "vitest";

import {
  ClientSocketEnvelopeSchema,
  MessageEnvelopeSchema,
  ServerSocketEnvelopeSchema
} from "../src";

const SENDER = "a".repeat(64);
const RECIPIENT = "b".repeat(64);
const ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_KEY = "k".repeat(44);

function message(overrides: Record<string, unknown> = {}) {
  return {
    type: "message",
    id: ID,
    sender: SENDER,
    recipient: RECIPIENT,
    ciphertext: "sealed",
    timestamp: Date.now(),
    ...overrides
  };
}

describe("envelope schemas", () => {
  it("accepts a direct message carrying the sender's identity key", () => {
    const result = MessageEnvelopeSchema.safeParse(
      message({ senderPublicKey: PUBLIC_KEY })
    );
    expect(result.success).toBe(true);
  });

  it("accepts a direct message without one, for peers on older clients", () => {
    expect(MessageEnvelopeSchema.safeParse(message()).success).toBe(true);
  });

  it("rejects an envelope with no ciphertext at all", () => {
    expect(
      MessageEnvelopeSchema.safeParse(message({ ciphertext: "" })).success
    ).toBe(false);
  });

  it("routes a direct message through the client socket protocol", () => {
    const result = ClientSocketEnvelopeSchema.safeParse(
      message({ senderPublicKey: PUBLIC_KEY })
    );
    expect(result.success).toBe(true);
  });

  it("accepts a group message whose key is sealed per member", () => {
    const result = ClientSocketEnvelopeSchema.safeParse({
      type: "group-message",
      id: ID,
      groupId: "study-group",
      recipients: [RECIPIENT],
      sender: SENDER,
      senderPublicKey: PUBLIC_KEY,
      ciphertext: "sealed",
      keyEnvelopes: [{ recipient: RECIPIENT, sealedKey: "sealed-for-them" }],
      timestamp: Date.now()
    });
    expect(result.success).toBe(true);
  });

  it("caps group fan-out so one envelope cannot address the whole system", () => {
    const result = ClientSocketEnvelopeSchema.safeParse({
      type: "group-message",
      id: ID,
      groupId: "study-group",
      recipients: Array.from({ length: 513 }, () => RECIPIENT),
      sender: SENDER,
      ciphertext: "sealed",
      timestamp: Date.now()
    });
    expect(result.success).toBe(false);
  });

  it("delivers a direct message over the server socket protocol", () => {
    const result = ServerSocketEnvelopeSchema.safeParse({
      type: "message",
      envelope: message({ senderPublicKey: PUBLIC_KEY })
    });
    expect(result.success).toBe(true);
  });
});
