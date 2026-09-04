import { expect, test } from "@playwright/test";

test.skip(
  !process.env["PLAYWRIGHT_BASE_URL"],
  "Set PLAYWRIGHT_BASE_URL to run browser E2E tests."
);

/**
 * The contest surfaces in a real browser.
 *
 * These run against a build with no relay configured, which is the honest
 * default for CI — and it is also the case worth protecting: a contest feature
 * that breaks the app when the relay is absent would take the whole product
 * down with it. What is asserted here is that the surfaces render, route, and
 * degrade to an explanation rather than a blank screen or a crash.
 */

async function enterAsGhost(page: import("@playwright/test").Page): Promise<void> {
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

  // First run opens a launch-setup sheet over the whole shell. Dismiss it, or
  // every navigation click below lands on its scrim instead of the nav.
  const dismiss = page.getByRole("button", { name: "Close onboarding" });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    await expect(dismiss).toBeHidden();
  }
}

test("the contest tab is reachable from the app and explains itself", async ({
  page
}, testInfo) => {
  await enterAsGhost(page);

  if (testInfo.project.name === "mobile") {
    // The phone navigator hides its tabs behind the orb menu.
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Contest", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Contest", exact: true }).click();
  }

  // Either a live contest or the honest empty state — never a blank panel.
  await expect(
    page.getByText(/No contest running|Contests need a relay|Engage\. Climb\. Win\./)
  ).toBeVisible({ timeout: 15_000 });
});

test("the public contest page renders without an identity", async ({ page }) => {
  // Shareable, so it must work for someone who has never opened NADA.
  await page.goto("/contest");
  await expect(
    page.getByText(/No contest running|Engage\. Climb\. Win\./)
  ).toBeVisible({ timeout: 15_000 });
});

test("the admin console refuses an identity it cannot verify", async ({ page }) => {
  await page.goto("/admin/contests");
  await expect(
    page.getByText(
      /Unlock a NADA identity first|This identity cannot administer contests/
    )
  ).toBeVisible({ timeout: 15_000 });
});
