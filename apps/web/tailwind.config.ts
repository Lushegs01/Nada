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
        bubble: "18px",
        pill: "999px"
      },
      boxShadow: {
        xs: "0 1px 2px rgb(0 0 0 / 0.3)",
        sm: "0 1px 3px rgb(0 0 0 / 0.4), 0 1px 2px rgb(0 0 0 / 0.3)",
        md: "0 4px 12px rgb(0 0 0 / 0.4), 0 1px 4px rgb(0 0 0 / 0.3)",
        lg: "0 8px 24px rgb(0 0 0 / 0.5), 0 2px 8px rgb(0 0 0 / 0.3)",
        xl: "0 12px 40px rgb(0 0 0 / 0.6), 0 4px 12px rgb(0 0 0 / 0.4)",
        "gold-glow": "0 0 20px rgb(247 185 40 / 0.25)",
        "gold-glow-lg": "0 0 40px rgb(247 185 40 / 0.2)",
        "dark-sm": "0 1px 3px rgb(0 0 0 / 0.5)",
        "dark-md": "0 4px 12px rgb(0 0 0 / 0.5)",
        "dark-lg": "0 8px 24px rgb(0 0 0 / 0.6)"
      },
      colors: {
        nada: {
          bg: "rgb(var(--nada-bg) / <alpha-value>)",
          surface: "rgb(var(--nada-surface) / <alpha-value>)",
          "surface-elevated": "rgb(var(--nada-surface-elevated) / <alpha-value>)",
          "surface-3": "rgb(var(--nada-surface-3) / <alpha-value>)",
          primary: "rgb(var(--nada-primary) / <alpha-value>)",
          secondary: "rgb(var(--nada-secondary) / <alpha-value>)",
          muted: "rgb(var(--nada-muted) / <alpha-value>)",
          border: "rgb(var(--nada-border) / <alpha-value>)",
          accent: "rgb(var(--nada-accent) / <alpha-value>)",
          "accent-soft": "rgb(var(--nada-accent-soft) / 0.1)",
          "gold-dark": "rgb(var(--nada-gold-dark) / <alpha-value>)",
          "gold-glow": "rgb(var(--nada-gold-glow) / <alpha-value>)",
          sent: "rgb(var(--nada-sent) / <alpha-value>)",
          received: "rgb(var(--nada-received) / <alpha-value>)",
          danger: "rgb(var(--nada-danger) / <alpha-value>)",
          success: "rgb(var(--nada-success) / <alpha-value>)",
          overlay: "rgb(var(--nada-overlay) / <alpha-value>)",
          input: "rgb(var(--nada-input-bg) / <alpha-value>)"
        },
        /* Legacy aliases */
        accent: "rgb(var(--nada-accent) / <alpha-value>)",
        "accent-warm": "rgb(var(--nada-accent) / <alpha-value>)",
        "aura-coral": "rgb(var(--nada-accent) / <alpha-value>)",
        "aura-mint": "rgb(var(--nada-success) / <alpha-value>)",
        aubergine: "rgb(var(--nada-bg) / <alpha-value>)",
        "aubergine-soft": "rgb(var(--nada-surface) / <alpha-value>)",
        background: "rgb(var(--nada-bg) / <alpha-value>)",
        border: "rgb(var(--nada-border) / <alpha-value>)",
        glass: "rgb(var(--nada-surface) / <alpha-value>)",
        muted: "rgb(var(--nada-muted) / <alpha-value>)",
        primary: "rgb(var(--nada-primary) / <alpha-value>)",
        secondary: "rgb(var(--nada-secondary) / <alpha-value>)",
        surface: "rgb(var(--nada-surface) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "system-ui", "sans-serif"]
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "1.4" }],
        xs:   ["12px", { lineHeight: "1.4" }],
        sm:   ["14px", { lineHeight: "1.5" }],
        base: ["15px", { lineHeight: "1.5" }],
        md:   ["16px", { lineHeight: "1.5" }],
        lg:   ["18px", { lineHeight: "1.4" }],
        xl:   ["20px", { lineHeight: "1.3" }],
        "2xl":["24px", { lineHeight: "1.2" }],
        "3xl":["30px", { lineHeight: "1.15" }],
        "4xl":["36px", { lineHeight: "1.1" }],
        caption: ["12px", { lineHeight: "1.4" }],
        body:    ["15px", { lineHeight: "1.5" }],
        title:   ["20px", { fontWeight: "600", lineHeight: "1.3" }],
        headline:["30px", { fontWeight: "700", lineHeight: "1.15" }]
      },
      keyframes: {
        "bubble-in": {
          "0%":   { opacity: "0", transform: "translateY(6px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "bubble-in":      "bubble-in 0.25s ease-out both",
        "fade-in":        "fade-in 0.2s ease-out both",
        "slide-in-right": "slide-in-right 0.3s ease-out both",
        "slide-up":       "slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both"
      },
      spacing: {
        "safe-bottom": "env(safe-area-inset-bottom)"
      },
      zIndex: {
        shell:   "10",
        header:  "20",
        overlay: "50",
        sheet:   "60",
        toast:   "70"
      }
    }
  },
  plugins: []
} satisfies Config;

export default config;
