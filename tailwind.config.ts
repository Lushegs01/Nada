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
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "22px",
        "3xl": "28px",
        bubble: "18px",
        pill: "999px"
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.08), 0 0 1px 0 rgb(0 0 0 / 0.12)",
        sm: "0 2px 4px -1px rgb(0 0 0 / 0.10), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        md: "0 4px 6px -2px rgb(0 0 0 / 0.12), 0 2px 4px -3px rgb(0 0 0 / 0.08)",
        lg: "0 10px 15px -4px rgb(0 0 0 / 0.14), 0 4px 6px -5px rgb(0 0 0 / 0.08)",
        xl: "0 20px 25px -6px rgb(0 0 0 / 0.16), 0 8px 10px -8px rgb(0 0 0 / 0.10)",
        "2xl": "0 32px 40px -10px rgb(0 0 0 / 0.20), 0 12px 16px -12px rgb(0 0 0 / 0.12)",
        hairline: "inset 0 0 0 1px rgb(255 255 255 / 0.06)",
        "hairline-strong": "inset 0 0 0 1px rgb(255 255 255 / 0.10)",
        "hairline-subtle": "inset 0 0 0 1px rgb(255 255 255 / 0.04)",
        ring: "0 0 0 2px rgb(var(--nada-accent) / 0.25), 0 0 0 1px rgb(var(--nada-accent) / 0.40)",
      },
      colors: {
        nada: {
          bg:                 "rgb(var(--nada-bg) / <alpha-value>)",
          surface:            "rgb(var(--nada-surface) / <alpha-value>)",
          "surface-elevated": "rgb(var(--nada-surface-elevated) / <alpha-value>)",
          "surface-highest":  "rgb(var(--nada-surface-highest) / <alpha-value>)",
          primary:            "rgb(var(--nada-primary) / <alpha-value>)",
          secondary:          "rgb(var(--nada-secondary) / <alpha-value>)",
          muted:              "rgb(var(--nada-muted) / <alpha-value>)",
          border:             "rgb(var(--nada-border) / <alpha-value>)",
          "border-subtle":    "rgb(var(--nada-border-subtle) / <alpha-value>)",
          accent:             "rgb(var(--nada-accent) / <alpha-value>)",
          "accent-soft":      "rgb(var(--nada-accent-soft) / <alpha-value>)",
          "accent-deep":      "rgb(var(--nada-accent-deep) / <alpha-value>)",
          violet:             "rgb(var(--nada-violet) / <alpha-value>)",
          sent:               "rgb(var(--nada-sent) / <alpha-value>)",
          received:           "rgb(var(--nada-received) / <alpha-value>)",
          danger:             "rgb(var(--nada-danger) / <alpha-value>)",
          success:            "rgb(var(--nada-success) / <alpha-value>)",
          warning:            "rgb(var(--nada-warning) / <alpha-value>)",
          overlay:            "rgb(var(--nada-overlay) / <alpha-value>)",
          input:              "rgb(var(--nada-input-bg) / <alpha-value>)"
        },
        accent:           "rgb(var(--nada-accent) / <alpha-value>)",
        background:       "rgb(var(--nada-bg) / <alpha-value>)",
        border:           "rgb(var(--nada-border) / <alpha-value>)",
        muted:            "rgb(var(--nada-muted) / <alpha-value>)",
        primary:          "rgb(var(--nada-primary) / <alpha-value>)",
        secondary:        "rgb(var(--nada-secondary) / <alpha-value>)",
        surface:          "rgb(var(--nada-surface) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "system-ui", "sans-serif"],
        display: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        "2xs":   ["11px",  { lineHeight: "1.4", letterSpacing: "0.01em" }],
        xs:      ["12px",  { lineHeight: "1.5", letterSpacing: "0.005em" }],
        sm:      ["13px",  { lineHeight: "1.5", letterSpacing: "-0.003em" }],
        base:    ["14px",  { lineHeight: "1.55", letterSpacing: "-0.006em" }],
        md:      ["15px",  { lineHeight: "1.55", letterSpacing: "-0.008em" }],
        lg:      ["17px",  { lineHeight: "1.45", letterSpacing: "-0.012em" }],
        xl:      ["20px",  { lineHeight: "1.35", letterSpacing: "-0.016em" }],
        "2xl":   ["24px",  { lineHeight: "1.25", letterSpacing: "-0.020em" }],
        "3xl":   ["30px",  { lineHeight: "1.15", letterSpacing: "-0.024em" }],
        "4xl":   ["38px",  { lineHeight: "1.10", letterSpacing: "-0.028em" }],
        "5xl":   ["48px",  { lineHeight: "1.05", letterSpacing: "-0.032em" }],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" }
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "shimmer": {
          "0%": { backgroundPosition: "-500px 0" },
          "100%": { backgroundPosition: "500px 0" }
        },
        "dot-pulse": {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1.1)" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "fade-up": "fade-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right": "slide-in-right 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-left": "slide-in-left 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "shimmer": "shimmer 1.5s infinite linear",
        "dot-pulse": "dot-pulse 1.4s ease-in-out infinite",
      },
      spacing: {
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-top": "env(safe-area-inset-top)",
      },
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.16, 1, 0.3, 1)",
        "snap": "cubic-bezier(0.87, 0, 0.13, 1)",
      },
      zIndex: {
        base: "0",
        docked: "1",
        dropdown: "50",
        sticky: "100",
        header: "200",
        overlay: "300",
        modal: "400",
        toast: "500",
        tooltip: "600",
      }
    }
  },
  plugins: []
} satisfies Config;

export default config;
