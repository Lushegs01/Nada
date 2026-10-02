import { expect, test, type Browser, type Page } from "@playwright/test";

// Group messages travel through the relay's sockets, so this journey needs
// the app built against a running relay and is skipped without one.
test.skip(
  !process.env["PLAYWRIGHT_BASE_URL"] || !process.env["PLAYWRIGHT_RELAY_URL"],
  "Set PLAYWRIGHT_BASE_URL and PLAYWRIGHT_RELAY_URL (the relay the app was built against)."
);

/**
 * Two ghosts in one group on two devices. They learn each other's names from
 * the messages they exchange, one tags the other from the "@" list, and the
 * tagged ghost hears about it — even with the group muted.
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
  const context = await browser.newContext();
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
 * returns to the list. Waits for that Back rather than checking for it, since
 * the chat opens a moment after whatever opened it.
 */
async function leaveOpenChat(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1024) >= 768) return;
  await page.getByRole("button", { name: "Back", exact: true }).click();
}

async function openSection(page: Page, name: "Chats" | "Settings"): Promise<void> {
  const rail = page.locator("nav[aria-label='Primary']");
  if (await rail.isVisible()) {
    await rail.getByRole("button", { name, exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name }).click();
  }
}

/** Previews are hidden by default, which would hide who tagged you. */
async function showNotificationPreviews(page: Page): Promise<void> {
  await openSection(page, "Settings");
  await page.getByRole("button", { name: /Alerts & sounds/ }).click();
  await page.getByRole("button", { name: /Preview privacy/ }).click();
  await expect(page.getByText("Show notification previews")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).first().click();
  await openSection(page, "Chats");
}

/**
 * Groups have no mute control of their own yet (only direct chats do), so this
 * writes the same per-chat preference the direct-chat mute writes, "muted
 * forever", for every group on the device. A reload makes the app read it.
 */
async function muteEveryGroup(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nada-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["chats", "chatPrefs"], "readwrite");
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const chats = tx.objectStore("chats").getAll();
    chats.onsuccess = () => {
      const prefs = tx.objectStore("chatPrefs");
      for (const chat of chats.result as Array<{ id: string; type: string }>) {
        if (chat.type !== "group") continue;
        const existing = prefs.get(chat.id);
        existing.onsuccess = () => {
          prefs.put({
            archivedAt: 0,
            blockedPubkeyHashes: [],
            clearedAt: 0,
            pinnedMessageBody: null,
            pinnedMessageId: null,
            ...(existing.result as Record<string, unknown> | undefined),
            chatId: chat.id,
            mutedUntil: null,
            updatedAt: Date.now()
          });
        };
      }
    };
    await done;
    db.close();
  });
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

test("a group member tags another, who is told even with the group muted", async ({
  browser
}) => {
  // Two devices onboard, exchange an invite, form a group and talk.
  test.slow();
  const groupTitle = `Study ${Math.random().toString(36).slice(2, 6)}`;

  const bob = await newGhost(browser);
  const bobName = await ghostName(bob);
  await showNotificationPreviews(bob);
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
  await expect(alice.getByRole("heading", { level: 2, name: groupTitle })).toBeVisible();
  await send(alice, "hello team");

  // Bob is in. A group joined through a message rather than an invite link
  // does not carry its title, so Bob's copy is found by what was said in it.
  const bobsRow = bob.getByRole("button", { name: /hello team/ }).first();
  await expect(bobsRow).toBeVisible({ timeout: 20_000 });
  const bobsTitle = (await bobsRow.getByRole("heading").textContent()) ?? "";
  await bobsRow.click();
  // He sees who wrote, by the name Alice gives the group.
  await expect(bob.getByText("hello team").last()).toBeVisible({ timeout: 20_000 });
  await expect(bob.getByText(aliceName, { exact: true }).first()).toBeVisible();
  await send(bob, "hi everyone");

  // Bob mutes the group and leaves it.
  await muteEveryGroup(bob);
  // A reload opens on the chat list, with no chat selected.
  await bob.reload();
  await dismissLaunchSheet(bob);

  // Alice's "@" list offers Bob by the name he gave the group.
  await expect(alice.getByText("hi everyone").last()).toBeVisible({ timeout: 20_000 });
  const composer = composerOf(alice);
  await composer.click();
  const firstWord = bobName.split(" ")[0]!;
  await composer.pressSequentially(`can you check this @${firstWord.toLowerCase()}`);
  const option = alice.getByRole("option", { name: bobName });
  await expect(option).toBeVisible();
  await option.click();
  await expect(composer).toHaveValue(`can you check this @${bobName} `);
  await composer.pressSequentially("please");
  await expect(composer).toHaveValue(`can you check this @${bobName} please`);
  await composer.press("Enter");

  // Bob is told despite the mute, and the group is marked in his list.
  await expect(bob.getByText(`${aliceName} mentioned you`)).toBeVisible({
    timeout: 20_000
  });
  await expect(bob.getByLabel("You were tagged")).toBeVisible();

  // Inside, his tag stands out.
  await bob.getByRole("heading", { name: bobsTitle, exact: true }).first().click();
  const tagged = bob.locator("[data-tagged-me]");
  await expect(tagged).toHaveCount(1);
  await expect(tagged.locator('[data-tag="you"]')).toHaveText(`@${bobName}`);
});
