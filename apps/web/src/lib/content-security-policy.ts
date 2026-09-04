/**
 * The app's Content-Security-Policy, built in one place so the header and the
 * nonce that makes it work can never drift apart.
 *
 * The policy is applied per request by `middleware.ts` rather than statically
 * in `next.config.mjs`, because a nonce has to be fresh for every response.
 */

/**
 * Origins the browser may open a connection to.
 *
 * Derived from the configured relay so a compromised page cannot exfiltrate to
 * an arbitrary host. Falls back to allowing any https/wss in development, where
 * a local setup may have no relay configured yet.
 */
export function deriveConnectSrc(
  relay: string | undefined,
  isProduction: boolean
): string {
  const baseSelf = "'self' data:";
  const livekit = "https://*.livekit.cloud wss://*.livekit.cloud";
  if (!relay) {
    // Production must name its relay explicitly. Keep something usable but
    // still narrower than a blanket `https: wss:`.
    return isProduction ? `${baseSelf} ${livekit}` : `${baseSelf} https: wss: ws:`;
  }
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(relay) ? relay : `https://${relay}`);
    // Respect the configured scheme: an http/ws relay (local dev, LAN, a
    // self-hosted box behind a VPN) must not be force-upgraded, or the policy
    // blocks every relay fetch the app makes.
    const insecure = url.protocol === "http:" || url.protocol === "ws:";
    const httpOrigin = `${insecure ? "http" : "https"}://${url.host}`;
    const wsOrigin = `${insecure ? "ws" : "wss"}://${url.host}`;
    return `${baseSelf} ${httpOrigin} ${wsOrigin} ${livekit}`;
  } catch {
    return `${baseSelf} ${livekit}`;
  }
}

export interface CspOptions {
  /** Per-response nonce. Omitted for non-document responses, which run no script. */
  nonce?: string | undefined;
  relayUrl: string | undefined;
  isProduction: boolean;
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  // 'strict-dynamic' lets the nonced Next.js bootstrap load the chunks it needs
  // without every chunk URL being enumerated in the policy. It also makes
  // browsers that honour it ignore host allowlists in script-src, which is the
  // point: an injected <script> has no nonce and cannot run, whatever its src.
  //
  // 'wasm-unsafe-eval' is required for libsodium to instantiate its WASM
  // module. It permits WebAssembly compilation only — not eval().
  const scriptSrc = options.nonce
    ? `'self' 'nonce-${options.nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`
    : `'self' 'wasm-unsafe-eval'`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${deriveConnectSrc(options.relayUrl, options.isProduction)}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    `script-src ${scriptSrc}`,
    // style-src keeps 'unsafe-inline'. React writes `style={{…}}` as inline
    // style attributes throughout this UI, and those are governed by this
    // directive with no nonce mechanism available to them. Removing it would
    // strip the app's layout, not harden it. The XSS risk that matters for a
    // client holding identity keys is script execution, which is now nonced.
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
  ].join("; ");
}
