import { create } from "zustand"
import type { Track, Album, Artist } from "../types/plex"

interface DebugPanelState {
  open: boolean
  type: "track" | "album" | "artist" | null
  data: Track | Album | Artist | null
  show: (type: "track" | "album" | "artist", data: Track | Album | Artist) => void
  close: () => void
}

export const useDebugPanelStore = create<DebugPanelState>((set) => ({
  open: false,
  type: null,
  data: null,

  show: (type, data) => set({ open: true, type, data }),
  close: () => set({ open: false }),
}))
