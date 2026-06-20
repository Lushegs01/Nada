import { expect, test } from "@playwright/test";

test("creates a local anonymous identity", async ({ page }) => {
  test.skip(
    !process.env["PLAYWRIGHT_BASE_URL"],
    "Set PLAYWRIGHT_BASE_URL to run browser E2E tests."
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Create identity" }).click();
  await expect(page.getByText("I saved my seed phrase.")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByPlaceholder("Display name").fill("NADA");
  await page.getByRole("button", { name: "Enter NADA" }).click();
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();
});
