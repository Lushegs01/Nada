import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  resolveCamposRedirectUrl,
  verifyCamposToken
} from "../src/lib/campos-sso";

const SECRET = "test-shared-campos-secret-value";

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

interface MintOptions {
  readonly alg?: string;
  readonly iss?: string;
  readonly aud?: string | readonly string[];
  readonly expiresInSeconds?: number;
  readonly secret?: string;
  readonly overrides?: Record<string, unknown>;
}

/** Mint a token the same way CampOS Core does (HS256 over base64url segments). */
function mint(options: MintOptions = {}): string {
  const {
    alg = "HS256",
    iss = "campos-core",
    aud = "nada",
    expiresInSeconds = 60,
    secret = SECRET,
    overrides = {}
  } = options;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: "user-1",
      iss,
      aud,
      jti: "jti-1",
      iat: nowSeconds,
      exp: nowSeconds + expiresInSeconds,
      email: "student@campos.io",
      firstName: "John",
      lastName: "Doe",
      roles: ["student"],
      camposId: "CP-2024-001",
      matricNumber: "UNI/2020/001",
      level: "400",
      institutionId: "inst-1",
      institutionSlug: "demo-university",
      ...overrides
    })
  );
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("verifyCamposToken", () => {
  it("accepts a valid token and returns the claims", () => {
    const result = verifyCamposToken(mint(), SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.userId).toBe("user-1");
      expect(result.claims.email).toBe("student@campos.io");
      expect(result.claims.roles).toEqual(["student"]);
      expect(result.claims.institutionSlug).toBe("demo-university");
    }
  });

  it("reports 'unconfigured' when no secret is set", () => {
    const result = verifyCamposToken(mint(), undefined);
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = mint({ secret: "some-other-secret" });
    expect(verifyCamposToken(token, SECRET)).toEqual({
      ok: false,
      reason: "bad_signature"
    });
  });

  it("rejects a non-HS256 algorithm (alg confusion)", () => {
    const result = verifyCamposToken(mint({ alg: "none" }), SECRET);
    // A different alg changes the signed header, so this surfaces as bad_algorithm.
    expect(result.ok).toBe(false);
  });

  it("rejects a wrong issuer", () => {
    expect(verifyCamposToken(mint({ iss: "evil" }), SECRET)).toEqual({
      ok: false,
      reason: "bad_issuer"
    });
  });

  it("rejects a token minted for another module (audience mismatch)", () => {
    expect(verifyCamposToken(mint({ aud: "scanmark" }), SECRET)).toEqual({
      ok: false,
      reason: "bad_audience"
    });
  });

  it("rejects an expired token", () => {
    const token = mint({ expiresInSeconds: -120 });
    expect(verifyCamposToken(token, SECRET)).toEqual({
      ok: false,
      reason: "expired"
    });
  });

  it("rejects a malformed token", () => {
    expect(verifyCamposToken("not-a-jwt", SECRET)).toEqual({
      ok: false,
      reason: "malformed"
    });
  });

  it("rejects a token missing required claims", () => {
    const token = mint({ overrides: { email: undefined } });
    expect(verifyCamposToken(token, SECRET)).toEqual({
      ok: false,
      reason: "invalid_claims"
    });
  });
});

describe("resolveCamposRedirectUrl", () => {
  const requestUrl = "https://nada.example/sso/callback?token=secret";

  it("keeps a relative destination on the NADA origin", () => {
    expect(resolveCamposRedirectUrl(requestUrl, "/whispers?tab=following").href).toBe(
      "https://nada.example/whispers?tab=following"
    );
  });

  it.each([
    null,
    "",
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "/folder\\evil.example/",
    "/\u0000evil.example/"
  ])("falls back to the app root for unsafe next=%s", (next) => {
    expect(resolveCamposRedirectUrl(requestUrl, next).href).toBe(
      "https://nada.example/"
    );
  });
});
