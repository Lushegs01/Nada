import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env["PLAYWRIGHT_BASE_URL"];
// Some CI images ship their own Chromium rather than the exact build this
// Playwright version downloads. Point at it instead of failing the suite.
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_PATH"];
const launchOptions = executablePath ? { launchOptions: { executablePath } } : {};

export default defineConfig({
  testDir: "./tests",
  // Without this Playwright also collects the Vitest suites in this directory
  // and every one of them dies on `Cannot redefine property:
  // Symbol($$jest-matchers-object)` — two test runners' expect() in one
  // process. Only `.spec.ts` files are browser tests.
  testMatch: /.*\.spec\.ts$/,
  // A flaky E2E test that passes on retry is still a signal, but a single
  // network hiccup should not fail a deploy.
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    ...(baseURL ? { baseURL } : {}),
    // Artifacts only for failures, so a green run leaves nothing behind.
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...launchOptions } },
    // The product is a phone-first PWA; a layout that only works on a desktop
    // viewport is a broken product, so the journey runs on both.
    { name: "mobile", use: { ...devices["Pixel 7"], ...launchOptions } }
  ]
});
