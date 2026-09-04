import { expect, test } from "@playwright/test";

test.skip(
  !process.env["PLAYWRIGHT_BASE_URL"],
  "Set PLAYWRIGHT_BASE_URL to run browser E2E tests."
);

/**
 * The first-run journey, end to end in a real browser.
 *
 * This is the flow every single user takes, and it is the one that cannot be
 * covered by unit tests: identity generation runs libsodium WASM, the seed
 * phrase comes from BIP39, and the result is persisted to IndexedDB before the
 * dashboard renders. A previous version of this test asserted a button that
 * had not existed for some time — it never failed because it silently skipped
 * without PLAYWRIGHT_BASE_URL, and Playwright then choked on the Vitest suites
 * in the same directory before reaching it.
 */
test("a new user creates an identity and reaches their chats", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Message Freely/i })
  ).toBeVisible();

  await page.getByRole("button", { name: "Enter as a ghost" }).click();

  // Identity generation is WASM-backed, so give it room on a cold start.
  const seedWords = page.locator("text=Write these 12 words down in order");
  await expect(seedWords).toBeVisible({ timeout: 20_000 });

  await page.getByRole("checkbox").check();
  await page.getByPlaceholder("Display name (optional)").fill("Quiet Signal");

  const enter = page.getByRole("button", { name: "Enter NADA" });
  await expect(enter).toBeEnabled();
  await enter.click();

  // Reaching the app shell is what proves the identity was created, stored and
  // unlocked — the dashboard does not render without one.
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({
    timeout: 20_000
  });
});

test("the identity survives a reload", async ({ page }) => {
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

  // A local-first app that loses its identity on refresh has no product. The
  // second load must go straight to the dashboard, not back to onboarding.
  await page.reload();
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({
    timeout: 20_000
  });
  await expect(
    page.getByRole("button", { name: "Enter as a ghost" })
  ).toHaveCount(0);
});

test("the seed phrase gate cannot be skipped", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter as a ghost" }).click();
  await expect(
    page.locator("text=Write these 12 words down in order")
  ).toBeVisible({ timeout: 20_000 });

  // Losing the seed phrase means losing the identity permanently — there is no
  // account to recover. The confirmation gate is the only thing standing
  // between a user and that, so it must actually gate.
  await expect(page.getByRole("button", { name: "Enter NADA" })).toBeDisabled();
});
