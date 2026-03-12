/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Driven by --accent-rgb CSS variable set by accentStore.ts
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        // Driven by CSS custom properties — switch automatically in light/dark mode
        "app-bg":           "var(--bg-base)",
        "app-card":         "var(--bg-elevated)",
        "app-surface":      "var(--bg-surface)",
        "app-surface-hover":"var(--bg-surface-hover)",
        // Accent tints — driven by accentStore.ts
        "accent-tint":        "var(--accent-tint)",
        "accent-tint-subtle": "var(--accent-tint-subtle)",
        "accent-tint-strong": "var(--accent-tint-strong)",
        "accent-tint-hover":  "var(--accent-tint-hover)",
        // Overlay colours — driven by CSS vars
        "overlay":        "var(--overlay)",
        "overlay-hover":  "var(--overlay-hover)",
        "overlay-subtle": "var(--overlay-subtle)",
        "overlay-medium": "var(--overlay-medium)",
        // Configurable highlight colours — driven by highlightStore.ts
        "hl-card":  "var(--hl-card)",
        "hl-row":   "var(--hl-row)",
        "hl-menu":  "var(--hl-menu)",
        "hl-queue": "var(--hl-queue)",
        "accent-secondary": "var(--accent-secondary)",
        "range-track": "var(--range-track)",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("tailwind-scrollbar")({ nocompatible: true }),
  ],
}
