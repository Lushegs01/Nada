import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/sso/callback/route";

const SECRET = "test-shared-campos-secret-value";

function mintToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: "user-1",
    iss: "campos-core",
    aud: "nada",
    jti: "jti-1",
    iat: now,
    exp: now + 60,
    email: "student@campos.io",
    firstName: "Ada",
    lastName: "Student",
    roles: ["student"],
    camposId: "CP-1",
    matricNumber: "UNI/1",
    level: "400",
    institutionId: "inst-1",
    institutionSlug: "demo"
  });
  const signature = createHmac("sha256", SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

afterEach(() => vi.unstubAllEnvs());

describe("CampOS SSO callback redirects", () => {
  it("returns a relative Location behind an internal Render origin", async () => {
    vi.stubEnv("CAMPOS_SSO_SECRET", SECRET);
    const request = new NextRequest(
      `https://localhost:10000/sso/callback?token=${mintToken()}&next=%2Fwhispers`
    );

    const response = await GET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/whispers");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps error redirects relative too", async () => {
    const response = await GET(
      new NextRequest("https://localhost:10000/sso/callback")
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/launch?sso_error=missing_token"
    );
  });
});
