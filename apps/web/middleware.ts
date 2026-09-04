import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy } from "@/lib/content-security-policy";

/**
 * Issues a per-response CSP nonce.
 *
 * `script-src` previously carried `'unsafe-inline'`, which meant any injected
 * `<script>` would execute — and in this app that reaches the identity private
 * key and the whole decrypted message store in IndexedDB. A nonce closes that:
 * Next.js reads it from the request header below and stamps it onto the inline
 * bootstrap it emits, so only script this server issued can run.
 *
 * Reading the nonce opts a page into dynamic rendering. That is the cost of the
 * mitigation, and it is worth it here: the HTML shell is small and the client
 * bundle it references is still cached normally.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy({
    nonce,
    relayUrl: process.env["NEXT_PUBLIC_RELAY_URL"],
    isProduction: process.env.NODE_ENV === "production"
  });

  // Next.js looks for the nonce on the *request* header, which is how it knows
  // what to stamp onto its own inline scripts.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Document requests only. Hashed static assets, the service worker and the
     * icons run no script of their own, and putting a per-request nonce on an
     * immutable cached asset would only defeat its caching.
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|logo|icon.svg|sw.js|workbox-|worker-bootstrap.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
