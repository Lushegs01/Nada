/**
 * Appearance: which palette the interface wears, and how much it moves.
 *
 * The design system already carried three complete token sets — the default
 * midnight, an aurora variant with a drifting backdrop, and a warm light
 * "paper" — but nothing ever set `data-theme`, so every user got midnight and
 * Settings could only describe the theme it was stuck on. This module is the
 * switch those tokens were waiting for.
 *
 * Preferences live in localStorage rather than the encrypted local database.
 * They are device-level display settings, not identity data: they must apply
 * before the first paint (IndexedDB is far too slow for that, and the wrong
 * palette flashing on every load is exactly what this avoids), and they must
 * survive erasing an identity, which deletes that database outright.
 */

export type ThemeId = "midnight" | "aurora" | "paper";
export type MotionId = "full" | "reduced";

export interface ThemeOption {
  readonly id: ThemeId;
  readonly label: string;
  readonly description: string;
  /** Whether the browser should render its own chrome light or dark. */
  readonly colorScheme: "dark" | "light";
  /** The colour behind the PWA's status bar and address bar. */
  readonly themeColor: string;
  /** Base, surface and accent, in that order — the picker's preview. */
  readonly swatch: readonly [string, string, string];
}

export const THEMES: readonly ThemeOption[] = [
  {
    id: "midnight",
    label: "Midnight",
    description: "Cool indigo-black. NADA's default.",
    colorScheme: "dark",
    themeColor: "#0A0B12",
    swatch: ["#0A0B12", "#151726", "#7C6EF8"]
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Midnight with a slow iridescent drift.",
    colorScheme: "dark",
    themeColor: "#0A0B12",
    swatch: ["#0A0B12", "#1B1836", "#10D98A"]
  },
  {
    id: "paper",
    label: "Paper",
    description: "Warm light, for bright rooms.",
    colorScheme: "light",
    themeColor: "#F5F2EC",
    swatch: ["#F5F2EC", "#E4DFDA", "#7C3AED"]
  }
] as const;

export const DEFAULT_THEME: ThemeId = "midnight";
export const DEFAULT_MOTION: MotionId = "full";

export interface AppearanceSettings {
  readonly theme: ThemeId;
  readonly motion: MotionId;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  motion: DEFAULT_MOTION,
  theme: DEFAULT_THEME
};

/** The localStorage key the pre-paint bootstrap in the root layout also reads. */
export const APPEARANCE_STORAGE_KEY = "nada.appearance";

export function themeOption(id: ThemeId): ThemeOption {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

function isMotionId(value: unknown): value is MotionId {
  return value === "full" || value === "reduced";
}

/**
 * Reads the stored preference, falling back to the default for anything it
 * does not recognise. Storage can be unavailable (private mode, blocked site
 * data) or hold a value from an older build, and neither should stop the app
 * rendering.
 */
export function readAppearance(): AppearanceSettings {
  if (typeof localStorage === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_APPEARANCE;
    const record = parsed as Record<string, unknown>;
    return {
      motion: isMotionId(record["motion"]) ? record["motion"] : DEFAULT_MOTION,
      theme: isThemeId(record["theme"]) ? record["theme"] : DEFAULT_THEME
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function writeAppearance(settings: AppearanceSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked. The choice still applies to this session.
  }
}

/**
 * Puts the preference on the document.
 *
 * `data-theme` selects the token set; `data-motion` switches off ambient
 * animation the same way the `prefers-reduced-motion` media query does, for
 * people who want a calmer NADA without changing their whole OS. The
 * `color-scheme` and `theme-color` updates keep the browser's own chrome —
 * scrollbars, form controls, the PWA status bar — from staying dark under the
 * light theme.
 */
export function applyAppearance(settings: AppearanceSettings): void {
  if (typeof document === "undefined") return;
  const option = themeOption(settings.theme);
  const root = document.documentElement;

  root.dataset["theme"] = settings.theme;
  root.dataset["motion"] = settings.motion;
  root.style.colorScheme = option.colorScheme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", option.themeColor);
  }
}

/**
 * The script the root layout inlines to apply the stored theme before the
 * first paint. Kept here so it cannot drift from the reader above, and written
 * as a string because it has to run ahead of any bundle.
 */
export const APPEARANCE_BOOTSTRAP = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY
)});if(!s)return;var p=JSON.parse(s);var t=${JSON.stringify(
  THEMES.map((theme) => theme.id)
)};if(t.indexOf(p.theme)<0)return;var d=document.documentElement;d.dataset.theme=p.theme;d.dataset.motion=p.motion==="reduced"?"reduced":"full";d.style.colorScheme=p.theme==="paper"?"light":"dark";}catch(e){}})();`;
