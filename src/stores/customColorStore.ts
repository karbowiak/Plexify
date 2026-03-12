import { create } from "zustand"
import { persist } from "zustand/middleware"

const SEMANTIC_VARS = [
  "bg-base",
  "bg-elevated",
  "bg-surface",
  "bg-surface-hover",
  "text-primary",
  "text-secondary",
  "text-muted",
  "border",
  "border-subtle",
  "overlay",
  "scrollbar-thumb",
  "range-track",
  "accent-secondary",
] as const

export type SemanticColor = (typeof SEMANTIC_VARS)[number]

export const SEMANTIC_COLOR_LABELS: Record<SemanticColor, string> = {
  "bg-base": "Background",
  "bg-elevated": "Cards / Elevated",
  "bg-surface": "Surface",
  "bg-surface-hover": "Surface Hover",
  "text-primary": "Text Primary",
  "text-secondary": "Text Secondary",
  "text-muted": "Text Muted",
  "border": "Border",
  "border-subtle": "Border Subtle",
  "overlay": "Overlay",
  "scrollbar-thumb": "Scrollbar",
  "range-track": "Range Track",
  "accent-secondary": "Accent Secondary",
}

/** The first 9 are "UI Colors", the last 4 are "System Colors" */
export const UI_COLOR_COUNT = 9

interface CustomColorState {
  enabled: boolean
  overrides: Partial<Record<SemanticColor, string>>
  setEnabled: (v: boolean) => void
  setOverride: (key: SemanticColor, value: string | null) => void
  resetAll: () => void
}

function applyOverrides(overrides: Partial<Record<SemanticColor, string>>, enabled: boolean) {
  const s = document.documentElement.style
  for (const key of SEMANTIC_VARS) {
    if (enabled && overrides[key]) {
      s.setProperty(`--${key}`, overrides[key]!)
    } else {
      s.removeProperty(`--${key}`)
    }
  }
}

export const useCustomColorStore = create<CustomColorState>()(
  persist(
    (set, get) => ({
      enabled: false,
      overrides: {},
      setEnabled: (v: boolean) => {
        set({ enabled: v })
        applyOverrides(get().overrides, v)
      },
      setOverride: (key: SemanticColor, value: string | null) => {
        const overrides = { ...get().overrides }
        if (value) overrides[key] = value
        else delete overrides[key]
        set({ overrides })
        applyOverrides(overrides, get().enabled)
      },
      resetAll: () => {
        set({ overrides: {}, enabled: false })
        applyOverrides({}, false)
      },
    }),
    {
      name: "plex-custom-colors",
      onRehydrateStorage: () => (state) => {
        if (state) applyOverrides(state.overrides, state.enabled)
      },
    },
  ),
)
