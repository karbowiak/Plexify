import { create } from "zustand"
import { persist } from "zustand/middleware"
import { engine } from "../audio/WebAudioEngine"

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AudioSettingsState {
  normalizationEnabled: boolean
  crossfadeWindowMs: number
  sameAlbumCrossfade: boolean
  smartCrossfade: boolean
  smartCrossfadeMaxMs: number
  mixrampDb: number
  preampDb: number
  albumGainMode: boolean

  setNormalizationEnabled: (enabled: boolean) => void
  setCrossfadeWindowMs: (ms: number) => void
  setSameAlbumCrossfade: (enabled: boolean) => void
  setSmartCrossfade: (enabled: boolean) => void
  setSmartCrossfadeMaxMs: (ms: number) => void
  setMixrampDb: (db: number) => void
  setPreampDb: (db: number) => void
  setAlbumGainMode: (enabled: boolean) => void
  syncToEngine: () => void
}

export const useAudioSettingsStore = create<AudioSettingsState>()(
  persist(
    (set, get) => ({
      normalizationEnabled: true,
      crossfadeWindowMs: 4000,
      sameAlbumCrossfade: false,
      smartCrossfade: true,
      smartCrossfadeMaxMs: 20000,
      mixrampDb: -17,
      preampDb: 0,
      albumGainMode: false,

      setNormalizationEnabled: (enabled) => {
        set({ normalizationEnabled: enabled })
        engine.setNormalizationEnabled(enabled)
      },

      setCrossfadeWindowMs: (ms) => {
        set({ crossfadeWindowMs: ms })
        engine.setCrossfadeWindow(ms)
      },

      setSameAlbumCrossfade: (enabled) => {
        set({ sameAlbumCrossfade: enabled })
        engine.setSameAlbumCrossfade(enabled)
      },

      setSmartCrossfade: (enabled) => {
        set({ smartCrossfade: enabled })
        engine.setSmartCrossfade(enabled)
      },

      setSmartCrossfadeMaxMs: (ms) => {
        set({ smartCrossfadeMaxMs: ms })
        engine.setSmartCrossfadeMax(ms)
      },

      setMixrampDb: (db) => {
        set({ mixrampDb: db })
        engine.setMixrampDb(db)
      },

      setPreampDb: (db) => {
        set({ preampDb: db })
        engine.setPreampGain(db)
      },

      setAlbumGainMode: (enabled) => {
        set({ albumGainMode: enabled })
        // No direct engine call needed — gain value is resolved at play time
      },

      syncToEngine: () => {
        const { normalizationEnabled, crossfadeWindowMs, sameAlbumCrossfade, smartCrossfade, smartCrossfadeMaxMs, mixrampDb, preampDb } = get()
        engine.setNormalizationEnabled(normalizationEnabled)
        engine.setCrossfadeWindow(crossfadeWindowMs)
        engine.setSameAlbumCrossfade(sameAlbumCrossfade)
        engine.setSmartCrossfade(smartCrossfade)
        engine.setSmartCrossfadeMax(smartCrossfadeMaxMs)
        engine.setMixrampDb(mixrampDb)
        engine.setPreampGain(preampDb)
      },
    }),
    {
      name: "plex-audio-settings-v1",
      partialize: (state) => ({
        normalizationEnabled: state.normalizationEnabled,
        crossfadeWindowMs: state.crossfadeWindowMs,
        sameAlbumCrossfade: state.sameAlbumCrossfade,
        smartCrossfade: state.smartCrossfade,
        smartCrossfadeMaxMs: state.smartCrossfadeMaxMs,
        mixrampDb: state.mixrampDb,
        preampDb: state.preampDb,
        albumGainMode: state.albumGainMode,
      }),
    },
  ),
)
