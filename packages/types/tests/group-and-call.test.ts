import { describe, expect, it } from "vitest";

import {
  CallSignalEnvelopeSchema,
  GroupMessageEnvelopeSchema,
  ServerSocketEnvelopeSchema
} from "../src";

describe("group and call envelopes", () => {
  it("validates group fan-out envelopes", () => {
    const result = GroupMessageEnvelopeSchema.safeParse({
      type: "group-message",
      id: "00000000-0000-4000-8000-000000000000",
      groupId: "group",
      recipients: ["a".repeat(64)],
      sender: "b".repeat(64),
      timestamp: Date.now(),
      ciphertext: "ciphertext"
    });

    expect(result.success).toBe(true);
  });

  it("validates call signaling envelopes", () => {
    const result = CallSignalEnvelopeSchema.safeParse({
      type: "call-signal",
      id: "00000000-0000-4000-8000-000000000001",
      callId: "call",
      recipient: "a".repeat(64),
      sender: "b".repeat(64),
      timestamp: Date.now(),
      mode: "voice",
      signalType: "offer",
      payload: "opaque"
    });

    expect(result.success).toBe(true);
  });

  it("allows relay delivery of group envelopes", () => {
    const result = ServerSocketEnvelopeSchema.safeParse({
      type: "group-message",
      envelope: {
        type: "group-message",
        id: "00000000-0000-4000-8000-000000000002",
        groupId: "group",
        recipients: ["a".repeat(64)],
        sender: "b".repeat(64),
        timestamp: Date.now(),
        ciphertext: "ciphertext"
      }
    });

    expect(result.success).toBe(true);
  });
});
