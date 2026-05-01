import { describe, expect, it, vi } from "vitest";

import {
  buildGroupInviteUrl,
  buildInviteUrl,
  parseGroupInviteInput,
  parseInviteInput
} from "../src/lib/invite";

describe("invite helpers", () => {
  it("round-trips contact and group invite URLs", () => {
    vi.stubGlobal("btoa", (value: string) =>
      Buffer.from(value, "binary").toString("base64")
    );
    vi.stubGlobal("atob", (value: string) =>
      Buffer.from(value, "base64").toString("binary")
    );

    const contactUrl = buildInviteUrl("https://nada.example", {
      version: 1,
      pubkeyHash: "contact-pubkey-hash-123",
      publicKey: "public-key-public-key-public-key-public-key"
    });
    const groupUrl = buildGroupInviteUrl("https://nada.example", {
      version: 1,
      kind: "group",
      groupId: "group-123",
      title: "Launch",
      ownerPubkeyHash: "owner-pubkey-hash-123",
      memberPubkeyHashes: ["owner-pubkey-hash-123"],
      senderKeyPackage: "sender-key-package"
    });

    expect(parseInviteInput(contactUrl)?.pubkeyHash).toBe(
      "contact-pubkey-hash-123"
    );
    expect(parseGroupInviteInput(groupUrl)?.groupId).toBe("group-123");
  });
});
