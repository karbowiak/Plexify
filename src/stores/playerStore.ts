import { create } from "zustand"
import { buildItemUri, createPlayQueue, getStreamUrl } from "../lib/plex"
import type { Track } from "../types/plex"
import { useConnectionStore } from "./connectionStore"

interface PlayerState {
  currentTrack: Track | null
  queue: Track[]
  queueIndex: number
  queueId: number | null
  isPlaying: boolean
  positionMs: number
  streamUrl: string | null
  shuffle: boolean
  repeat: 0 | 1 | 2
  volume: number

  playTrack: (track: Track, context?: Track[]) => Promise<void>
  /** Play a Plex URI via a server-side play queue. Handles full playlists with shuffle. */
  playFromUri: (uri: string, forceShuffle?: boolean) => Promise<void>
  pause: () => void
  resume: () => void
  next: () => void
  prev: () => void
  seekTo: (ms: number) => void
  setVolume: (v: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  updatePosition: (ms: number) => void
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: 0,
  queueId: null,
  isPlaying: false,
  positionMs: 0,
  streamUrl: null,
  shuffle: false,
  repeat: 0,
  volume: 80,

  playTrack: async (track: Track, context?: Track[]) => {
    const { sectionUuid } = useConnectionStore.getState()
    const itemKey = `/library/metadata/${track.rating_key}`
    const uri = sectionUuid ? buildItemUri(sectionUuid, itemKey) : itemKey
    const { shuffle, repeat } = get()

    try {
      const [playQueue, streamUrl] = await Promise.all([
        createPlayQueue(uri, shuffle, repeat),
        track.media[0]?.parts[0]?.key ? getStreamUrl(track.media[0].parts[0].key) : Promise.resolve(null),
      ])

      const queue = context ?? [track]
      const queueIndex = Math.max(0, context ? context.findIndex(t => t.rating_key === track.rating_key) : 0)

      set({
        currentTrack: track,
        queue,
        queueIndex,
        queueId: playQueue.id,
        isPlaying: true,
        positionMs: 0,
        streamUrl,
      })
    } catch (err) {
      console.error("playTrack failed:", err)
    }
  },

  playFromUri: async (uri: string, forceShuffle?: boolean) => {
    const { shuffle, repeat } = get()
    const shouldShuffle = forceShuffle ?? shuffle
    try {
      const playQueue = await createPlayQueue(uri, shouldShuffle, repeat)
      if (playQueue.items.length === 0) return
      const firstTrack = playQueue.items[0]
      const streamUrl = firstTrack.media[0]?.parts[0]?.key
        ? await getStreamUrl(firstTrack.media[0].parts[0].key)
        : null
      set({
        currentTrack: firstTrack,
        queue: playQueue.items,
        queueIndex: 0,
        queueId: playQueue.id,
        isPlaying: true,
        positionMs: 0,
        streamUrl,
        shuffle: shouldShuffle,
      })
    } catch (err) {
      console.error("playFromUri failed:", err)
    }
  },

  pause: () => set({ isPlaying: false }),

  resume: () => set({ isPlaying: true }),

  next: () => {
    const { queue, queueIndex, repeat } = get()
    if (queue.length === 0) return

    let nextIndex = queueIndex + 1
    if (nextIndex >= queue.length) {
      if (repeat === 2) nextIndex = 0
      else {
        set({ isPlaying: false })
        return
      }
    }
    void get().playTrack(queue[nextIndex], queue)
  },

  prev: () => {
    const { queue, queueIndex, positionMs, currentTrack } = get()
    if (positionMs > 3000 && currentTrack) {
      void get().playTrack(currentTrack, queue)
      return
    }
    const prevIndex = Math.max(0, queueIndex - 1)
    if (queue[prevIndex]) void get().playTrack(queue[prevIndex], queue)
  },

  seekTo: (ms: number) => set({ positionMs: ms }),

  setVolume: (v: number) => set({ volume: Math.max(0, Math.min(100, v)) }),

  toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),

  cycleRepeat: () => set(s => ({ repeat: ((s.repeat + 1) % 3) as 0 | 1 | 2 })),

  updatePosition: (ms: number) => set({ positionMs: ms }),
}))
