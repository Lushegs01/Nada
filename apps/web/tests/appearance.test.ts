// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPEARANCE_BOOTSTRAP,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  THEMES,
  applyAppearance,
  readAppearance,
  themeOption,
  writeAppearance
} from "../src/lib/appearance";

/**
 * Appearance is stored outside the encrypted database and applied before the
 * bundle runs, so it has two failure modes worth pinning: a stored value the
 * app no longer recognises, and storage that is simply unavailable. Neither may
 * stop NADA rendering.
 */
describe("appearance preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-motion");
    document.documentElement.style.colorScheme = "";
    document.head.innerHTML = '<meta name="theme-color" content="#0A0B12">';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ships a dark default and a light alternative", () => {
    expect(DEFAULT_APPEARANCE).toEqual({ motion: "full", theme: "midnight" });
    expect(THEMES.map((theme) => theme.id)).toEqual(["midnight", "aurora", "paper"]);
    expect(THEMES.filter((theme) => theme.colorScheme === "light")).toHaveLength(1);
  });

  it("round-trips a choice", () => {
    writeAppearance({ motion: "reduced", theme: "paper" });
    expect(readAppearance()).toEqual({ motion: "reduced", theme: "paper" });
  });

  it("falls back to the default for anything it does not recognise", () => {
    for (const stored of ["", "not json", "[]", '{"theme":"neon","motion":"warp"}']) {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, stored);
      expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it("survives storage being unavailable", () => {
    // Private windows and blocked site data throw on access rather than
    // returning null, which would otherwise take the whole app down.
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      }
    });
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(() => { writeAppearance({ motion: "full", theme: "paper" }); }).not.toThrow();
  });

  it("puts the choice on the document, browser chrome included", () => {
    applyAppearance({ motion: "reduced", theme: "paper" });
    const root = document.documentElement;
    expect(root.dataset["theme"]).toBe("paper");
    expect(root.dataset["motion"]).toBe("reduced");
    expect(root.style.colorScheme).toBe("light");
    expect(
      document.querySelector('meta[name="theme-color"]')?.getAttribute("content")
    ).toBe("#F5F2EC");

    applyAppearance({ motion: "full", theme: "midnight" });
    expect(root.style.colorScheme).toBe("dark");
    expect(
      document.querySelector('meta[name="theme-color"]')?.getAttribute("content")
    ).toBe("#0A0B12");
  });

  it("names an unknown theme back to the default", () => {
    expect(themeOption("paper").label).toBe("Paper");
    // @ts-expect-error -- exercising the runtime guard a stale store can hit
    expect(themeOption("neon").id).toBe("midnight");
  });

  describe("pre-paint bootstrap", () => {
    /** Runs the inlined string the way the browser would, before any bundle. */
    const runBootstrap = (): void => {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function(APPEARANCE_BOOTSTRAP)();
    };

    it("applies a stored theme with no bundle loaded", () => {
      localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({ motion: "reduced", theme: "paper" })
      );
      runBootstrap();
      expect(document.documentElement.dataset["theme"]).toBe("paper");
      expect(document.documentElement.dataset["motion"]).toBe("reduced");
      expect(document.documentElement.style.colorScheme).toBe("light");
    });

    it("leaves the document alone when there is nothing stored", () => {
      runBootstrap();
      expect(document.documentElement.dataset["theme"]).toBeUndefined();
    });

    it("ignores a theme it does not know", () => {
      localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({ motion: "full", theme: "neon" })
      );
      runBootstrap();
      expect(document.documentElement.dataset["theme"]).toBeUndefined();
    });

    it("agrees with the reader it shadows", () => {
      // The bootstrap is a hand-written copy of readAppearance/applyAppearance
      // for the pre-paint window. If the two disagree the theme flips on load.
      for (const theme of THEMES) {
        localStorage.setItem(
          APPEARANCE_STORAGE_KEY,
          JSON.stringify({ motion: "full", theme: theme.id })
        );
        runBootstrap();
        const fromBootstrap = document.documentElement.dataset["theme"];
        applyAppearance(readAppearance());
        expect(document.documentElement.dataset["theme"]).toBe(fromBootstrap);
        expect(document.documentElement.style.colorScheme).toBe(theme.colorScheme);
      }
    });
  });
});
