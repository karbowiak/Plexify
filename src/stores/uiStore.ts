import { create } from "zustand"

interface UIState {
  showCreatePlaylist: boolean
  isRefreshing: boolean
  /** Incremented by the Refresh button — pages add this to their useEffect deps to re-run fetches. */
  pageRefreshKey: number

  setShowCreatePlaylist: (v: boolean) => void
  setIsRefreshing: (v: boolean) => void
  incrementPageRefreshKey: () => void
}

export const useUIStore = create<UIState>((set) => ({
  showCreatePlaylist: false,
  isRefreshing: false,
  pageRefreshKey: 0,

  setShowCreatePlaylist: (v: boolean) => set({ showCreatePlaylist: v }),
  setIsRefreshing: (v: boolean) => set({ isRefreshing: v }),
  incrementPageRefreshKey: () => set(s => ({ pageRefreshKey: s.pageRefreshKey + 1 })),
}))
