import { create } from "zustand"
import { persist } from "zustand/middleware"
import { audioSetEq, audioSetEqEnabled } from "../lib/plex"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EQ_LABELS = ["32", "64", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"]

export type EqGains = [number, number, number, number, number, number, number, number, number, number]

const FLAT: EqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

export const EQ_PRESETS: { name: string; gains: EqGains }[] = [
  { name: "Flat",         gains: [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0] },
  { name: "Bass Boost",   gains: [ 8,  6,  4,  2,  0,  0,  0,  0,  0,  0] },
  { name: "Treble Boost", gains: [ 0,  0,  0,  0,  0,  0,  2,  4,  6,  8] },
  { name: "Vocal",        gains: [-2, -2,  0,  3,  5,  5,  3,  0, -2, -2] },
  { name: "Electronic",   gains: [ 7,  5,  0,  0, -3, -2,  0,  4,  6,  7] },
  { name: "Rock",         gains: [ 5,  4,  3,  1, -1, -1,  0,  3,  4,  5] },
  { name: "Classical",    gains: [ 0,  0,  0,  0,  0,  0, -2, -3, -3, -4] },
]

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface EqState {
  gains: EqGains
  enabled: boolean
  setBand: (index: number, db: number) => void
  setEnabled: (enabled: boolean) => void
  applyPreset: (preset: EqGains) => void
  syncToEngine: () => void
}

export const useEqStore = create<EqState>()(
  persist(
    (set, get) => ({
      gains: [...FLAT] as EqGains,
      enabled: false,

      setBand: (index, db) => {
        const next = [...get().gains] as EqGains
        next[index] = db
        set({ gains: next })
        if (get().enabled) {
          void audioSetEq(next)
        }
      },

      setEnabled: (enabled) => {
        set({ enabled })
        void audioSetEqEnabled(enabled)
        if (enabled) {
          void audioSetEq(get().gains)
        }
      },

      applyPreset: (preset) => {
        set({ gains: [...preset] as EqGains })
        if (get().enabled) {
          void audioSetEq(preset)
        }
      },

      syncToEngine: () => {
        const { gains, enabled } = get()
        void audioSetEqEnabled(enabled)
        if (enabled) {
          void audioSetEq(gains)
        }
      },
    }),
    {
      name: "plex-eq-v1",
      partialize: (state) => ({ gains: state.gains, enabled: state.enabled }),
    },
  ),
)
