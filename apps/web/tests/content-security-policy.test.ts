import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  deriveConnectSrc
} from "@/lib/content-security-policy";

function directive(csp: string, name: string): string {
  const found = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  if (!found) throw new Error(`missing directive: ${name}`);
  return found;
}

const NONCE = "dGVzdC1ub25jZQ==";

/** Individual source expressions, so a bare scheme can be told from a host. */
function sources(connectSrc: string): string[] {
  return connectSrc.split(/\s+/).filter(Boolean);
}

describe("script-src", () => {
  it("never allows inline script", () => {
    const csp = buildContentSecurityPolicy({
      nonce: NONCE,
      relayUrl: "https://relay.nada.test",
      isProduction: true
    });

    // This app holds an Ed25519 identity key and a decrypted message store in
    // the browser. 'unsafe-inline' means any injected <script> reaches both.
    expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
    expect(directive(csp, "script-src")).toContain(`'nonce-${NONCE}'`);
    expect(directive(csp, "script-src")).toContain("'strict-dynamic'");
  });

  it("keeps wasm-unsafe-eval, which libsodium needs to start", () => {
    const csp = buildContentSecurityPolicy({
      nonce: NONCE,
      relayUrl: undefined,
      isProduction: true
    });
    // Permits WebAssembly compilation only — it does not enable eval().
    expect(directive(csp, "script-src")).toContain("'wasm-unsafe-eval'");
  });

  it("omits the nonce placeholder when no nonce was minted", () => {
    const csp = buildContentSecurityPolicy({
      relayUrl: undefined,
      isProduction: true
    });
    expect(directive(csp, "script-src")).not.toContain("nonce-");
    expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
  });
});

describe("connect-src", () => {
  it("narrows to the configured relay so a compromised page cannot exfiltrate", () => {
    const connect = deriveConnectSrc("https://relay.nada.test", true);
    expect(connect).toContain("https://relay.nada.test");
    expect(connect).toContain("wss://relay.nada.test");
    expect(sources(connect)).not.toContain("https:");
    expect(sources(connect)).not.toContain("wss:");
  });

  it("respects an insecure scheme instead of force-upgrading it", () => {
    // A local or VPN-hosted relay on http/ws must not be rewritten to
    // https/wss, or the policy blocks every relay call the app makes.
    const connect = deriveConnectSrc("http://127.0.0.1:8110", false);
    expect(connect).toContain("http://127.0.0.1:8110");
    expect(connect).toContain("ws://127.0.0.1:8110");
  });

  it("accepts a bare host and assumes https", () => {
    const connect = deriveConnectSrc("relay.nada.test", true);
    expect(connect).toContain("https://relay.nada.test");
  });

  it("does not open up to any origin in production when unconfigured", () => {
    // A bare `https:` scheme source would allow exfiltration to any origin.
    // `https://*.livekit.cloud` is a host source and is not that.
    const connect = deriveConnectSrc(undefined, true);
    expect(sources(connect)).not.toContain("https:");
    expect(sources(connect)).not.toContain("wss:");
    expect(sources(connect)).toContain("'self'");
  });

  it("falls back to a closed policy on a malformed relay value", () => {
    const connect = deriveConnectSrc("http://[not a url", true);
    expect(connect).toContain("'self'");
    expect(connect).not.toContain("not a url");
  });
});

describe("the rest of the policy", () => {
  it("keeps the directives that bound a compromised page", () => {
    const csp = buildContentSecurityPolicy({
      nonce: NONCE,
      relayUrl: "https://relay.nada.test",
      isProduction: true
    });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});
