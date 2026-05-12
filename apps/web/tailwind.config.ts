import type { Config } from "tailwindcss";

const config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}"
  ],
  darkMode: ["class"],
  theme: {
    extend: {
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "24px",
        "3xl": "28px",
        bubble: "20px",
        pill: "999px"
      },
      boxShadow: {
        xs: "0 1px 2px rgb(0 0 0 / 0.35)",
        sm: "0 1px 3px rgb(0 0 0 / 0.45), 0 1px 2px rgb(0 0 0 / 0.35)",
        md: "0 4px 12px rgb(0 0 0 / 0.45), 0 1px 4px rgb(0 0 0 / 0.30)",
        lg: "0 8px 24px rgb(0 0 0 / 0.55), 0 2px 8px rgb(0 0 0 / 0.30)",
        xl: "0 12px 40px rgb(0 0 0 / 0.65), 0 4px 12px rgb(0 0 0 / 0.40)",
        "2xl": "0 24px 70px rgb(0 0 0 / 0.70), 0 8px 24px rgb(0 0 0 / 0.45)",
        /* Premium accent glows — NADA green */
        "accent-glow":    "0 0 22px rgb(30 215 130 / 0.40)",
        "accent-glow-lg": "0 0 44px rgb(30 215 130 / 0.32)",
        "gold-glow":      "0 0 22px rgb(245 215 90 / 0.28)",
        "gold-glow-lg":   "0 0 44px rgb(245 215 90 / 0.22)",
        /* Soft hairline */
        hairline:    "inset 0 0 0 1px rgb(255 255 255 / 0.06)",
        "hairline-strong": "inset 0 0 0 1px rgb(255 255 255 / 0.10)",
        /* Dark variants */
        "dark-sm": "0 1px 3px rgb(0 0 0 / 0.55)",
        "dark-md": "0 4px 12px rgb(0 0 0 / 0.55)",
        "dark-lg": "0 8px 24px rgb(0 0 0 / 0.65)"
      },
      colors: {
        nada: {
          bg:                "rgb(var(--nada-bg) / <alpha-value>)",
          surface:           "rgb(var(--nada-surface) / <alpha-value>)",
          "surface-elevated":"rgb(var(--nada-surface-elevated) / <alpha-value>)",
          "surface-3":       "rgb(var(--nada-surface-3) / <alpha-value>)",
          primary:           "rgb(var(--nada-primary) / <alpha-value>)",
          secondary:         "rgb(var(--nada-secondary) / <alpha-value>)",
          muted:             "rgb(var(--nada-muted) / <alpha-value>)",
          border:            "rgb(var(--nada-border) / <alpha-value>)",
          accent:            "rgb(var(--nada-accent) / <alpha-value>)",
          "accent-soft":     "rgb(var(--nada-accent-soft) / 0.1)",
          "accent-deep":     "rgb(var(--nada-accent-deep) / <alpha-value>)",
          violet:            "rgb(var(--nada-violet) / <alpha-value>)",
          "gold-dark":       "rgb(var(--nada-gold-dark) / <alpha-value>)",
          "gold-glow":       "rgb(var(--nada-gold-glow) / <alpha-value>)",
          gold:              "rgb(var(--nada-gold) / <alpha-value>)",
          cyan:              "rgb(var(--nada-cyan) / <alpha-value>)",
          "text-muted":      "rgb(var(--nada-text-muted) / <alpha-value>)",
          "text-faint":      "rgb(var(--nada-text-faint) / <alpha-value>)",
          sent:              "rgb(var(--nada-sent) / <alpha-value>)",
          received:          "rgb(var(--nada-received) / <alpha-value>)",
          danger:            "rgb(var(--nada-danger) / <alpha-value>)",
          success:           "rgb(var(--nada-success) / <alpha-value>)",
          warning:           "rgb(var(--nada-warning) / <alpha-value>)",
          overlay:           "rgb(var(--nada-overlay) / <alpha-value>)",
          input:             "rgb(var(--nada-input-bg) / <alpha-value>)"
        },
        /* Legacy aliases */
        accent:           "rgb(var(--nada-accent) / <alpha-value>)",
        "accent-warm":    "rgb(var(--nada-accent) / <alpha-value>)",
        "aura-coral":     "rgb(var(--nada-accent) / <alpha-value>)",
        "aura-mint":      "rgb(var(--nada-success) / <alpha-value>)",
        aubergine:        "rgb(var(--nada-bg) / <alpha-value>)",
        "aubergine-soft": "rgb(var(--nada-surface) / <alpha-value>)",
        background:       "rgb(var(--nada-bg) / <alpha-value>)",
        border:           "rgb(var(--nada-border) / <alpha-value>)",
        glass:            "rgb(var(--nada-surface) / <alpha-value>)",
        muted:            "rgb(var(--nada-muted) / <alpha-value>)",
        primary:          "rgb(var(--nada-primary) / <alpha-value>)",
        secondary:        "rgb(var(--nada-secondary) / <alpha-value>)",
        surface:          "rgb(var(--nada-surface) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["'Inter'", "'Satoshi'", "'Manrope'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "system-ui", "sans-serif"],
        display: ["'Inter'", "'Satoshi'", "'Manrope'", "system-ui", "sans-serif"],
        mono: ["'Space Grotesk'", "ui-monospace", "monospace"]
      },
      fontSize: {
        "2xs":   ["10px",  { lineHeight: "1.4", letterSpacing: "0.01em" }],
        xs:      ["11px",  { lineHeight: "1.45", letterSpacing: "0" }],
        sm:      ["13px",  { lineHeight: "1.5", letterSpacing: "0" }],
        base:    ["14.5px", { lineHeight: "1.55", letterSpacing: "0" }],
        md:      ["16px",  { lineHeight: "1.55", letterSpacing: "0" }],
        lg:      ["20px",  { lineHeight: "1.35", letterSpacing: "0" }],
        xl:      ["28px",  { lineHeight: "1.18", letterSpacing: "0" }],
        "2xl":   ["32px",  { lineHeight: "1.14", letterSpacing: "0" }],
        "3xl":   ["36px",  { lineHeight: "1.10", letterSpacing: "0" }],
        "4xl":   ["42px",  { lineHeight: "1.08", letterSpacing: "0" }],
        "5xl":   ["52px",  { lineHeight: "1.04", letterSpacing: "0" }],
        caption: ["12px",  { lineHeight: "1.4" }],
        body:    ["15px",  { lineHeight: "1.55" }],
        title:   ["20px",  { fontWeight: "600", lineHeight: "1.3", letterSpacing: "0" }],
        headline:["28px",  { fontWeight: "700", lineHeight: "1.12", letterSpacing: "0" }]
      },
      letterSpacing: {
        tighter: "0",
        tight: "0",
        normal: "0",
        wide: "0",
        wider: "0",
        widest: "0"
      },
      keyframes: {
        "bubble-in": {
          "0%":   { opacity: "0", transform: "translateY(8px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(18px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.93)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        "slide-in-left": {
          "0%":   { opacity: "0", transform: "translateX(-18px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%":       { opacity: "0.75" }
        },
        "shimmer": {
          "0%":   { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" }
        },
        "badge-pop": {
          "0%":   { transform: "scale(0)", opacity: "0" },
          "70%":  { transform: "scale(1.2)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(30,215,130,0.55)" },
          "50%":       { boxShadow: "0 0 0 14px rgba(30,215,130,0)" }
        }
      },
      animation: {
        "bubble-in":      "bubble-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in":        "fade-in 0.22s ease-out both",
        "slide-in-right": "slide-in-right 0.30s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-left":  "slide-in-left 0.30s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-up":       "slide-up 0.40s cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in":       "scale-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-subtle":   "pulse-subtle 2.5s ease-in-out infinite",
        "shimmer":        "shimmer 2s infinite",
        "badge-pop":      "badge-pop 0.32s cubic-bezier(0.16, 1, 0.3, 1) both",
        "glow-pulse":     "glow-pulse 2.6s ease-in-out infinite"
      },
      spacing: {
        "safe-bottom": "env(safe-area-inset-bottom)"
      },
      backgroundImage: {
        "aurora": "radial-gradient(ellipse 70% 50% at 25% 25%, rgba(30, 215, 130, 0.18) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 80% 30%, rgba(132, 232, 92, 0.12) 0%, transparent 55%), radial-gradient(ellipse 80% 60% at 50% 110%, rgba(17, 167, 101, 0.18) 0%, transparent 60%)",
        "accent-gradient": "linear-gradient(135deg, rgb(var(--nada-accent)) 0%, rgb(var(--nada-violet)) 50%, rgb(var(--nada-accent-deep)) 100%)"
      },
      zIndex: {
        shell:   "10",
        header:  "20",
        overlay: "200",
        sheet:   "210",
        toast:   "300"
      }
    }
  },
  plugins: []
} satisfies Config;

export default config;
