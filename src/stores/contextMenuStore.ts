import { create } from "zustand"
import type { MusicTrack, MusicAlbum, MusicArtist, MusicPlaylist } from "../types/music"

export type ContextMenuType = "track" | "album" | "artist" | "playlist"

type ContextMenuData = MusicTrack | MusicAlbum | MusicArtist | MusicPlaylist

interface ContextMenuState {
  open: boolean
  x: number
  y: number
  type: ContextMenuType | null
  data: ContextMenuData | null
  /** When non-null, the context menu was opened from within a playlist view */
  playlistId: string | null
  show: (x: number, y: number, type: ContextMenuType, data: ContextMenuData, playlistId?: string | null) => void
  close: () => void
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  type: null,
  data: null,
  playlistId: null,

  show: (x, y, type, data, playlistId) => set({ open: true, x, y, type, data, playlistId: playlistId ?? null }),
  close: () => set({ open: false }),
}))
