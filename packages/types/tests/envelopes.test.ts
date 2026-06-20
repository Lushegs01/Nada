import { describe, expect, it } from "vitest";

import {
  ClientSocketEnvelopeSchema,
  ProductionEnvelopeSchema,
  ServerSocketEnvelopeSchema
} from "../src";

describe("envelope schemas", () => {
  it("accepts production sealed envelopes", () => {
    const result = ProductionEnvelopeSchema.safeParse({
      version: 1,
      recipient: "a".repeat(64),
      sealedSenderEnvelope: "base64"
    });

    expect(result.success).toBe(true);
  });

  it("accepts client production envelopes over the socket protocol", () => {
    const result = ClientSocketEnvelopeSchema.safeParse({
      version: 1,
      recipient: "b".repeat(64),
      sealedSenderEnvelope: "base64"
    });

    expect(result.success).toBe(true);
  });

  it("accepts sealed-message relay deliveries", () => {
    const result = ServerSocketEnvelopeSchema.safeParse({
      type: "sealed-message",
      envelope: {
        version: 1,
        recipient: "c".repeat(64),
        sealedSenderEnvelope: "base64"
      }
    });

    expect(result.success).toBe(true);
  });
});
