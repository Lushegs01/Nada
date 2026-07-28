import { describe, expect, it } from "vitest";

import {
  issueCamposAdminSession,
  verifyCamposAdminSession,
} from "../src/lib/campos-admin-session";
import type { CamposClaims } from "../src/lib/campos-sso";

const SECRET = "a-dedicated-nada-campos-secret-that-is-long-enough";

const claims: CamposClaims = {
  userId: "admin-1",
  camposId: null,
  matricNumber: null,
  level: null,
  email: "admin@example.edu",
  firstName: "Ada",
  lastName: "Admin",
  roles: ["institution_admin"],
  launchContext: "admin",
  institutionId: "institution-1",
  institutionSlug: "demo-university",
  jti: "handoff-1",
};

describe("NADA CampOS administrator session", () => {
  it("round-trips a short-lived tenant-bound session", () => {
    const value = issueCamposAdminSession(claims, 1_000, SECRET);
    expect(verifyCamposAdminSession(value, 1_001, SECRET)).toMatchObject({
      sub: "admin-1",
      institutionId: "institution-1",
      institutionSlug: "demo-university",
      roles: ["institution_admin"],
    });
  });

  it("rejects tampering and expiration", () => {
    const value = issueCamposAdminSession(claims, 1_000, SECRET);
    expect(
      verifyCamposAdminSession(`${value}tampered`, 1_001, SECRET)
    ).toBeNull();
    expect(verifyCamposAdminSession(value, 1_901, SECRET)).toBeNull();
  });

  it("does not issue an admin session from a student launch", () => {
    expect(() =>
      issueCamposAdminSession(
        { ...claims, roles: ["student"], launchContext: "student" },
        1_000,
        SECRET
      )
    ).toThrow(/not authorized/);
  });
});
