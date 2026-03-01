import { create } from "zustand"
import { searchLibrary } from "../lib/plex"
import type { PlexMedia } from "../types/plex"

interface SearchState {
  query: string
  results: PlexMedia[]
  isSearching: boolean
  error: string | null

  setQuery: (q: string) => void
  search: (sectionId: number, q: string) => Promise<void>
  clear: () => void
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  results: [],
  isSearching: false,
  error: null,

  setQuery: (q: string) => set({ query: q }),

  search: async (sectionId: number, q: string) => {
    if (!q.trim()) {
      set({ results: [], isSearching: false })
      return
    }
    set({ isSearching: true, error: null, query: q })
    try {
      const results = await searchLibrary(sectionId, q)
      set({ results, isSearching: false })
    } catch (err) {
      set({ error: String(err), isSearching: false })
    }
  },

  clear: () => set({ query: "", results: [], isSearching: false, error: null }),
}))
