import { describe, expect, it } from "vitest";

import { ALLOWED_TRANSITIONS, canTransition } from "../src/contest/lifecycle";
import { detectAutomation } from "../src/contest/risk";
import {
  bandAtLeast,
  categoryFor,
  cooldownFor,
  dailyEventCap,
  defaultRules,
  diminishingMultiplier,
  isChallengeEvent,
  isSelfAuthored,
  parseRules,
  periodKey,
  pointsFor,
  riskBand,
  riskMultiplier,
  utcDayStart,
  utcWeekStart
} from "../src/contest/rules";
import { buildIdempotencyKey } from "../src/contest/service";

describe("contest rules", () => {
  it("fills every default from a partial ruleset", () => {
    // Operators supply fragments; evaluation needs a complete ruleset, and a
    // missing cap must never read as "no cap".
    const rules = parseRules({ points: { ECHO_CREATED: 7 } });
    expect(pointsFor(rules, "ECHO_CREATED")).toBe(7);
    expect(rules.caps.dailyPointsPerParticipant).toBeGreaterThan(0);
    expect(rules.caps.perActorPairPoints).toBeGreaterThan(0);
    expect(rules.risk.bands.highRisk).toBe(81);
  });

  it("falls back to the default ruleset when stored rules are malformed", () => {
    const rules = parseRules({ points: { ECHO_CREATED: "ten" } });
    expect(pointsFor(rules, "ECHO_CREATED")).toBe(
      pointsFor(defaultRules(), "ECHO_CREATED")
    );
  });

  it("values engagement received above repeatable actions", () => {
    // The whole anti-spam posture rests on this: writing something people
    // respond to must beat pressing a button.
    const rules = defaultRules();
    expect(pointsFor(rules, "REFLECTION_RECEIVED")).toBeGreaterThan(
      pointsFor(rules, "RIPPLE_CREATED")
    );
    expect(pointsFor(rules, "ECHO_CREATED")).toBeGreaterThan(
      pointsFor(rules, "REACTION_RECEIVED")
    );
  });

  it("returns zero for an event type the ruleset does not price", () => {
    const rules = parseRules({ points: {} });
    expect(pointsFor(rules, "ECHO_CREATED")).toBe(0);
  });

  it("exposes per-type caps and cooldowns, or null when unset", () => {
    const rules = parseRules({
      caps: { dailyEventsPerType: { ECHO_CREATED: 3 }, cooldownMsPerEventType: { ECHO_CREATED: 500 } }
    });
    expect(dailyEventCap(rules, "ECHO_CREATED")).toBe(3);
    expect(dailyEventCap(rules, "REACTION_RECEIVED")).toBeNull();
    expect(cooldownFor(rules, "ECHO_CREATED")).toBe(500);
    expect(cooldownFor(rules, "REACTION_RECEIVED")).toBe(0);
  });
});

describe("diminishing returns", () => {
  const rules = parseRules({
    diminishing: { fullValueInteractions: 3, decay: 0.5, floor: 0 }
  });

  it("pays full value for the allowance", () => {
    expect(diminishingMultiplier(rules, 0)).toBe(1);
    expect(diminishingMultiplier(rules, 2)).toBe(1);
  });

  it("halves each interaction past the allowance", () => {
    expect(diminishingMultiplier(rules, 3)).toBe(0.5);
    expect(diminishingMultiplier(rules, 4)).toBe(0.25);
    expect(diminishingMultiplier(rules, 5)).toBe(0.125);
  });

  it("never falls below the configured floor", () => {
    const floored = parseRules({
      diminishing: { fullValueInteractions: 1, decay: 0.5, floor: 0.2 }
    });
    expect(diminishingMultiplier(floored, 20)).toBe(0.2);
  });
});

describe("risk bands", () => {
  const rules = defaultRules();

  it("maps a cumulative score onto its band", () => {
    expect(riskBand(rules, 0)).toBe("LOW");
    expect(riskBand(rules, 20)).toBe("LOW");
    expect(riskBand(rules, 21)).toBe("WATCH");
    expect(riskBand(rules, 51)).toBe("SUSPICIOUS");
    expect(riskBand(rules, 81)).toBe("HIGH_RISK");
    expect(riskBand(rules, 1000)).toBe("HIGH_RISK");
  });

  it("orders bands by severity", () => {
    expect(bandAtLeast("HIGH_RISK", "SUSPICIOUS")).toBe(true);
    expect(bandAtLeast("WATCH", "SUSPICIOUS")).toBe(false);
    expect(bandAtLeast("LOW", "LOW")).toBe(true);
  });

  it("reduces then withholds points as risk climbs", () => {
    expect(riskMultiplier(rules, "LOW")).toBe(1);
    expect(riskMultiplier(rules, "SUSPICIOUS")).toBe(0.5);
    expect(riskMultiplier(rules, "HIGH_RISK")).toBe(0);
  });
});

describe("automation detection", () => {
  it("flags interactions arriving on a metronome", () => {
    const base = 1_700_000_000_000;
    const timestamps = [0, 1, 2, 3, 4, 5].map((i) => base - i * 5_000);
    expect(detectAutomation(timestamps, 750).detected).toBe(true);
  });

  it("leaves human-irregular timing alone", () => {
    const base = 1_700_000_000_000;
    const timestamps = [0, 3_000, 41_000, 42_500, 190_000, 400_000].map((o) => base - o);
    expect(detectAutomation(timestamps, 750).detected).toBe(false);
  });

  it("refuses to judge too small a sample", () => {
    expect(detectAutomation([1, 2], 750).detected).toBe(false);
    expect(detectAutomation([], 750).detected).toBe(false);
  });
});

