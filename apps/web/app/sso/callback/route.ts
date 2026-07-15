import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveCamposRedirectPath, verifyCamposToken } from "@/lib/campos-sso";

// node:crypto (used by the token verifier) requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SSO landing for students arriving from CampOS Core.
//
// CampOS redirects with a short-lived one-time authorization code. NADA
// exchanges it server-to-server, keeping identity claims out of browser URLs.
//
// NADA is global across institutions, but a CampOS launch is accepted only
// when the verified student claims include both institutionId and
// institutionSlug. Those claims are validated, not used as a tenant match.
//
// Policy (chosen): "verify and open the app". We only VERIFY that this is a
// genuine, unexpired CampOS hand-off, then drop the student into NADA, where
// their normal on-device keypair identity takes over. We intentionally do NOT
// bind the CampOS identity to the anonymous keypair — that preserves NADA's
// anonymity. A stronger integration (granting a campus-verified capability to
// the keypair) can build on top of verifyCamposToken later.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
    return redirectWithError("missing_code");
  }

  const token = await exchangeCamposCode(code);
  if (!token) return redirectWithError("exchange_failed");

  const result = verifyCamposToken(token);
  if (!result.ok) {
    return redirectWithError(result.reason);
  }
  if (!result.claims.roles.includes("student")) {
    return redirectWithError("forbidden_role");
  }

  // Keep Location relative. Render terminates TLS in front of the app and the
  // request origin can be its internal localhost:10000 address; rebuilding an
  // absolute URL from req.url would send the browser to that private address.
  return relativeRedirect(resolveCamposRedirectPath(url.searchParams.get("next")));
}

async function exchangeCamposCode(code: string): Promise<string | null> {
  const configured = process.env["CAMPOS_CORE_URL"]?.trim();
  if (!configured) return null;

  try {
    const coreUrl = new URL(configured);
    if (
      coreUrl.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && coreUrl.protocol === "http:")
    ) {
      return null;
    }
    if (
      coreUrl.username ||
      coreUrl.password ||
      coreUrl.search ||
      coreUrl.hash ||
      (coreUrl.pathname !== "" && coreUrl.pathname !== "/")
    ) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(new URL("/api/modules/sso/exchange", coreUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, module: "nada" }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { token?: unknown };
      return typeof payload.token === "string" && payload.token.length <= 8_192
        ? payload.token
        : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

/** Bounce failures to the marketing/launch page with a machine-readable reason. */
function redirectWithError(reason: string): NextResponse {
  return relativeRedirect(`/launch?sso_error=${encodeURIComponent(reason)}`);
}

function relativeRedirect(location: string): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}
