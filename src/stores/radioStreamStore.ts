import { create } from "zustand"
import { persist } from "zustand/middleware"
import { idbJSONStorage } from "./idbStorage"
import type { RadioStation } from "../lib/radiobrowser"
import { radiobrowserClick } from "../lib/radiobrowser"
import { radioPlay, radioStop, radioPause, radioResume, radioSetVolume, radioOnEvents } from "../lib/radioAudio"
import { engine } from "../audio/WebAudioEngine"
import { usePlayerStore } from "./playerStore"

const MAX_RECENT = 50

interface RadioStreamState {
  /** Currently playing station (null when no radio is active). */
  currentStation: RadioStation | null
  /** True while an internet radio stream is actively playing. */
  isStreamPlaying: boolean
  /** True while the stream is buffering. */
  isStreamBuffering: boolean
  /** Error message when a stream fails. */
  streamError: string | null
  /** Favorited stations (persisted). */
  favorites: RadioStation[]
  /** Recently played stations (persisted, max 50). */
  recentStations: RadioStation[]

  playStation: (station: RadioStation) => void
  stopStream: () => void
  pauseStream: () => void
  resumeStream: () => void
  toggleFavorite: (station: RadioStation) => void
  isFavorite: (uuid: string) => boolean
  clearRecent: () => void
}

let _unlisten: (() => void) | null = null

export const useRadioStreamStore = create<RadioStreamState>()(
  persist(
    (set, get) => ({
      currentStation: null,
      isStreamPlaying: false,
      isStreamBuffering: false,
      streamError: null,
      favorites: [],
      recentStations: [],

      playStation: (station: RadioStation) => {
        // Stop any existing radio stream event listeners
        _unlisten?.()
        _unlisten = null

        // Stop the Web Audio engine (Plex playback)
        engine.stop()
        // Clear Plex player state
        usePlayerStore.setState({
          isPlaying: false,
          currentTrack: null,
          isInternetRadioActive: true,
        })

        // Get volume from player store
        const volume = usePlayerStore.getState().volume

        // Start HTML5 audio
        radioPlay(station.stream_url, volume)

        // Register click for community stats (fire-and-forget)
        radiobrowserClick(station.uuid).catch(() => {})

        // Add to recent stations
        const recent = get().recentStations.filter(s => s.uuid !== station.uuid)
        recent.unshift(station)
        if (recent.length > MAX_RECENT) recent.length = MAX_RECENT

        set({
          currentStation: station,
          isStreamPlaying: true,
          isStreamBuffering: true,
          streamError: null,
          recentStations: recent,
        })

        // Listen for audio events
        _unlisten = radioOnEvents({
          onPlaying: () => set({ isStreamBuffering: false, isStreamPlaying: true, streamError: null }),
          onWaiting: () => set({ isStreamBuffering: true }),
          onError: (msg) => {
            set({ streamError: msg, isStreamPlaying: false, isStreamBuffering: false })
            setTimeout(() => set({ streamError: null }), 6000)
          },
          onPause: () => set({ isStreamPlaying: false }),
        })
      },

      stopStream: () => {
        _unlisten?.()
        _unlisten = null
        radioStop()
        usePlayerStore.setState({ isInternetRadioActive: false })
        set({ currentStation: null, isStreamPlaying: false, isStreamBuffering: false, streamError: null })
      },

      pauseStream: () => {
        radioPause()
        set({ isStreamPlaying: false })
      },

      resumeStream: () => {
        radioResume()
        set({ isStreamPlaying: true })
      },

      toggleFavorite: (station: RadioStation) => {
        const { favorites } = get()
        const exists = favorites.some(s => s.uuid === station.uuid)
        if (exists) {
          set({ favorites: favorites.filter(s => s.uuid !== station.uuid) })
        } else {
          set({ favorites: [station, ...favorites] })
        }
      },

      isFavorite: (uuid: string) => get().favorites.some(s => s.uuid === uuid),

      clearRecent: () => set({ recentStations: [] }),
    }),
    {
      name: "radio-stream-v1",
      storage: idbJSONStorage,
      partialize: (state) => ({
        favorites: state.favorites,
        recentStations: state.recentStations,
      }),
    }
  )
)
