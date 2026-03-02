/**
 * iTunes metadata cache — persisted to IndexedDB via Zustand persist.
 *
 * Rust fetches data from the iTunes Search API on demand; this store caches
 * the results client-side with a 7-day TTL to avoid redundant API calls.
 *
 * Naming conventions for cache keys:
 *   - artists : lowercase artist name
 *   - albums  : `${artist.toLowerCase()}::${album.toLowerCase()}`
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  itunesSearchArtist,
  itunesSearchAlbum,
  type ItunesArtistInfo,
  type ItunesAlbumInfo,
} from "../lib/itunes"
import { idbJSONStorage } from "./idbStorage"

const ARTIST_ALBUM_TTL_MS = 7 * 24 * 60 * 60_000  // 7 days

interface CacheEntry<T> {
  data: T
  cachedAt: number
}

interface ItunesMetadataState {
  artists: Record<string, CacheEntry<ItunesArtistInfo>>
  albums:  Record<string, CacheEntry<ItunesAlbumInfo>>

  /** Fetch artist info, using cache if still fresh. Returns null if not found. */
  getArtist: (artist: string) => Promise<ItunesArtistInfo | null>

  /** Fetch album info, using cache if still fresh. Returns null if not found. */
  getAlbum: (artist: string, album: string) => Promise<ItunesAlbumInfo | null>

  /** Clear all cached metadata. */
  clearCache: () => void

  /** Count of cached entries per category. */
  stats: () => { artistCount: number; albumCount: number }
}

export const useItunesMetadataStore = create<ItunesMetadataState>()(
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
          const data = await itunesSearchArtist(artist)
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
          const data = await itunesSearchAlbum(artist, album)
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
      name: "itunes-metadata-v1",
      storage: idbJSONStorage,
      partialize: (s) => ({
        artists: s.artists,
        albums: s.albums,
      }),
    },
  ),
)
