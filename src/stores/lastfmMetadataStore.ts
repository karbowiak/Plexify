/**
 * Last.fm metadata cache — persisted to IndexedDB via Zustand persist.
 *
 * Rust fetches data from Last.fm on demand; this store caches the results
 * client-side with TTL to avoid redundant API calls.
 *
 * TTLs:
 *   - artist / album : 7 days  (biographical data changes infrequently)
 *   - track          : 3 days  (play counts update more often)
 *
 * Naming conventions for cache keys:
 *   - artists : lowercase artist name
 *   - albums  : `${artist.toLowerCase()}::${album.toLowerCase()}`
 *   - tracks  : `${artist.toLowerCase()}::${track.toLowerCase()}`
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  lastfmGetAlbumInfo,
  lastfmGetArtistInfo,
  lastfmGetTrackInfo,
  type LastfmAlbumInfo,
  type LastfmArtistInfo,
  type LastfmTrackInfo,
} from "../lib/lastfm"
import { idbJSONStorage } from "./idbStorage"
import { useLastfmStore } from "./lastfmStore"

// ---------------------------------------------------------------------------
// TTLs
// ---------------------------------------------------------------------------

const ARTIST_ALBUM_TTL_MS = 7 * 24 * 60 * 60_000  // 7 days
const TRACK_TTL_MS = 3 * 24 * 60 * 60_000          // 3 days

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T
  cachedAt: number  // Date.now() timestamp
}

interface LastfmMetadataState {
  artists: Record<string, CacheEntry<LastfmArtistInfo>>
  albums:  Record<string, CacheEntry<LastfmAlbumInfo>>
  tracks:  Record<string, CacheEntry<LastfmTrackInfo>>

  /**
   * Fetch artist info, using cache if still fresh.
   * Returns null if the API key is not configured or artist not found.
   */
  getArtist: (artist: string) => Promise<LastfmArtistInfo | null>

  /**
   * Fetch album info, using cache if still fresh.
   * Returns null if the API key is not configured or album not found.
   */
  getAlbum: (artist: string, album: string) => Promise<LastfmAlbumInfo | null>

  /**
   * Fetch track info, using cache if still fresh.
   * Returns null if the API key is not configured or track not found.
   */
  getTrack: (artist: string, track: string) => Promise<LastfmTrackInfo | null>

  /** Clear all cached metadata (resets artists, albums, tracks). */
  clearCache: () => void

  /** Computed stats — count of cached entries per category. */
  stats: () => { artistCount: number; albumCount: number; trackCount: number }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useLastfmMetadataStore = create<LastfmMetadataState>()(
  persist(
    (set, get) => ({
      artists: {},
      albums: {},
      tracks: {},

      getArtist: async (artist) => {
        if (!useLastfmStore.getState().hasApiKey) return null
        const key = artist.toLowerCase()
        const cached = get().artists[key]
        if (cached && Date.now() - cached.cachedAt < ARTIST_ALBUM_TTL_MS) {
          return cached.data
        }
        try {
          const data = await lastfmGetArtistInfo(artist)
          set((s) => ({
            artists: { ...s.artists, [key]: { data, cachedAt: Date.now() } },
          }))
          return data
        } catch {
          return null
        }
      },

      getAlbum: async (artist, album) => {
        if (!useLastfmStore.getState().hasApiKey) return null
        const key = `${artist.toLowerCase()}::${album.toLowerCase()}`
        const cached = get().albums[key]
        if (cached && Date.now() - cached.cachedAt < ARTIST_ALBUM_TTL_MS) {
          return cached.data
        }
        try {
          const data = await lastfmGetAlbumInfo(artist, album)
          set((s) => ({
            albums: { ...s.albums, [key]: { data, cachedAt: Date.now() } },
          }))
          return data
        } catch {
          return null
        }
      },

      getTrack: async (artist, track) => {
        if (!useLastfmStore.getState().hasApiKey) return null
        const key = `${artist.toLowerCase()}::${track.toLowerCase()}`
        const cached = get().tracks[key]
        if (cached && Date.now() - cached.cachedAt < TRACK_TTL_MS) {
          return cached.data
        }
        try {
          const data = await lastfmGetTrackInfo(artist, track)
          set((s) => ({
            tracks: { ...s.tracks, [key]: { data, cachedAt: Date.now() } },
          }))
          return data
        } catch {
          return null
        }
      },

      clearCache: () => set({ artists: {}, albums: {}, tracks: {} }),

      stats: () => {
        const { artists, albums, tracks } = get()
        return {
          artistCount: Object.keys(artists).length,
          albumCount: Object.keys(albums).length,
          trackCount: Object.keys(tracks).length,
        }
      },
    }),
    {
      name: "lastfm-metadata-v1",
      storage: idbJSONStorage,
      // Only persist the data maps — actions are functions and can't be serialized
      partialize: (s) => ({
        artists: s.artists,
        albums: s.albums,
        tracks: s.tracks,
      }),
    },
  ),
)
