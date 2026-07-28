import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { CamposClaims } from "./campos-sso";

export const CAMPOS_ADMIN_SESSION_COOKIE = "nada_campos_admin";
export const CAMPOS_ADMIN_SESSION_TTL_SECONDS = 15 * 60;

const ADMIN_ROLES = new Set([
  "institution_owner",
  "institution_admin",
  "super_admin",
]);

const SessionSchema = z.object({
  v: z.literal(1),
  sub: z.string().min(1).max(200),
  institutionId: z.string().min(1).max(200),
  institutionSlug: z.string().min(1).max(120),
  roles: z.array(z.string().min(1).max(100)).min(1).max(20),
  iat: z.number().int(),
  exp: z.number().int(),
}).strict();

export type CamposAdminSession = z.infer<typeof SessionSchema>;

export function hasNadaAdminRole(roles: readonly string[]): boolean {
  return roles.some((role) => ADMIN_ROLES.has(role.trim().toLowerCase()));
}

function sessionKey(secret = process.env["CAMPOS_SSO_SECRET"]): Buffer {
  const normalized = secret?.trim();
  if (!normalized || Buffer.byteLength(normalized) < 32) {
    throw new Error("CAMPOS_SSO_SECRET is not configured securely");
  }
  return createHmac("sha256", normalized)
    .update("nada:campos-admin-session:v1")
    .digest();
}

function sign(encodedPayload: string, secret?: string): string {
  return createHmac("sha256", sessionKey(secret))
    .update(encodedPayload)
    .digest("base64url");
}

export function issueCamposAdminSession(
  claims: CamposClaims,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret?: string
): string {
  if (claims.launchContext !== "admin" || !hasNadaAdminRole(claims.roles)) {
    throw new Error("CampOS identity is not authorized for NADA administration");
  }

  const payload: CamposAdminSession = {
    v: 1,
    sub: claims.userId,
    institutionId: claims.institutionId,
    institutionSlug: claims.institutionSlug,
    roles: [...claims.roles],
    iat: nowSeconds,
    exp: nowSeconds + CAMPOS_ADMIN_SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyCamposAdminSession(
  value: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret?: string
): CamposAdminSession | null {
  if (!value || value.length > 8_192) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts as [string, string];

  try {
    const expected = Buffer.from(sign(encoded, secret), "base64url");
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }
    const parsed = SessionSchema.safeParse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    );
    if (!parsed.success) return null;
    const session = parsed.data;
    if (
      session.iat > nowSeconds + 30 ||
      session.exp <= nowSeconds ||
      session.exp <= session.iat ||
      session.exp - session.iat > CAMPOS_ADMIN_SESSION_TTL_SECONDS ||
      !hasNadaAdminRole(session.roles)
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}
