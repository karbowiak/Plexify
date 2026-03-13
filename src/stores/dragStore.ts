import { create } from "zustand"
import type { MusicTrack } from "../types/music"

export type DragMediaType = "track" | "album" | "artist"

export interface DragPayload {
  type: DragMediaType
  /** Track IDs (for type=track) or single album/artist ID */
  ids: string[]
  /** Full track objects when immediately available (type=track) */
  tracks?: MusicTrack[]
  /** Display label for the ghost */
  label: string
}

interface DragState {
  /** Current drag payload */
  payload: DragPayload | null
  /** Whether a pointer-drag is actively in progress */
  isDragging: boolean
  /** Current pointer position (for overlay positioning) */
  cursorX: number
  cursorY: number
  /** Playlist ID the pointer is currently hovering over */
  hoveredPlaylistId: string | null
  /** Whether hovering over the queue drop zone */
  hoveredQueue: boolean

  // Legacy compat — used by sidebar playlist drop
  draggedTrackIds: string[] | null

  startDrag: (payload: DragPayload, x: number, y: number) => void
  updateCursor: (x: number, y: number) => void
  endDrag: () => void
}

export const useDragStore = create<DragState>((set) => ({
  payload: null,
  isDragging: false,
  cursorX: 0,
  cursorY: 0,
  hoveredPlaylistId: null,
  hoveredQueue: false,
  draggedTrackIds: null,

  startDrag: (payload, x, y) => set({
    payload,
    draggedTrackIds: payload.type === "track" ? payload.ids : null,
    isDragging: true,
    cursorX: x,
    cursorY: y,
    hoveredPlaylistId: null,
    hoveredQueue: false,
  }),

  updateCursor: (x, y) => {
    const els = document.elementsFromPoint(x, y)
    let playlistId: string | null = null
    let queue = false
    for (const el of els) {
      const htm = el as HTMLElement
      const playlistTarget = htm.closest?.("[data-playlist-drop-target]") as HTMLElement | null
      if (playlistTarget) {
        playlistId = playlistTarget.dataset.playlistDropTarget ?? null
        break
      }
      const queueTarget = htm.closest?.("[data-queue-drop-target]") as HTMLElement | null
      if (queueTarget) {
        queue = true
        break
      }
    }
    set({ cursorX: x, cursorY: y, hoveredPlaylistId: playlistId, hoveredQueue: queue })
  },

  endDrag: () => set({
    payload: null,
    draggedTrackIds: null,
    isDragging: false,
    hoveredPlaylistId: null,
    hoveredQueue: false,
  }),
}))
