import { create } from "zustand"
import { persist } from "zustand/middleware"
import { engine } from "../audio/WebAudioEngine"

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AudioSettingsState {
  normalizationEnabled: boolean
  crossfadeWindowMs: number
  crossfadeStyle: number
  sameAlbumCrossfade: boolean
  smartCrossfade: boolean
  preampDb: number
  albumGainMode: boolean
  preferredDevice: string | null

  setNormalizationEnabled: (enabled: boolean) => void
  setCrossfadeWindowMs: (ms: number) => void
  setCrossfadeStyle: (style: number) => void
  setSameAlbumCrossfade: (enabled: boolean) => void
  setSmartCrossfade: (enabled: boolean) => void
  setPreampDb: (db: number) => void
  setAlbumGainMode: (enabled: boolean) => void
  setPreferredDevice: (name: string | null) => void
  syncToEngine: () => void
}

export const useAudioSettingsStore = create<AudioSettingsState>()(
  persist(
    (set, get) => ({
      normalizationEnabled: true,
      crossfadeWindowMs: 8000,
      crossfadeStyle: 0,
      sameAlbumCrossfade: false,
      smartCrossfade: true,
      preampDb: 0,
      albumGainMode: false,
      preferredDevice: null,

      setNormalizationEnabled: (enabled) => {
        set({ normalizationEnabled: enabled })
        engine.setNormalizationEnabled(enabled)
      },

      setCrossfadeWindowMs: (ms) => {
        set({ crossfadeWindowMs: ms })
        engine.setCrossfadeWindow(ms)
      },

      setCrossfadeStyle: (style) => {
        set({ crossfadeStyle: style })
        // Web Audio engine only supports smooth crossfade — style stored for UI display
      },

      setSameAlbumCrossfade: (enabled) => {
        set({ sameAlbumCrossfade: enabled })
        engine.setSameAlbumCrossfade(enabled)
      },

      setSmartCrossfade: (enabled) => {
        set({ smartCrossfade: enabled })
        engine.setSmartCrossfade(enabled)
      },

      setPreampDb: (db) => {
        set({ preampDb: db })
        engine.setPreampGain(db)
      },

      setAlbumGainMode: (enabled) => {
        set({ albumGainMode: enabled })
        // No direct engine call needed — gain value is resolved at play time
      },

      setPreferredDevice: (name) => {
        set({ preferredDevice: name })
        // Web Audio API uses system default — device selection is N/A
      },

      syncToEngine: () => {
        const { normalizationEnabled, crossfadeWindowMs, sameAlbumCrossfade, smartCrossfade, preampDb } = get()
        engine.setNormalizationEnabled(normalizationEnabled)
        engine.setCrossfadeWindow(crossfadeWindowMs)
        engine.setSameAlbumCrossfade(sameAlbumCrossfade)
        engine.setSmartCrossfade(smartCrossfade)
        engine.setPreampGain(preampDb)
      },
    }),
    {
      name: "plex-audio-settings-v1",
      partialize: (state) => ({
        normalizationEnabled: state.normalizationEnabled,
        crossfadeWindowMs: state.crossfadeWindowMs,
        crossfadeStyle: state.crossfadeStyle,
        sameAlbumCrossfade: state.sameAlbumCrossfade,
        smartCrossfade: state.smartCrossfade,
        preampDb: state.preampDb,
        albumGainMode: state.albumGainMode,
        preferredDevice: state.preferredDevice,
      }),
    },
  ),
)
