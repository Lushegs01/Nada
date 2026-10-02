import { expect, test, type Browser, type Page } from "@playwright/test";

// Group messages travel through the relay's sockets, so this journey needs
// the app built against a running relay and is skipped without one.
test.skip(
  !process.env["PLAYWRIGHT_BASE_URL"] || !process.env["PLAYWRIGHT_RELAY_URL"],
  "Set PLAYWRIGHT_BASE_URL and PLAYWRIGHT_RELAY_URL (the relay the app was built against)."
);

/**
 * Someone joins a group through its invite link. Members who never saw the
 * link learn of them from the join itself, so the whole group reaches them —
 * until the owner resets the key without them.
 */
async function enterApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter as a ghost" }).click();
  await expect(page.locator("text=Write these 12 words down in order")).toBeVisible({
    timeout: 20_000
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Enter NADA" }).click();
  await dismissLaunchSheet(page);
}

async function dismissLaunchSheet(page: Page): Promise<void> {
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
  // The group invite is copied to the clipboard and read back from it.
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"]
  });
  const page = await context.newPage();
  await enterApp(page);
  return page;
}

/** The name this ghost gives the groups it writes to. */
async function ghostName(page: Page): Promise<string> {
  const label = await page
    .getByRole("button", { name: /^Account:/ })
    .getAttribute("aria-label");
  return (label ?? "").replace(/^Account:\s*/, "");
}

async function openContacts(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add Contact" })).toBeVisible();
}

async function inviteLinkOf(page: Page): Promise<string> {
  await openContacts(page);
  const field = page.locator("input[readonly]").first();
  await expect(field).toHaveValue(/invite/);
  const link = await field.inputValue();
  await page.getByRole("button", { name: "Close" }).first().click();
  return link;
}

async function addContact(page: Page, link: string): Promise<void> {
  await openContacts(page);
  await page.getByPlaceholder("Paste invite link...").fill(link);
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText(/^Added /).first()).toBeVisible();
  // Saving opens the new chat; on a phone that covers the list.
  await leaveOpenChat(page);
}

/**
 * Below the md breakpoint a phone shows one chat at a time, and only its Back
 * returns to the list.
 */
async function leaveOpenChat(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1024) >= 768) return;
  await page.getByRole("button", { name: "Back", exact: true }).click();
}

function composerOf(page: Page) {
  return page.getByLabel("Message", { exact: true });
}

async function send(page: Page, text: string): Promise<void> {
  const composer = composerOf(page);
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByText(text).last()).toBeVisible();
}

async function sees(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: true }).last()).toBeVisible({
    timeout: 20_000
  });
}

test("someone who joins by link reaches the whole group, until the owner removes them", async ({
  browser
}) => {
  // Three devices onboard, form a group and talk.
  test.slow();
  const groupTitle = `Club ${Math.random().toString(36).slice(2, 6)}`;

  const bob = await newGhost(browser);
  const bobInvite = await inviteLinkOf(bob);

  const alice = await newGhost(browser);
  const aliceName = await ghostName(alice);
  await addContact(alice, bobInvite);

  await alice.getByRole("tab", { name: "Groups" }).click();
  await alice.getByRole("button", { name: /New group/ }).click();
  await alice.getByPlaceholder("Group name").fill(groupTitle);
  await alice.getByRole("checkbox").last().check();
  await alice.getByRole("button", { name: "Create group" }).click();
  // Typing before the new group has opened would write to the chat that was
  // open before it, the direct chat with Bob.
  await expect(
    alice.getByRole("heading", { level: 2, name: groupTitle })
  ).toBeVisible();
  await send(alice, "hello team");

  // Bob is in. A group joined through a message does not carry its title, so
  // his copy is found by what was said in it.
  const bobsRow = bob.getByRole("button", { name: /hello team/ }).first();
  await expect(bobsRow).toBeVisible({ timeout: 20_000 });
  await bobsRow.click();
  await sees(bob, "hello team");

  // Alice shares the group's link with Carol, who is nobody's contact.
  await alice.getByRole("button", { name: "Copy group invite" }).click();
  const groupLink = await alice.evaluate(() => navigator.clipboard.readText());
  expect(groupLink).toContain("/invite?g=");

  const carol = await newGhost(browser);
  const carolName = await ghostName(carol);
  await carol.goto(groupLink);
  await dismissLaunchSheet(carol);
  await sees(carol, "You joined the group");

  // Both members are told — Bob never saw the link.
  await sees(alice, `${carolName} joined the group`);
  await sees(bob, `${carolName} joined the group`);

  // From then on everyone reaches her, and she reaches everyone.
  await send(alice, "welcome carol");
  await send(bob, "hi from bob");
  await sees(carol, "welcome carol");
  await sees(carol, "hi from bob");
  await send(carol, "thanks both");
  await sees(alice, "thanks both");
  await sees(bob, "thanks both");

  // Alice resets the key and keeps only Bob.
  await alice.getByRole("button", { name: "Group options" }).click();
  await alice.getByRole("button", { name: /Reset group key/ }).click();
  const dialog = alice.getByRole("dialog", { name: "Reset group key" });
  await dialog.getByRole("checkbox", { name: carolName }).uncheck();
  await dialog.getByRole("button", { name: "Reset key" }).click();
  await sees(alice, "You reset the group key");
  await sees(bob, `${aliceName} reset the group key`);

  // Bob and Alice carry on without her. What Carol writes under the key she
  // was given is turned away: it is no longer the group's.
  await send(carol, "carol after the reset");
  await send(alice, "just us now");
  await sees(bob, "just us now");
  await send(bob, "agreed");
  await sees(alice, "agreed");
  await expect(alice.getByText("carol after the reset")).toHaveCount(0);
  await expect(bob.getByText("carol after the reset")).toHaveCount(0);
  await expect(carol.getByText("just us now")).toHaveCount(0);
  await expect(carol.getByText("agreed")).toHaveCount(0);
});
