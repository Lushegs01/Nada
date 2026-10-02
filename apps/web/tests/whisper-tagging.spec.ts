import { expect, test, type Browser, type Page } from "@playwright/test";

// Tagging is enforced and fanned out by the relay, so this journey needs the
// app built against a running relay (NEXT_PUBLIC_RELAY_URL) and is skipped
// without one.
test.skip(
  !process.env["PLAYWRIGHT_BASE_URL"] || !process.env["PLAYWRIGHT_RELAY_URL"],
  "Set PLAYWRIGHT_BASE_URL and PLAYWRIGHT_RELAY_URL (the relay the app was built against)."
);

/**
 * Two ghosts on two devices: one tags the other in an Echo using the "@"
 * picker, and the tagged ghost hears about it and can follow the tag back.
 */
async function enterApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter as a ghost" }).click();
  await expect(page.locator("text=Write these 12 words down in order")).toBeVisible({
    timeout: 20_000
  });
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

async function newGhost(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await enterApp(page);
  return page;
}

/** Saves a public Whispers profile, which is what makes a ghost taggable. */
async function saveProfile(
  page: Page,
  name: string,
  whoCanTag?: "Everyone" | "People you follow" | "No one"
): Promise<void> {
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("menuitem", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByLabel("Display name").fill(name);
  if (whoCanTag) {
    await page
      .getByRole("group", { name: "Who can tag you" })
      .getByRole("button", { name: whoCanTag, exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
}

async function openWhispers(page: Page): Promise<void> {
  const rail = page.locator("nav[aria-label='Primary']");
  if (await rail.isVisible()) {
    await rail.getByRole("button", { name: "Whispers", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Whispers" }).click();
  }
  await expect(
    page.getByRole("combobox", { name: "Whisper something to everyone" })
  ).toBeVisible();
}

// Every ghost onboards on its own device (key generation, seed phrase), so a
// journey with two or three of them outgrows the default 30s budget.
test("one ghost tags another, who is told and can follow the tag", async ({
  browser
}) => {
  test.slow();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const bobName = `Bob Tagged ${suffix}`;

  const bob = await newGhost(browser);
  await saveProfile(bob, bobName);
  const alice = await newGhost(browser);
  await openWhispers(alice);

  // Typing "@" and part of a later word of the name finds Bob.
  const composer = alice.getByRole("combobox", {
    name: "Whisper something to everyone"
  });
  await composer.click();
  await composer.pressSequentially(`thanks @tagged ${suffix.toLowerCase()}`);
  const option = alice.getByRole("option", { name: bobName });
  await expect(option).toBeVisible();
  await option.click();
  await expect(composer).toHaveValue(`thanks @${bobName} `);
  // Typing straight on after a pick continues after the tag, not elsewhere.
  await composer.pressSequentially("for the help");
  await expect(composer).toHaveValue(`thanks @${bobName} for the help`);
  // "Echo" is also every card's like button; post with the composer's own.
  await alice
    .locator("form")
    .filter({ has: composer })
    .getByRole("button", { name: "Echo" })
    .click();

  // The tag is a link to Bob's profile in Alice's feed.
  const tag = alice.getByRole("link", { name: `@${bobName}` }).first();
  await expect(tag).toBeVisible();
  await expect(tag).toHaveAttribute("href", /\?ghost=[0-9a-f]{64}$/);

  // Bob is told. Focus is one of the app's sync triggers.
  await bob.evaluate(() => window.dispatchEvent(new Event("focus")));
  await bob.getByRole("button", { name: /^Notifications/ }).click();
  const alert = bob.getByRole("button", { name: /mentioned you/ }).first();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await alert.click();

  // The alert opens the Echo, and the tag leads back to Bob's own profile.
  const bobsTag = bob.getByRole("link", { name: `@${bobName}` }).first();
  await expect(bobsTag).toBeVisible();
  await bobsTag.click();
  await expect(bob.getByText("Your profile")).toBeVisible();
});

test("a ghost who allows no tags is never offered", async ({ browser }) => {
  test.slow();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const carol = await newGhost(browser);
  await saveProfile(carol, `Carol Private ${suffix}`, "No one");
  const dave = await newGhost(browser);
  await saveProfile(dave, `Dave Open ${suffix}`);

  const alice = await newGhost(browser);
  await openWhispers(alice);
  const composer = alice.getByRole("combobox", {
    name: "Whisper something to everyone"
  });
  await composer.click();
  // Both names contain the suffix as a word, so one search could offer both.
  // Waiting for Dave first means the results are in before Carol is checked.
  await composer.pressSequentially(`hi @${suffix.toLowerCase()}`);
  await expect(
    alice.getByRole("option", { name: `Dave Open ${suffix}` })
  ).toBeVisible();
  await expect(
    alice.getByRole("option", { name: `Carol Private ${suffix}` })
  ).toHaveCount(0);
});
