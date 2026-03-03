import { create } from "zustand"
import { persist } from "zustand/middleware"
import { idbJSONStorage } from "./idbStorage"
import { evictStaleEntries } from "./cacheUtils"

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60_000  // 7 days

export interface CacheEntry<T> {
  data: T
  cachedAt: number
}

export interface MetadataStoreState<ArtistT, AlbumT> {
  artists: Record<string, CacheEntry<ArtistT>>
  albums: Record<string, CacheEntry<AlbumT>>
  _hasHydrated: boolean
  getArtist: (artist: string) => Promise<ArtistT | null>
  getAlbum: (artist: string, album: string) => Promise<AlbumT | null>
  clearCache: () => void
  stats: () => { artistCount: number; albumCount: number }
}

interface CreateMetadataStoreOpts<ArtistT, AlbumT> {
  storeName: string
  fetchArtist: (artist: string) => Promise<ArtistT | null>
  fetchAlbum: (artist: string, album: string) => Promise<AlbumT | null>
  artistTtl?: number
  albumTtl?: number
  guard?: () => boolean
}

export function createMetadataStore<ArtistT, AlbumT>(
  opts: CreateMetadataStoreOpts<ArtistT, AlbumT>
) {
  const {
    storeName,
    fetchArtist,
    fetchAlbum,
    artistTtl = DEFAULT_TTL_MS,
    albumTtl = DEFAULT_TTL_MS,
    guard,
  } = opts

  const inflightArtists = new Map<string, Promise<ArtistT | null>>()
  const inflightAlbums = new Map<string, Promise<AlbumT | null>>()

  const store = create<MetadataStoreState<ArtistT, AlbumT>>()(
    persist(
      (set, get) => ({
        artists: {},
        albums: {},
        _hasHydrated: false,

        getArtist: async (artist) => {
          if (guard && !guard()) return null
          const key = artist.toLowerCase()
          const cached = get().artists[key]
          if (cached && Date.now() - cached.cachedAt < artistTtl) return cached.data
          const existing = inflightArtists.get(key)
          if (existing) return existing
          const promise = (async () => {
            try {
              const data = await fetchArtist(artist)
              if (data) set((s) => ({ artists: { ...s.artists, [key]: { data, cachedAt: Date.now() } } }))
              return data
            } catch {
              return null
            } finally {
              inflightArtists.delete(key)
            }
          })()
          inflightArtists.set(key, promise)
          return promise
        },

        getAlbum: async (artist, album) => {
          if (guard && !guard()) return null
          const key = `${artist.toLowerCase()}::${album.toLowerCase()}`
          const cached = get().albums[key]
          if (cached && Date.now() - cached.cachedAt < albumTtl) return cached.data
          const existing = inflightAlbums.get(key)
          if (existing) return existing
          const promise = (async () => {
            try {
              const data = await fetchAlbum(artist, album)
              if (data) set((s) => ({ albums: { ...s.albums, [key]: { data, cachedAt: Date.now() } } }))
              return data
            } catch {
              return null
            } finally {
              inflightAlbums.delete(key)
            }
          })()
          inflightAlbums.set(key, promise)
          return promise
        },

        clearCache: () => set({ artists: {}, albums: {} }),

        stats: () => {
          const { artists, albums } = get()
          return { artistCount: Object.keys(artists).length, albumCount: Object.keys(albums).length }
        },
      }),
      {
        name: storeName,
        storage: idbJSONStorage,
        partialize: (s) => ({ artists: s.artists, albums: s.albums }),
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.artists = evictStaleEntries(state.artists)
            state.albums = evictStaleEntries(state.albums)
          }
          store.setState({ _hasHydrated: true })
        },
      },
    ),
  )

  return store
}
