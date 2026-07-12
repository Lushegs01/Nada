import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { resolveCamposRedirectPath, verifyCamposToken } from "@/lib/campos-sso";

// node:crypto (used by the token verifier) requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SSO landing for students arriving from CampOS Core.
//
// CampOS mints a short-lived signed token carrying the student's CampOS identity
// and redirects the browser here as GET /sso/callback?token=...&next=...
//
// Policy (chosen): "verify and open the app". We only VERIFY that this is a
// genuine, unexpired CampOS hand-off, then drop the student into NADA, where
// their normal on-device keypair identity takes over. We intentionally do NOT
// bind the CampOS identity to the anonymous keypair — that preserves NADA's
// anonymity. A stronger integration (granting a campus-verified capability to
// the keypair) can build on top of verifyCamposToken later.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token || token.length > 8_192) {
    return redirectWithError("missing_token");
  }

  const result = verifyCamposToken(token);
  if (!result.ok) {
    return redirectWithError(result.reason);
  }

  // Keep Location relative. Render terminates TLS in front of the app and the
  // request origin can be its internal localhost:10000 address; rebuilding an
  // absolute URL from req.url would send the browser to that private address.
  return relativeRedirect(resolveCamposRedirectPath(url.searchParams.get("next")));
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
