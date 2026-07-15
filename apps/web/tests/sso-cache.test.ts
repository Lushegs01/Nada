import { describe, expect, it } from "vitest";

import { isSensitiveSsoNavigation } from "../src/lib/sso-cache";

describe("isSensitiveSsoNavigation", () => {
  it("bypasses runtime caching for the one-time SSO callback regardless of query", () => {
    expect(
      isSensitiveSsoNavigation(
        new URL("https://nada.example/sso/callback?code=one-time-code&next=%2F"),
        true
      )
    ).toBe(true);
  });

  it("bypasses runtime caching for the SSO error landing state", () => {
    expect(
      isSensitiveSsoNavigation(
        new URL("https://nada.example/launch?sso_error=exchange_failed"),
        true
      )
    ).toBe(true);
  });

  it.each([
    ["normal launch", "https://nada.example/launch", true],
    ["normal page", "https://nada.example/whispers", true],
    ["cross-origin callback", "https://other.example/sso/callback?code=one-time-code", false]
  ])("does not bypass runtime caching for %s", (_case, href, sameOrigin) => {
    expect(isSensitiveSsoNavigation(new URL(href), sameOrigin)).toBe(false);
  });
});
