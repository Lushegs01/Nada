import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

// Verifies the short-lived SSO hand-off token minted by CampOS Core when a
// student opens NADA from the CampOS dashboard. NADA receives the token only
// after exchanging the browser's one-time code server-to-server. CampOS signs
// the HS256 JWT with a secret shared with NADA; we re-derive the HMAC and check
// the standard claims.
//
// We verify by hand (node:crypto) rather than pulling in a JWT library — it is a
// single HS256 signature check, matching how the relay hand-rolls its own
// capability tokens. The shared secret lives ONLY on the server.

const EXPECTED_ISSUER = "campos-core";
const EXPECTED_AUDIENCE = "nada";
const CLOCK_TOLERANCE_SECONDS = 30;
const MAX_TOKEN_LIFETIME_SECONDS = 120;
const MIN_PRODUCTION_SECRET_BYTES = 32;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export interface CamposClaims {
  /** CampOS user id (JWT `sub`). */
  readonly userId: string;
  readonly camposId: string | null;
  readonly matricNumber: string | null;
  readonly level: string | null;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: readonly string[];
  /** Institution asserted by CampOS for this launch; NADA does not tenant-match it. */
  readonly institutionId: string;
  readonly institutionSlug: string;
  /** Unique token id (JWT `jti`) — usable for one-time-consumption tracking. */
  readonly jti: string;
}

export type CamposVerifyFailure =
  | "unconfigured"
  | "malformed"
  | "bad_algorithm"
  | "bad_signature"
  | "bad_issuer"
  | "bad_audience"
  | "expired"
  | "invalid_claims";

export type CamposVerifyResult =
  | { readonly ok: true; readonly claims: CamposClaims }
  | { readonly ok: false; readonly reason: CamposVerifyFailure };

/**
 * Resolve the post-SSO destination without allowing a cross-origin redirect.
 *
 * WHATWG URL parsing treats backslashes as path separators for HTTP(S) URLs,
 * so a value such as `/\\evil.example` can otherwise become protocol-relative.
 * We reject those values first and still enforce the resolved origin as a
 * second line of defence.
 */
export function resolveCamposRedirectPath(next: string | null): string {
  const fallback = "/";

  if (!next) return fallback;

  // Inspect repeated percent-decoding as well as the original value. A path
  // such as `/%252f%252fevil.example` looks local until another layer decodes
  // it twice, at which point it becomes protocol-relative. Reject on any pass.
  let decoded = next;
  for (let pass = 0; pass < 5; pass += 1) {
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      CONTROL_CHARACTER_PATTERN.test(decoded)
    ) {
      return fallback;
    }

    let nextDecoded: string;
    try {
      nextDecoded = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
    if (nextDecoded === decoded) break;
    decoded = nextDecoded;

    // Five nested encodings are not useful for a local application path. Fail
    // closed if the final pass still contains an encoded slash or backslash.
    if (pass === 4 && /%(?:2f|5c|25)/i.test(decoded)) return fallback;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(decoded)
  ) {
    return fallback;
  }

  try {
    const base = new URL("https://nada.invalid");
    const target = new URL(next, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

const HeaderSchema = z.object({
  alg: z.string(),
  typ: z.string().optional()
});

const PayloadSchema = z.object({
  sub: z.string().min(1),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().min(1),
  email: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  roles: z.array(z.string()).default([]),
  camposId: z.string().nullable().default(null),
  matricNumber: z.string().nullable().default(null),
  level: z.string().nullable().default(null),
  // NADA is intentionally global across institutions, but every CampOS launch
  // must still be attributable to a real institution. We validate presence
  // without matching either value to a NADA-side tenant configuration.
  institutionId: z.string().trim().min(1),
  institutionSlug: z.string().trim().min(1)
});

function decodeJson(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
}

function audienceMatches(aud: string | readonly string[]): boolean {
  return Array.isArray(aud) ? aud.includes(EXPECTED_AUDIENCE) : aud === EXPECTED_AUDIENCE;
}

/**
 * Verify a CampOS SSO token. Returns the claims on success, or a typed failure
 * reason. The secret defaults to `CAMPOS_SSO_SECRET` and must match the value
 * CampOS Core signs with `SSO_JWT_SECRET_NADA` (or its shared
 * `SSO_JWT_SECRET` fallback). Production deliberately rejects a missing or
 * shorter-than-32-byte secret.
 */
export function verifyCamposToken(
  token: string,
  secret: string | undefined = process.env["CAMPOS_SSO_SECRET"]
): CamposVerifyResult {
  const configuredSecret = secret?.trim();
  if (
    !configuredSecret ||
    (process.env.NODE_ENV === "production" &&
      new TextEncoder().encode(configuredSecret).byteLength < MIN_PRODUCTION_SECRET_BYTES)
  ) {
    return { ok: false, reason: "unconfigured" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "malformed" };
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  try {
    const header = HeaderSchema.safeParse(decodeJson(headerB64));
    if (!header.success) {
      return { ok: false, reason: "malformed" };
    }
    // Pin the algorithm to prevent "alg confusion" (e.g. an attacker sending none).
    if (header.data.alg !== "HS256") {
      return { ok: false, reason: "bad_algorithm" };
    }

    const expected = createHmac("sha256", configuredSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest();
    const actual = Buffer.from(signatureB64, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return { ok: false, reason: "bad_signature" };
    }

    const parsed = PayloadSchema.safeParse(decodeJson(payloadB64));
    if (!parsed.success) {
      return { ok: false, reason: "invalid_claims" };
    }
    const payload = parsed.data;

    if (payload.iss !== EXPECTED_ISSUER) {
      return { ok: false, reason: "bad_issuer" };
    }
    if (!audienceMatches(payload.aud)) {
      return { ok: false, reason: "bad_audience" };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > MAX_TOKEN_LIFETIME_SECONDS
    ) {
      return { ok: false, reason: "invalid_claims" };
    }
    if (payload.exp + CLOCK_TOLERANCE_SECONDS < nowSeconds) {
      return { ok: false, reason: "expired" };
    }

    return {
      ok: true,
      claims: {
        userId: payload.sub,
        camposId: payload.camposId,
        matricNumber: payload.matricNumber,
        level: payload.level,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        roles: payload.roles,
        institutionId: payload.institutionId,
        institutionSlug: payload.institutionSlug,
        jti: payload.jti
      }
    };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
