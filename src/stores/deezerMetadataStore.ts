/**
 * Deezer metadata cache — persisted to IndexedDB via Zustand persist.
 *
 * Rust fetches data from Deezer on demand; this store caches the results
 * client-side with a 7-day TTL to avoid redundant API calls.
 *
 * Naming conventions for cache keys:
 *   - artists : lowercase artist name
 *   - albums  : `${artist.toLowerCase()}::${album.toLowerCase()}`
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  deezerSearchArtist,
  deezerSearchAlbum,
  type DeezerArtistInfo,
  type DeezerAlbumInfo,
} from "../lib/deezer"
import { idbJSONStorage } from "./idbStorage"

const ARTIST_ALBUM_TTL_MS = 7 * 24 * 60 * 60_000  // 7 days

interface CacheEntry<T> {
  data: T
  cachedAt: number
}

interface DeezerMetadataState {
  artists: Record<string, CacheEntry<DeezerArtistInfo>>
  albums:  Record<string, CacheEntry<DeezerAlbumInfo>>

  /** Fetch artist info, using cache if still fresh. Returns null if not found. */
  getArtist: (artist: string) => Promise<DeezerArtistInfo | null>

  /** Fetch album info, using cache if still fresh. Returns null if not found. */
  getAlbum: (artist: string, album: string) => Promise<DeezerAlbumInfo | null>

  /** Clear all cached metadata. */
  clearCache: () => void

  /** Count of cached entries per category. */
  stats: () => { artistCount: number; albumCount: number }
}

export const useDeezerMetadataStore = create<DeezerMetadataState>()(
  persist(
    (set, get) => ({
      artists: {},
      albums: {},

      getArtist: async (artist) => {
        const key = artist.toLowerCase()
        const cached = get().artists[key]
        if (cached && Date.now() - cached.cachedAt < ARTIST_ALBUM_TTL_MS) {
          return cached.data
        }
        try {
          const data = await deezerSearchArtist(artist)
          if (data) {
            set((s) => ({
              artists: { ...s.artists, [key]: { data, cachedAt: Date.now() } },
            }))
          }
          return data
        } catch {
          return null
        }
      },

      getAlbum: async (artist, album) => {
        const key = `${artist.toLowerCase()}::${album.toLowerCase()}`
        const cached = get().albums[key]
        if (cached && Date.now() - cached.cachedAt < ARTIST_ALBUM_TTL_MS) {
          return cached.data
        }
        try {
          const data = await deezerSearchAlbum(artist, album)
          if (data) {
            set((s) => ({
              albums: { ...s.albums, [key]: { data, cachedAt: Date.now() } },
            }))
          }
          return data
        } catch {
          return null
        }
      },

      clearCache: () => set({ artists: {}, albums: {} }),

      stats: () => {
        const { artists, albums } = get()
        return {
          artistCount: Object.keys(artists).length,
          albumCount: Object.keys(albums).length,
        }
      },
    }),
    {
      name: "deezer-metadata-v1",
      storage: idbJSONStorage,
      partialize: (s) => ({
        artists: s.artists,
        albums: s.albums,
      }),
    },
  ),
)
