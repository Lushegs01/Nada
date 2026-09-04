import { describe, expect, it } from "vitest";

import {
  categoryLabel,
  countdownTo,
  formatMoney,
  registrationOpen,
  statusLabel,
  type Contest
} from "@/lib/contest";

/**
 * The client's own arithmetic. Everything that decides a score happens on the
 * relay; what is left here is presentation, and presentation of money and
 * deadlines is still worth getting exactly right.
 */

function contest(overrides: Partial<Contest> = {}): Contest {
  const now = Date.now();
  return {
    id: "00000000-0000-4000-8000-000000000000",
    name: "September League",
    slug: "september-league",
    description: "",
    status: "ACTIVE",
    startAt: now - 1_000,
    endAt: now + 86_400_000,
    registrationStartAt: null,
    registrationEndAt: null,
    entryFeeMinor: 0,
    entryCurrency: "NGN",
    prizeAmountMinor: 3_000_000,
    prizeCurrency: "NGN",
    maxParticipants: null,
    rulesVersion: 1,
    scoring: {
      points: [],
      caps: {
        dailyPointsPerParticipant: 500,
        perActorPairPoints: 30,
        actorPairWindowMs: 86_400_000,
        perSourceEntityPoints: 120,
        dailyEventsPerType: {}
      },
      diminishing: { fullValueInteractions: 3, decay: 0.5, floor: 0 },
      newIdentity: { windowMs: 604_800_000, actorMultiplier: 0.25 },
      challenges: [],
      exclusions: { selfInteraction: true, blockedEventTypes: [] }
    },
    ...overrides
  };
}

describe("money formatting", () => {
  it("renders minor units as a whole-currency amount", () => {
    // ₦30,000 crosses the wire as 3,000,000 kobo; a float would lose nairas.
    expect(formatMoney(3_000_000, "NGN")).toContain("30,000");
    expect(formatMoney(0, "NGN")).toContain("0");
  });

  it("keeps the fractional part when there is one", () => {
    expect(formatMoney(1_250, "USD")).toContain("12.50");
  });

  it("falls back rather than throwing on an unknown currency code", () => {
    expect(formatMoney(1_000, "XYZ")).toContain("10");
  });
});

describe("countdown", () => {
  const base = Date.UTC(2026, 8, 4, 12, 0, 0);

  it("breaks a remaining span into days, hours, minutes and seconds", () => {
    const target = base + 17 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000 + 30_000;
    const remaining = countdownTo(target, base);
    expect(remaining).toMatchObject({ days: 17, hours: 4, minutes: 12, seconds: 30 });
    expect(remaining.expired).toBe(false);
  });

  it("clamps a past deadline to zero rather than counting backwards", () => {
    const remaining = countdownTo(base - 10_000, base);
    expect(remaining).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(remaining.expired).toBe(true);
  });
});

describe("registration window", () => {
  const now = Date.now();

  it("is open while a contest is taking entries", () => {
    expect(registrationOpen(contest({ status: "REGISTRATION_OPEN" }), now)).toBe(true);
    expect(registrationOpen(contest({ status: "ACTIVE" }), now)).toBe(true);
  });

  it("is closed once the contest is frozen or finished", () => {
    for (const status of ["DRAFT", "FROZEN", "UNDER_REVIEW", "FINALIZED", "CANCELLED"] as const) {
      expect(registrationOpen(contest({ status }), now)).toBe(false);
    }
  });

  it("respects an explicit registration deadline", () => {
    expect(
      registrationOpen(contest({ registrationEndAt: now - 1_000 }), now)
    ).toBe(false);
    expect(
      registrationOpen(contest({ registrationEndAt: now + 1_000 }), now)
    ).toBe(true);
  });

  it("respects a registration opening time", () => {
    expect(
      registrationOpen(contest({ registrationStartAt: now + 60_000 }), now)
    ).toBe(false);
  });

  it("is closed after the contest itself has ended", () => {
    expect(registrationOpen(contest({ endAt: now - 1 }), now)).toBe(false);
  });
});

describe("labels", () => {
  it("names every contest status", () => {
    expect(statusLabel("REGISTRATION_OPEN")).toBe("Registration open");
    expect(statusLabel("UNDER_REVIEW")).toBe("Under review");
  });

  it("names every score category, and passes unknown ones through", () => {
    expect(categoryLabel("engagement_received")).toBe("Engagement received");
    expect(categoryLabel("challenges")).toBe("Challenges");
    expect(categoryLabel("mystery")).toBe("mystery");
  });
});
