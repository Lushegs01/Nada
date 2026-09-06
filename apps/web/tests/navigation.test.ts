import { describe, expect, it } from "vitest";

import {
  ALL_NAV,
  CHAT_FILTERS,
  PRIMARY_NAV,
  SETTINGS_NAV,
  isSecondaryTab,
  primaryTabFor,
  tabBadge,
  tabTitle
} from "../src/lib/navigation";

/**
 * The navigators used to share a flat list of eight destinations, so the shape
 * of the hierarchy lived only in whichever component happened to render it.
 * These lock the hierarchy itself: what is primary, what is a view inside
 * something else, and which entry lights up for each screen.
 */
describe("primary navigation", () => {
  it("offers three communication destinations plus Settings", () => {
    expect(PRIMARY_NAV.map((item) => item.id)).toEqual(["chats", "whispers", "contest"]);
    expect(SETTINGS_NAV.id).toBe("settings");
    expect(ALL_NAV.map((item) => item.id)).toEqual([
      "chats",
      "whispers",
      "contest",
      "settings"
    ]);
  });

  it("keeps notifications, profile, groups and status out of the navigators", () => {
    const ids = ALL_NAV.map((item) => item.id) as string[];
    for (const removed of ["alerts", "profile", "groups", "status"]) {
      expect(ids).not.toContain(removed);
    }
  });

  it("gives every entry an accessible label and a hint", () => {
    for (const item of ALL_NAV) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.hint.length).toBeGreaterThan(0);
    }
  });
});

describe("active state", () => {
  it("highlights a primary destination for itself", () => {
    expect(primaryTabFor("chats")).toBe("chats");
    expect(primaryTabFor("whispers")).toBe("whispers");
    expect(primaryTabFor("contest")).toBe("contest");
    expect(primaryTabFor("settings")).toBe("settings");
  });

  it("keeps Chats active inside Status", () => {
    // Status is a view within Chats now; it must not read as somewhere else.
    expect(primaryTabFor("status")).toBe("chats");
  });

  it("routes a profile to whoever owns it", () => {
    // Your own profile is the account area; a ghost's is reached from Whispers,
    // and highlighting Settings there would claim you are editing your account.
    expect(primaryTabFor("profile", { ownProfile: true })).toBe("settings");
    expect(primaryTabFor("profile", { ownProfile: false })).toBe("whispers");
  });

  it("claims no destination for notifications", () => {
    // The bell is a global utility, so nothing in the navigators lights up.
    expect(primaryTabFor("alerts")).toBeNull();
  });

  it("marks the screens reached from inside the app as secondary", () => {
    expect(isSecondaryTab("status")).toBe(true);
    expect(isSecondaryTab("alerts")).toBe(true);
    expect(isSecondaryTab("profile")).toBe(true);
    expect(isSecondaryTab("chats")).toBe(false);
    expect(isSecondaryTab("settings")).toBe(false);
  });
});

describe("titles and badges", () => {
  it("shows the brand on Chats and a name everywhere else", () => {
    expect(tabTitle("chats")).toBe("NADA");
    expect(tabTitle("whispers")).toBe("Whispers");
    expect(tabTitle("alerts")).toBe("Alerts");
    expect(tabTitle("nonsense")).toBe("NADA");
  });

  it("badges only Chats — alert counts belong to the header bell", () => {
    expect(tabBadge("chats", 7)).toBe(7);
    expect(tabBadge("whispers", 7)).toBe(0);
    expect(tabBadge("settings", 7)).toBe(0);
  });
});

describe("chat filters", () => {
  it("presents groups as a slice of one conversation list", () => {
    expect(CHAT_FILTERS.map((filter) => filter.id)).toEqual([
      "all",
      "direct",
      "groups",
      "unread"
    ]);
  });
});
