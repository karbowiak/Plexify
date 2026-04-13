import { create } from "zustand"
import { persist } from "zustand/middleware"

interface EasterEggState {
  rainbow: boolean
  partyMode: boolean
  vinylSpin: boolean
  vaporwave: boolean

  toggleRainbow: () => void
  togglePartyMode: () => void
  toggleVinylSpin: () => void
  toggleVaporwave: () => void
}

export const useEasterEggStore = create<EasterEggState>()(
  persist(
    (set) => ({
      rainbow: false,
      partyMode: false,
      vinylSpin: false,
      vaporwave: false,

      toggleRainbow: () => set((s) => ({ rainbow: !s.rainbow })),
      togglePartyMode: () => set((s) => ({ partyMode: !s.partyMode })),
      toggleVinylSpin: () => set((s) => ({ vinylSpin: !s.vinylSpin })),
      toggleVaporwave: () => set((s) => ({ vaporwave: !s.vaporwave })),
    }),
    { name: "easter-eggs-v1" },
  ),
)
