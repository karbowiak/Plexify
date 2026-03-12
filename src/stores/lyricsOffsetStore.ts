import { create } from "zustand"
import { persist } from "zustand/middleware"
import { usePlayerStore } from "./playerStore"

const MIN_OFFSET = -5000
const MAX_OFFSET = 5000

interface LyricsOffsetState {
  /** Per-track offset map, keyed by track ID */
  offsets: Record<string, number>
  /** Current track ID — kept in sync via playerStore subscription */
  _trackId: string | null
  /** Derived offset for the current track (0 if no offset set) */
  offsetMs: number
  /** Set the offset for the current track (clamped to ±5s) */
  setOffset: (ms: number) => void
  /** Reset the current track's offset to 0 */
  resetOffset: () => void
}

function clamp(v: number) {
  return Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, v))
}

export const useLyricsOffsetStore = create<LyricsOffsetState>()(
  persist(
    (set, get) => ({
      offsets: {},
      _trackId: null,
      offsetMs: 0,

      setOffset: (ms: number) => {
        const trackId = get()._trackId
        if (!trackId) return
        const clamped = clamp(ms)
        const offsets = { ...get().offsets }
        if (clamped === 0) delete offsets[trackId]
        else offsets[trackId] = clamped
        set({ offsets, offsetMs: clamped })
      },

      resetOffset: () => {
        const trackId = get()._trackId
        if (!trackId) return
        const offsets = { ...get().offsets }
        delete offsets[trackId]
        set({ offsets, offsetMs: 0 })
      },
    }),
    {
      name: "plex-lyrics-offsets",
      partialize: (s) => ({ offsets: s.offsets }),
    },
  ),
)

// Subscribe to playerStore track changes — update _trackId and derive offsetMs
let _prevTrackId: string | null = null
usePlayerStore.subscribe((s) => {
  const trackId = s.currentTrack?.id ?? null
  if (trackId === _prevTrackId) return
  _prevTrackId = trackId
  const offsets = useLyricsOffsetStore.getState().offsets
  useLyricsOffsetStore.setState({
    _trackId: trackId,
    offsetMs: trackId ? (offsets[trackId] ?? 0) : 0,
  })
})