describe("event classification", () => {
  it("knows which events have no second party", () => {
    expect(isSelfAuthored("ECHO_CREATED")).toBe(true);
    expect(isSelfAuthored("REFLECTION_CREATED")).toBe(true);
    expect(isSelfAuthored("DAILY_CHALLENGE_COMPLETED")).toBe(true);
    expect(isSelfAuthored("REACTION_RECEIVED")).toBe(false);
    expect(isSelfAuthored("FOLLOW_RECEIVED")).toBe(false);
  });

  it("never lets a challenge award another challenge", () => {
    expect(isChallengeEvent("DAILY_CHALLENGE_COMPLETED")).toBe(true);
    expect(isChallengeEvent("WEEKLY_CHALLENGE_COMPLETED")).toBe(true);
    expect(isChallengeEvent("ECHO_CREATED")).toBe(false);
  });

  it("sorts every event type into a breakdown category", () => {
    expect(categoryFor("ECHO_CREATED")).toBe("content");
    expect(categoryFor("REACTION_RECEIVED")).toBe("engagement_received");
    expect(categoryFor("COMMUNITY_ACTIVITY")).toBe("community");
    expect(categoryFor("WEEKLY_CHALLENGE_COMPLETED")).toBe("challenges");
  });
});

describe("period boundaries", () => {
  it("starts UTC days at midnight", () => {
    const noon = Date.UTC(2026, 8, 4, 12, 30, 15);
    expect(utcDayStart(noon)).toBe(Date.UTC(2026, 8, 4));
  });

  it("starts UTC weeks on Monday", () => {
    // 2026-09-04 is a Friday; its week begins Monday 2026-08-31.
    const friday = Date.UTC(2026, 8, 4, 9, 0, 0);
    expect(utcWeekStart(friday)).toBe(Date.UTC(2026, 7, 31));
    const monday = Date.UTC(2026, 7, 31, 0, 0, 0);
    expect(utcWeekStart(monday)).toBe(monday);
    const sunday = Date.UTC(2026, 8, 6, 23, 59, 59);
    expect(utcWeekStart(sunday)).toBe(Date.UTC(2026, 7, 31));
  });

  it("gives every moment in a period the same key", () => {
    const monday = Date.UTC(2026, 7, 31, 1, 0, 0);
    const sunday = Date.UTC(2026, 8, 6, 22, 0, 0);
    expect(periodKey("weekly", monday)).toBe(periodKey("weekly", sunday));
    expect(periodKey("daily", monday)).not.toBe(periodKey("daily", sunday));
  });
});

describe("idempotency keys", () => {
  const base = {
    eventType: "REACTION_RECEIVED" as const,
    participantPubkeyHash: "a".repeat(64),
    actorPubkeyHash: "b".repeat(64),
    sourceEntityType: "echo" as const,
    sourceEntityId: "echo-1"
  };

  it("is stable across retries of the same interaction", () => {
    expect(buildIdempotencyKey("contest-1", base)).toBe(
      buildIdempotencyKey("contest-1", base)
    );
  });

  it("separates two different reactors on one Echo", () => {
    // One Echo legitimately earns its author points from many people; those
    // are distinct events, not duplicates.
    expect(buildIdempotencyKey("contest-1", base)).not.toBe(
      buildIdempotencyKey("contest-1", { ...base, actorPubkeyHash: "c".repeat(64) })
    );
  });

  it("separates contests, event types and source entities", () => {
    const key = buildIdempotencyKey("contest-1", base);
    expect(buildIdempotencyKey("contest-2", base)).not.toBe(key);
    expect(
      buildIdempotencyKey("contest-1", { ...base, eventType: "RIPPLE_RECEIVED" })
    ).not.toBe(key);
    expect(
      buildIdempotencyKey("contest-1", { ...base, sourceEntityId: "echo-2" })
    ).not.toBe(key);
  });
});

describe("contest state machine", () => {
  it("refuses to skip the freeze and review a prize depends on", () => {
    expect(canTransition("ACTIVE", "FINALIZED")).toBe(false);
    expect(canTransition("ACTIVE", "UNDER_REVIEW")).toBe(false);
    expect(canTransition("FROZEN", "FINALIZED")).toBe(false);
    expect(canTransition("ACTIVE", "FROZEN")).toBe(true);
    expect(canTransition("FROZEN", "UNDER_REVIEW")).toBe(true);
    expect(canTransition("UNDER_REVIEW", "FINALIZED")).toBe(true);
  });

  it("lets a review that found a problem go back and re-reconcile", () => {
    expect(canTransition("UNDER_REVIEW", "FROZEN")).toBe(true);
  });

  it("treats FINALIZED and CANCELLED as terminal", () => {
    expect(ALLOWED_TRANSITIONS.FINALIZED).toHaveLength(0);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toHaveLength(0);
  });

  it("allows cancellation from every live state", () => {
    for (const status of ["DRAFT", "REGISTRATION_OPEN", "ACTIVE", "FROZEN", "UNDER_REVIEW"] as const) {
      expect(canTransition(status, "CANCELLED")).toBe(true);
    }
  });
});
