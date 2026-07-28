import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/sso/callback/route";

const SECRET = "test-shared-campos-secret-value-long";

function mintToken(
  roles: readonly string[] = ["student"],
  launchContext?: "student" | "lecturer" | "admin"
): string {
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
    roles,
    ...(launchContext ? { launchContext } : {}),
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("CampOS SSO callback redirects", () => {
  it("returns a relative Location behind an internal Render origin", async () => {
    vi.stubEnv("CAMPOS_SSO_SECRET", SECRET);
    vi.stubEnv("CAMPOS_CORE_URL", "https://campos.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: mintToken() }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    const request = new NextRequest(
      `https://localhost:10000/sso/callback?code=${"a".repeat(43)}&next=%2Fwhispers`
    );

    const response = await GET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/whispers");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://campos.example/api/modules/sso/exchange"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "a".repeat(43), module: "nada" }),
        redirect: "error"
      })
    );
  });

  it("keeps error redirects relative too", async () => {
    const response = await GET(
      new NextRequest("https://localhost:10000/sso/callback")
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/launch?sso_error=missing_code"
    );
  });

  it("fails closed when the one-time code cannot be exchanged", async () => {
    vi.stubEnv("CAMPOS_CORE_URL", "https://campos.example");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));

    const response = await GET(
      new NextRequest(`https://localhost:10000/sso/callback?code=${"b".repeat(43)}`)
    );

    expect(response.headers.get("location")).toBe("/launch?sso_error=exchange_failed");
  });

  it("opens the institutional admin workspace and establishes a protected session", async () => {
    vi.stubEnv("CAMPOS_SSO_SECRET", SECRET);
    vi.stubEnv("CAMPOS_CORE_URL", "https://campos.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            token: mintToken(["institution_admin"], "admin")
          }),
          {
          status: 200,
          headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    const response = await GET(
      new NextRequest(`https://localhost:10000/sso/callback?code=${"c".repeat(43)}`)
    );

    expect(response.headers.get("location")).toBe("/admin");
    expect(response.headers.get("set-cookie")).toContain("nada_campos_admin=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it("rejects an administrator token without the signed admin launch context", async () => {
    vi.stubEnv("CAMPOS_SSO_SECRET", SECRET);
    vi.stubEnv("CAMPOS_CORE_URL", "https://campos.example");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: mintToken(["institution_admin"]) }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const response = await GET(
      new NextRequest(`https://localhost:10000/sso/callback?code=${"e".repeat(43)}`)
    );

    expect(response.headers.get("location")).toBe("/launch?sso_error=forbidden_role");
  });

  it.each([
    "http://campos.example",
    "https://user:password@campos.example",
    "https://campos.example/a/path",
    "https://campos.example?tenant=demo",
    "https://campos.example/#fragment"
  ])("rejects an unsafe production CAMPOS_CORE_URL: %s", async (coreUrl) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAMPOS_CORE_URL", coreUrl);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new NextRequest(`https://localhost:10000/sso/callback?code=${"d".repeat(43)}`)
    );

    expect(response.headers.get("location")).toBe("/launch?sso_error=exchange_failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
