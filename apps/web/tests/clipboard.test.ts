// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "../src/lib/clipboard";

/**
 * The seed phrase is the only copy in the app a user cannot afford to lose to
 * a silent failure — there is no account to fall back on. These cover the two
 * environments that actually break: an in-app webview with no async clipboard,
 * and a browser that has the API but rejects the write.
 */
describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "execCommand");
  });

  it("uses the async clipboard when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "test" });

    await expect(copyText("oblige spy inmate")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("oblige spy inmate");
  });

  it("falls back to a selection copy when the clipboard API is missing", async () => {
    vi.stubGlobal("navigator", { userAgent: "test", platform: "test", maxTouchPoints: 0 });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
      writable: true
    });

    await expect(copyText("oblige spy inmate")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    // The scratch field must not outlive the copy.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the async clipboard rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      maxTouchPoints: 0,
      platform: "test",
      userAgent: "test"
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
      writable: true
    });

    await expect(copyText("oblige spy inmate")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure rather than pretending the copy worked", async () => {
    vi.stubGlobal("navigator", { maxTouchPoints: 0, platform: "test", userAgent: "test" });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
      writable: true
    });

    await expect(copyText("oblige spy inmate")).resolves.toBe(false);
  });
});
