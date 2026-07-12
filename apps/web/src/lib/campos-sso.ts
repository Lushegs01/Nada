import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

// Verifies the short-lived SSO hand-off token minted by CampOS Core when a
// student opens NADA from the CampOS dashboard. CampOS signs an HS256 JWT with a
// secret shared with NADA; we re-derive the HMAC and check the standard claims.
//
// We verify by hand (node:crypto) rather than pulling in a JWT library — it is a
// single HS256 signature check, matching how the relay hand-rolls its own
// capability tokens. The shared secret lives ONLY on the server.

const EXPECTED_ISSUER = "campos-core";
const EXPECTED_AUDIENCE = "nada";
const CLOCK_TOLERANCE_SECONDS = 30;
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
  readonly institutionId: string | null;
  readonly institutionSlug: string | null;
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
export function resolveCamposRedirectUrl(
  requestUrl: string,
  next: string | null
): URL {
  const request = new URL(requestUrl);
  const fallback = new URL("/", request);

  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(next)
  ) {
    return fallback;
  }

  try {
    const target = new URL(next, request);
    return target.origin === request.origin ? target : fallback;
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
  exp: z.number(),
  jti: z.string().min(1),
  email: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  roles: z.array(z.string()).default([]),
  camposId: z.string().nullable().default(null),
  matricNumber: z.string().nullable().default(null),
  level: z.string().nullable().default(null),
  institutionId: z.string().nullable().default(null),
  institutionSlug: z.string().nullable().default(null)
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
 * CampOS Core signs with (`SSO_JWT_SECRET`, falling back to its `JWT_SECRET`).
 */
export function verifyCamposToken(
  token: string,
  secret: string | undefined = process.env["CAMPOS_SSO_SECRET"]
): CamposVerifyResult {
  if (!secret || secret.length === 0) {
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

    const expected = createHmac("sha256", secret)
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
