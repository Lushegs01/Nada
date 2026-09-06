import { expect, test, type Page } from "@playwright/test";

test.skip(
  !process.env["PLAYWRIGHT_BASE_URL"],
  "Set PLAYWRIGHT_BASE_URL to run browser E2E tests."
);

/**
 * The information architecture, exercised the way a user meets it.
 *
 * NADA's navigators used to carry eight peers — chats, status, groups,
 * whispers, contest, alerts, profile, settings — so nothing in the UI said what
 * the product was. These cover the hierarchy that replaced it: three
 * communication destinations plus Settings, with groups and status inside
 * Chats, notifications on the header bell, and profile under the account menu.
 */
async function enterApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter as a ghost" }).click();
  await expect(
    page.locator("text=Write these 12 words down in order")
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Enter NADA" }).click();
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({
    timeout: 20_000
  });

  // The first-run "Launch setup" sheet covers the app until it is dismissed.
  const scrim = page.locator(".nada-overlay").first();
  if (await scrim.isVisible().catch(() => false)) {
    await scrim.click({ position: { x: 5, y: 5 } });
    await expect(scrim).toBeHidden();
  }
}

test("the navigators carry only the primary destinations", async ({ page }) => {
  await enterApp(page);

  const rail = page.locator("nav[aria-label='Primary']");
  if (await rail.isVisible()) {
    const labels = await rail
      .locator("button[aria-label]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    // The first entry is the logo's "new conversation" shortcut, not a destination.
    expect(labels).toEqual([
      "Start a new conversation",
      "Chats",
      "Whispers",
      "Contest",
      "Settings"
    ]);
  }

  // On mobile the same four destinations live in the floating orb, which this
  // refactor deliberately left otherwise untouched.
  const orb = page.getByRole("button", { name: "Open navigation" });
  if (await orb.isVisible()) {
    await orb.click();
    await expect(page.locator(".n-orb-nav-item")).toHaveCount(4);
    await expect(page.locator(".n-orb-nav-item").first()).toContainText("Chats");
  }
});

test("notifications and profile leave the navigators but stay reachable", async ({
  page
}) => {
  await enterApp(page);

  // The bell is a global utility: it opens Alerts without any primary
  // destination claiming to be where the user is.
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.locator("header").getByText("Alerts")).toBeVisible();

  const rail = page.locator("nav[aria-label='Primary']");
  if (await rail.isVisible()) {
    await expect(rail.locator("button[aria-current='page']")).toHaveCount(0);
  }

  // Every secondary screen offers the way back to the section that owns it.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible();

  // Profile is reachable from the account menu in the header.
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  if (await rail.isVisible()) {
    // Your own profile is account territory, so Settings stays lit.
    await expect(rail.locator("button[aria-current='page']")).toHaveAttribute(
      "aria-label",
      "Settings"
    );
  }
});

test("groups and status live inside Chats", async ({ page }) => {
  await enterApp(page);

  // Groups are a slice of the one conversation list, not their own section.
  await expect(page.getByRole("tab", { name: "All" })).toBeVisible();
  await page.getByRole("tab", { name: "Groups" }).click();
  await expect(page.getByRole("button", { name: /New group/ })).toBeVisible();

  await page.getByRole("tab", { name: "All" }).click();

  // Status kept its screen; it just stopped competing for a nav slot.
  await page.getByRole("button", { name: /^Status/ }).first().click();
  await expect(page.locator("header").getByText("Status")).toBeVisible();

  const rail = page.locator("nav[aria-label='Primary']");
  if (await rail.isVisible()) {
    await expect(rail.locator("button[aria-current='page']")).toHaveAttribute(
      "aria-label",
      "Chats"
    );
  }
});

test("Settings is the account centre", async ({ page }) => {
  await enterApp(page);

  const rail = page.locator("nav[aria-label='Primary']");
  if (await rail.isVisible()) {
    await rail.getByRole("button", { name: "Settings", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Settings" }).click();
  }

  const sections = page.locator(".nada-settings-dashboard section > p");
  await expect(sections).toHaveText([
    "Account",
    "Privacy",
    "Notifications",
    "Appearance",
    "Security"
  ]);

  // Profile is discoverable inside Account, which is where it now lives.
  await expect(
    page.getByRole("button", { name: /^Profile/ }).first()
  ).toBeVisible();
});

test("mobile navigation fits the viewport", async ({ page }) => {
  await page.setViewportSize({ height: 667, width: 375 });
  await enterApp(page);

  // A navigator that overflows horizontally is a navigator with unreachable
  // entries, which is what the old eight-item bar risked on a small phone.
  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth > window.innerWidth ||
      document.body.scrollWidth > window.innerWidth
  );
  expect(overflows).toBe(false);

  // Header controls and filters must stay comfortably tappable.
  const undersized = await page.evaluate(() =>
    [...document.querySelectorAll("header button, .nada-chat-filter")]
      .map((el) => el.getBoundingClientRect().height)
      .filter((height) => height > 0 && height < 32)
  );
  expect(undersized).toEqual([]);
});
