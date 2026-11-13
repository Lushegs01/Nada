import { expect, test, type Page } from "@playwright/test";
import { crc32, deflateSync } from "node:zlib";

// Media is stored and served by the relay, so this journey needs the app
// built against a running relay (NEXT_PUBLIC_RELAY_URL) and is skipped
// without one.
test.skip(
  !process.env["PLAYWRIGHT_BASE_URL"] || !process.env["PLAYWRIGHT_RELAY_URL"],
  "Set PLAYWRIGHT_BASE_URL and PLAYWRIGHT_RELAY_URL (the relay the app was built against)."
);

const SECRET = "GPS 51.5007N 0.1246W";

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * A real 320×200 PNG with a gradient, carrying a text chunk of the kind
 * cameras and editors write — which must not survive the trip to the feed.
 */
function photoWithMetadata(): Buffer {
  const width = 320;
  const height = 200;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) {
      rows.push(Math.round((x / width) * 124), Math.round((y / height) * 110), 248);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("tEXt", Buffer.from(`Comment\0${SECRET}`, "latin1")),
    chunk("IDAT", deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

async function enterWhispers(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter as a ghost" }).click();
  await expect(page.locator("text=Write these 12 words down in order")).toBeVisible({
    timeout: 20_000
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Enter NADA" }).click();
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({ timeout: 20_000 });
  // The first-run "Launch setup" sheet covers the app, and can open a moment
  // after the app itself does.
  const scrim = page.locator(".nada-overlay").first();
  const appeared = await scrim
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await scrim.click({ position: { x: 5, y: 5 } });
    await expect(scrim).toBeHidden();
  }
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

test("a ghost posts a photo, and the feed shows it without its metadata", async ({
  page
}) => {
  test.slow();
  await enterWhispers(page);
  const composer = page.getByRole("combobox", { name: "Whisper something to everyone" });
  const form = page.locator("form").filter({ has: composer });

  await page.getByTestId("echo-media-input").setInputFiles({
    name: "IMG_0412.png",
    mimeType: "image/png",
    buffer: photoWithMetadata()
  });
  await expect(form.getByRole("img", { name: "Attached photo" })).toBeVisible();

  const caption = `golden hour ${Math.random().toString(36).slice(2, 7)}`;
  await composer.fill(caption);
  await form.getByRole("button", { name: "Echo" }).click();

  const card = page.locator("article").filter({ hasText: caption }).first();
  const photo = card.getByRole("img", { name: "Photo shared in this Echo" });
  await expect(photo).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(320);

  // What everyone downloads is the re-encoded picture: no text chunk survives.
  const src = await photo.getAttribute("src");
  expect(src).toContain("/api/v1/whispers/media/");
  const served = await page.request.get(src!);
  expect(served.ok()).toBe(true);
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await served.body()).toString("latin1")).not.toContain(SECRET);

  // The photo opens full screen and closes again.
  await photo.click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});

test("a file dropped onto the feed is attached to the Echo", async ({ page }) => {
  test.slow();
  await enterWhispers(page);
  const composer = page.getByRole("combobox", { name: "Whisper something to everyone" });
  const form = page.locator("form").filter({ has: composer });

  const png = photoWithMetadata().toString("base64");
  const dataTransfer = await page.evaluateHandle((base64) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
    return transfer;
  }, png);
  for (const type of ["dragenter", "dragover", "drop"]) {
    await composer.dispatchEvent(type, { dataTransfer });
  }

  await expect(form.getByRole("img", { name: "Attached photo" })).toBeVisible();
  // A photo needs no caption.
  await form.getByRole("button", { name: "Echo" }).click();
  await expect(form.getByRole("img", { name: "Attached photo" })).toBeHidden({
    timeout: 15_000
  });
});
