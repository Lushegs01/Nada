import { describe, expect, it } from "vitest";

import { isOriginAllowed, normalizeHost } from "../src/origin";

describe("origin checks", () => {
  it("normalizes host-only and full-origin values", () => {
    const host = "allowed-host";

    expect(normalizeHost(`https://${host}`)).toBe(host);
    expect(normalizeHost(host)).toBe(host);
  });

  it("allows matching hosts only", () => {
    const allowedHost = "allowed-host";
    const otherHost = "other-host";

    expect(isOriginAllowed(`https://${allowedHost}`, allowedHost)).toBe(true);
    expect(isOriginAllowed(`https://${otherHost}`, allowedHost)).toBe(false);
  });
});
