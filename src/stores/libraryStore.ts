import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { MusicPlaylist, MusicTrack, MusicAlbum, MusicArtist, MusicItem, MusicHub } from "../types/music"
import { useProviderStore } from "./providerStore"
import { idbJSONStorage } from "./idbStorage"

export interface SeedItem {
  id: string
  title: string
  thumb: string | null  // already-resolved image:// URL
  subtitle: string
}

export interface RecentMix {
  id: string
  createdAt: number
  tabType: "artist" | "album" | "track"
  seeds: SeedItem[]
}

const TTL_MS = {
  playlists: 5 * 60_000,           //  5 minutes
  recentlyAdded: 10 * 60_000,      // 10 minutes
  hubs: 15 * 60_000,               // 15 minutes
  likedTracks: 10 * 60_000,        // 10 minutes
  likedArtists: 10 * 60_000,       // 10 minutes
  likedAlbums: 10 * 60_000,        // 10 minutes
  tags: 24 * 60 * 60_000,          // 24 hours
}

/**
 * Playlists at or below this size are loaded in a single request and fully cached.
 * Playlists above this use infinite scroll (INITIAL_PAGE_SIZE first, then PAGE_SIZE pages).
 */
const SMALL_PLAYLIST_THRESHOLD = 1000

/**
 * First-page size for large playlists (> SMALL_PLAYLIST_THRESHOLD).
 * Kept small so even a 50,000-track smart playlist renders the first rows quickly.
 */
const INITIAL_PAGE_SIZE = 50

/** Tracks per page for infinite-scroll fetches on large playlists. */
const PAGE_SIZE = 100

/**
 * Background prefetch is limited to playlists at or below this size.
 * Matches SMALL_PLAYLIST_THRESHOLD so that prefetched playlists are always fully loaded.
 */
const PREFETCH_THRESHOLD = SMALL_PLAYLIST_THRESHOLD

/** Milliseconds between sequential background prefetch requests. */
const PREFETCH_DELAY_MS = 100

interface FetchOpts {
  force?: boolean
}

/**
 * Module-level: deduplicate concurrent first-page fetches for the same playlist.
 * If the user clicks a playlist while a prefetch for it is in-flight, both get
 * the same Promise — no duplicate network request.
 */
const inflight = new Map<string, Promise<MusicTrack[]>>()

function fetchInitial(playlistId: string, limit: number): Promise<MusicTrack[]> {
  const existing = inflight.get(playlistId)
  if (existing) return existing
  const provider = useProviderStore.getState().provider
  if (!provider) return Promise.resolve([])
  const p = provider.getPlaylistItems(playlistId, 0, limit)
    .then(r => r.items)
    .finally(() => { inflight.delete(playlistId) })
  inflight.set(playlistId, p)
  return p
}

interface LibraryState {
  playlists: MusicPlaylist[]
  recentlyAdded: MusicItem[]
  hubs: MusicHub[]
  likedTracks: MusicTrack[]
  likedArtists: MusicArtist[]
  likedAlbums: MusicAlbum[]
  currentPlaylist: MusicPlaylist | null
  currentPlaylistItems: MusicTrack[]
  currentPlaylistId: string | null
  isLoading: boolean
  isFetchingMore: boolean
  error: string | null

  /** Per-playlist track cache. Key = playlist id. */
  playlistItemsCache: Record<string, MusicTrack[]>
  /** True once all pages for a playlist have been fetched. */
  playlistIsFullyLoaded: Record<string, boolean>
  /** Per-mix track cache. Key = mix item key (the API path). */
  mixTracksCache: Record<string, MusicTrack[]>
  /** Shown in TopBar during startup pre-fetch. Null when idle. */
  prefetchStatus: { done: number; total: number } | null

  // Tag data (genre/mood/style) — pre-loaded with 24h TTL
  tagsGenre: { tag: string; count: number | null }[]
  tagsMood: { tag: string; count: number | null }[]
  tagsStyle: { tag: string; count: number | null }[]

  /** Last 5 custom mixes built by the user in the Mix Builder. Persisted. */
  recentMixes: RecentMix[]

  // WebSocket-driven state
  libraryScanning: boolean
  libraryScanProgress: number | null
  wsConnected: boolean

  setLibraryScanning: (scanning: boolean, progress: number | null) => void
  setWsConnected: (connected: boolean) => void

  // TTL timestamps (null = never fetched)
  _playlistsFetchedAt: number | null
  _recentlyAddedFetchedAt: number | null
  _hubsFetchedAt: number | null
  _likedTracksFetchedAt: number | null
  _likedTracksLimit: number | undefined
  _likedArtistsFetchedAt: number | null
  _likedArtistsLimit: number | undefined
  _likedAlbumsFetchedAt: number | null
  _likedAlbumsLimit: number | undefined
  _tagsFetchedAt: number | null

  fetchPlaylists: (opts?: FetchOpts) => Promise<void>
  fetchRecentlyAdded: (limit?: number, opts?: FetchOpts) => Promise<void>
  fetchHubs: (opts?: FetchOpts) => Promise<void>
  fetchLikedTracks: (limit?: number, opts?: FetchOpts) => Promise<void>
  fetchLikedArtists: (limit?: number, opts?: FetchOpts) => Promise<void>
  fetchLikedAlbums: (limit?: number, opts?: FetchOpts) => Promise<void>
  fetchTags: (opts?: FetchOpts) => Promise<void>
  addRecentMix: (seeds: SeedItem[], tabType: "artist" | "album" | "track") => void
  fetchPlaylistItems: (playlistId: string) => Promise<void>
  fetchMorePlaylistItems: (playlistId: string) => Promise<void>
  prefetchAllPlaylists: () => Promise<void>
  prefetchMixTracks: () => Promise<void>
  createPlaylist: (title: string) => Promise<MusicPlaylist>
  refreshAll: () => Promise<void>
  /** Evict a single playlist's item cache and refetch if it's currently viewed. */
  invalidatePlaylistItems: (playlistId: string) => void
  /** Remove a playlist from the sidebar list and clean its item cache. */
  removePlaylist: (id: string) => void
  /** Rename a playlist in the sidebar list. */
  renamePlaylist: (id: string, newTitle: string) => void
  /** Called after any rating change to update cached data. */
  onItemRated: (id: string, itemType: "track" | "album" | "artist", newRating: number | null) => void
  /** Null out all TTL timestamps and playlist caches so the next fetch hits the network. */
  invalidateCache: () => void
  /** Null out only library content TTLs (playlists/recentlyAdded/hubs). Does NOT wipe item caches. */
  invalidateLibraryTTLs: () => void
  /** Wipe all library data and caches. Call on disconnect / backend switch. */
  clearAll: () => void
}

/** Helper: get the active provider or return null. */
function getProvider() {
  return useProviderStore.getState().provider
}

export const useLibraryStore = create<LibraryState>()(persist((set, get) => ({
  playlists: [],
  recentlyAdded: [],
  hubs: [],
  likedTracks: [],
  likedArtists: [],
  likedAlbums: [],
  currentPlaylist: null,
  currentPlaylistItems: [],
  currentPlaylistId: null,
  isLoading: false,
  isFetchingMore: false,
  error: null,
  playlistItemsCache: {},
  playlistIsFullyLoaded: {},
  mixTracksCache: {},
  tagsGenre: [],
  tagsMood: [],
  tagsStyle: [],
  recentMixes: [],
  prefetchStatus: null,
  libraryScanning: false,
  libraryScanProgress: null,
  wsConnected: false,

  setLibraryScanning: (scanning, progress) => set({
    libraryScanning: scanning,
    libraryScanProgress: scanning ? progress : null,
  }),

  setWsConnected: (connected) => set({ wsConnected: connected }),

  _playlistsFetchedAt: null,
  _recentlyAddedFetchedAt: null,
  _hubsFetchedAt: null,
  _likedTracksFetchedAt: null,
  _likedTracksLimit: undefined,
  _likedArtistsFetchedAt: null,
  _likedArtistsLimit: undefined,
  _likedAlbumsFetchedAt: null,
  _likedAlbumsLimit: undefined,
  _tagsFetchedAt: null,

  fetchPlaylists: async (opts: FetchOpts = {}) => {
    const { _playlistsFetchedAt } = get()
    if (!opts.force && _playlistsFetchedAt !== null && Date.now() - _playlistsFetchedAt < TTL_MS.playlists) return
    const provider = getProvider()
    if (!provider) return
    try {
      const playlists = await provider.getPlaylists()
      set({ playlists, _playlistsFetchedAt: Date.now() })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  fetchRecentlyAdded: async (limit = 50, opts: FetchOpts = {}) => {
    const { _recentlyAddedFetchedAt } = get()
    if (!opts.force && _recentlyAddedFetchedAt !== null && Date.now() - _recentlyAddedFetchedAt < TTL_MS.recentlyAdded) return
    const provider = getProvider()
    if (!provider) return
    try {
      const recentlyAdded = await provider.getRecentlyAdded(undefined, limit)
      set({ recentlyAdded, _recentlyAddedFetchedAt: Date.now() })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  fetchHubs: async (opts: FetchOpts = {}) => {
    const { _hubsFetchedAt } = get()
    if (!opts.force && _hubsFetchedAt !== null && Date.now() - _hubsFetchedAt < TTL_MS.hubs) return
    const provider = getProvider()
    if (!provider) return
    try {
      const hubs = (await provider.getHubs()).filter(h => h.identifier)
      set({ hubs, _hubsFetchedAt: Date.now() })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  fetchLikedTracks: async (limit = 500, opts: FetchOpts = {}) => {
    const { _likedTracksFetchedAt, _likedTracksLimit } = get()
    const needsMore = _likedTracksLimit !== undefined && limit > _likedTracksLimit
    if (!opts.force && !needsMore && _likedTracksFetchedAt !== null && Date.now() - _likedTracksFetchedAt < TTL_MS.likedTracks) return
    const provider = getProvider()
    if (!provider) return
    try {
      const likedTracks = await provider.getLikedTracks(limit)
      set({ likedTracks, _likedTracksFetchedAt: Date.now(), _likedTracksLimit: limit })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  fetchLikedArtists: async (limit = 500, opts: FetchOpts = {}) => {
    const { _likedArtistsFetchedAt, _likedArtistsLimit } = get()
    const needsMore = _likedArtistsLimit !== undefined && limit > _likedArtistsLimit
    if (!opts.force && !needsMore && _likedArtistsFetchedAt !== null && Date.now() - _likedArtistsFetchedAt < TTL_MS.likedArtists) return
    const provider = getProvider()
    if (!provider) return
    try {
      const likedArtists = await provider.getLikedArtists(limit)
      set({ likedArtists, _likedArtistsFetchedAt: Date.now(), _likedArtistsLimit: limit })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  fetchLikedAlbums: async (limit = 500, opts: FetchOpts = {}) => {
    const { _likedAlbumsFetchedAt, _likedAlbumsLimit } = get()
    const needsMore = _likedAlbumsLimit !== undefined && limit > _likedAlbumsLimit
    if (!opts.force && !needsMore && _likedAlbumsFetchedAt !== null && Date.now() - _likedAlbumsFetchedAt < TTL_MS.likedAlbums) return
    const provider = getProvider()
    if (!provider) return
    try {
      const likedAlbums = await provider.getLikedAlbums(limit)
      set({ likedAlbums, _likedAlbumsFetchedAt: Date.now(), _likedAlbumsLimit: limit })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  fetchTags: async (opts: FetchOpts = {}) => {
    const { _tagsFetchedAt, tagsGenre, tagsMood, tagsStyle } = get()
    const isEmpty = tagsGenre.length === 0 && tagsMood.length === 0 && tagsStyle.length === 0
    if (!opts.force && !isEmpty && _tagsFetchedAt !== null && Date.now() - _tagsFetchedAt < TTL_MS.tags) return
    const provider = getProvider()
    if (!provider || !provider.getTags) return
    try {
      const [g, m, s] = await Promise.allSettled([
        provider.getTags("genre"),
        provider.getTags("mood"),
        provider.getTags("style"),
      ])
      set({
        tagsGenre: g.status === "fulfilled" ? g.value.sort((a, b) => a.tag.localeCompare(b.tag)) : get().tagsGenre,
        tagsMood:  m.status === "fulfilled" ? m.value.sort((a, b) => a.tag.localeCompare(b.tag)) : get().tagsMood,
        tagsStyle: s.status === "fulfilled" ? s.value.sort((a, b) => a.tag.localeCompare(b.tag)) : get().tagsStyle,
        _tagsFetchedAt: Date.now(),
      })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  addRecentMix: (seeds, tabType) => {
    const seedSig = seeds.map(s => s.id).sort().join(",")
    const entry: RecentMix = { id: String(Date.now()), createdAt: Date.now(), tabType, seeds }
    set(state => {
      const filtered = state.recentMixes.filter(
        m => m.seeds.map(s => s.id).sort().join(",") !== seedSig
      )
      return { recentMixes: [entry, ...filtered].slice(0, 5) }
    })
  },

  fetchPlaylistItems: async (playlistId: string) => {
    const { playlistItemsCache } = get()
    const playlist = get().playlists.find(p => p.id === playlistId) ?? null

    // Always set the current playlist metadata immediately so the header renders.
    set({ currentPlaylist: playlist, currentPlaylistId: playlistId, error: null })

    // Cache hit — show items instantly, no loading state needed.
    if (playlistItemsCache[playlistId]) {
      set({ currentPlaylistItems: playlistItemsCache[playlistId], isLoading: false })
      return
    }

    // Decide fetch strategy: load everything at once for small playlists.
    const totalCount = playlist?.trackCount ?? 0
    const isSmall = totalCount > 0 && totalCount <= SMALL_PLAYLIST_THRESHOLD
    const limit = isSmall ? totalCount : INITIAL_PAGE_SIZE

    set({ isLoading: true, currentPlaylistItems: [] })
    try {
      const items = await fetchInitial(playlistId, limit)
      const isFullyLoaded = isSmall || items.length < INITIAL_PAGE_SIZE
      set(state => ({
        currentPlaylistItems: items,
        isLoading: false,
        playlistItemsCache: { ...state.playlistItemsCache, [playlistId]: items },
        playlistIsFullyLoaded: { ...state.playlistIsFullyLoaded, [playlistId]: isFullyLoaded },
      }))
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  fetchMorePlaylistItems: async (playlistId: string) => {
    const { playlistItemsCache, playlistIsFullyLoaded, isFetchingMore, isLoading } = get()
    if (isFetchingMore || isLoading) return  // don't overlap with initial page load
    if (playlistIsFullyLoaded[playlistId]) return

    const existing = playlistItemsCache[playlistId] ?? []
    const provider = getProvider()
    if (!provider) return

    set({ isFetchingMore: true })
    try {
      const result = await provider.getPlaylistItems(playlistId, existing.length, PAGE_SIZE)
      const items = result.items
      const newAll = [...existing, ...items]
      const isFullyLoaded = items.length < PAGE_SIZE
      set(state => ({
        isFetchingMore: false,
        playlistItemsCache: { ...state.playlistItemsCache, [playlistId]: newAll },
        playlistIsFullyLoaded: { ...state.playlistIsFullyLoaded, [playlistId]: isFullyLoaded },
        // Update the visible list only if this is still the active playlist.
        ...(state.currentPlaylistId === playlistId ? { currentPlaylistItems: newAll } : {}),
      }))
    } catch (err) {
      set({ isFetchingMore: false, error: String(err) })
    }
  },

  /**
   * Background-prefetch all small playlists (trackCount ≤ PREFETCH_THRESHOLD).
   * Runs sequentially with a short delay between requests so it doesn't saturate
   * the server. Already-cached playlists are skipped.
   */
  prefetchAllPlaylists: async () => {
    const playlists = get().playlists
    const toFetch = playlists
      .filter(p => p.trackCount <= PREFETCH_THRESHOLD && !get().playlistItemsCache[p.id])
      .sort((a, b) => a.trackCount - b.trackCount)

    if (toFetch.length === 0) return

    set({ prefetchStatus: { done: 0, total: toFetch.length } })

    for (let i = 0; i < toFetch.length; i++) {
      const playlist = toFetch[i]

      // Skip if the user already navigated to it and it's now cached.
      if (get().playlistItemsCache[playlist.id]) {
        set({ prefetchStatus: { done: i + 1, total: toFetch.length } })
        continue
      }

      try {
        const limit = playlist.trackCount > 0 ? playlist.trackCount : INITIAL_PAGE_SIZE
        const items = await fetchInitial(playlist.id, limit)
        const isFullyLoaded = true  // prefetch only runs for playlists ≤ PREFETCH_THRESHOLD
        set(state => ({
          playlistItemsCache: { ...state.playlistItemsCache, [playlist.id]: items },
          playlistIsFullyLoaded: { ...state.playlistIsFullyLoaded, [playlist.id]: isFullyLoaded },
          prefetchStatus: { done: i + 1, total: toFetch.length },
        }))
      } catch {
        // Don't let one failure abort the entire prefetch run.
        set({ prefetchStatus: { done: i + 1, total: toFetch.length } })
      }

      if (i < toFetch.length - 1) {
        await new Promise<void>(resolve => setTimeout(resolve, PREFETCH_DELAY_MS))
      }
    }

    set({ prefetchStatus: null })
  },

  /**
   * Background-prefetch track lists for all mix hub items.
   * Runs sequentially with a short delay. Already-cached mixes are skipped.
   */
  prefetchMixTracks: async () => {
    const { hubs, mixTracksCache } = get()
    const provider = getProvider()
    if (!provider || !provider.getMixTracks) return

    const mixItems = hubs
      .filter(h => h.identifier?.startsWith("music.mixes"))
      .flatMap(h => h.items)
      .filter(item => {
        if (item.type !== "playlist") return false
        return item.providerKey && !mixTracksCache[item.providerKey]
      })

    for (let i = 0; i < mixItems.length; i++) {
      const item = mixItems[i]
      if (item.type !== "playlist") continue
      const key = item.providerKey
      if (!key) continue
      if (get().mixTracksCache[key]) continue  // already fetched by concurrent path

      try {
        const tracks = await provider.getMixTracks(key)
        set(state => ({
          mixTracksCache: { ...state.mixTracksCache, [key]: tracks },
        }))
      } catch {
        // Don't abort remaining mixes on failure
      }

      if (i < mixItems.length - 1) {
        await new Promise<void>(resolve => setTimeout(resolve, PREFETCH_DELAY_MS))
      }
    }
  },

  createPlaylist: async (title: string) => {
    const provider = getProvider()
    if (!provider) throw new Error("No provider")
    const playlist = await provider.createPlaylist(title, [])
    set(state => ({ playlists: [...state.playlists, playlist] }))
    return playlist
  },

  /** Force-refresh all home-page data (used by the Refresh button). */
  refreshAll: async () => {
    await Promise.all([
      get().fetchPlaylists({ force: true }),
      get().fetchRecentlyAdded(50, { force: true }),
      get().fetchHubs({ force: true }),
    ])
  },

  invalidatePlaylistItems: (playlistId: string) => {
    const { playlistItemsCache, playlistIsFullyLoaded, currentPlaylistId } = get()
    const { [playlistId]: _items, ...restCache } = playlistItemsCache
    const { [playlistId]: _loaded, ...restLoaded } = playlistIsFullyLoaded
    set({ playlistItemsCache: restCache, playlistIsFullyLoaded: restLoaded })
    // Refetch if the user is currently viewing this playlist
    if (currentPlaylistId === playlistId) {
      void get().fetchPlaylistItems(playlistId)
    }
  },

  removePlaylist: (id: string) => {
    const { playlistItemsCache, playlistIsFullyLoaded, currentPlaylistId } = get()
    const { [id]: _items, ...restCache } = playlistItemsCache
    const { [id]: _loaded, ...restLoaded } = playlistIsFullyLoaded
    set({
      playlists: get().playlists.filter(p => p.id !== id),
      playlistItemsCache: restCache,
      playlistIsFullyLoaded: restLoaded,
      ...(currentPlaylistId === id ? { currentPlaylist: null, currentPlaylistItems: [], currentPlaylistId: null } : {}),
    })
  },

  renamePlaylist: (id: string, newTitle: string) => {
    set({
      playlists: get().playlists.map(p =>
        p.id === id ? { ...p, title: newTitle } : p
      ),
      currentPlaylist: get().currentPlaylist?.id === id
        ? { ...get().currentPlaylist!, title: newTitle }
        : get().currentPlaylist,
    })
  },

  onItemRated: (id: string, itemType: "track" | "album" | "artist", newRating: number | null) => {
    if (itemType === "track") {
      // Invalidate liked tracks TTL so next visit re-fetches
      set({ _likedTracksFetchedAt: null })
      // Update rating in likedTracks list
      set({
        likedTracks: get().likedTracks.map(t =>
          t.id === id ? { ...t, userRating: newRating } : t
        ),
      })
      // Update rating in playlist item caches
      const cache = get().playlistItemsCache
      const updated: Record<string, MusicTrack[]> = {}
      for (const [pid, tracks] of Object.entries(cache)) {
        const changed = tracks.some(t => t.id === id)
        if (changed) {
          updated[pid] = tracks.map(t =>
            t.id === id ? { ...t, userRating: newRating } : t
          )
        }
      }
      if (Object.keys(updated).length > 0) {
        set({ playlistItemsCache: { ...cache, ...updated } })
        // Also update current playlist items if affected
        const { currentPlaylistId, currentPlaylistItems } = get()
        if (currentPlaylistId && updated[currentPlaylistId]) {
          set({ currentPlaylistItems: updated[currentPlaylistId] })
        } else if (currentPlaylistItems.some(t => t.id === id)) {
          set({
            currentPlaylistItems: currentPlaylistItems.map(t =>
              t.id === id ? { ...t, userRating: newRating } : t
            ),
          })
        }
      }
    } else if (itemType === "album") {
      set({ _likedAlbumsFetchedAt: null })
      set({
        likedAlbums: get().likedAlbums.map(a =>
          a.id === id ? { ...a, userRating: newRating } : a
        ),
      })
    } else if (itemType === "artist") {
      set({ _likedArtistsFetchedAt: null })
      set({
        likedArtists: get().likedArtists.map(a =>
          a.id === id ? { ...a, userRating: newRating } : a
        ),
      })
    }
  },

  invalidateCache: () => set({
    _playlistsFetchedAt: null,
    _recentlyAddedFetchedAt: null,
    _hubsFetchedAt: null,
    _likedTracksFetchedAt: null,
    _likedTracksLimit: undefined,
    _likedArtistsFetchedAt: null,
    _likedArtistsLimit: undefined,
    _likedAlbumsFetchedAt: null,
    _likedAlbumsLimit: undefined,
    _tagsFetchedAt: null,
    playlistItemsCache: {},
    playlistIsFullyLoaded: {},
    mixTracksCache: {},
  }),

  invalidateLibraryTTLs: () => set({
    _playlistsFetchedAt: null,
    _recentlyAddedFetchedAt: null,
    _hubsFetchedAt: null,
  }),

  /** Wipe all library data and caches. Call on disconnect / backend switch. */
  clearAll: () => set({
    playlists: [],
    recentlyAdded: [],
    hubs: [],
    likedTracks: [],
    likedArtists: [],
    likedAlbums: [],
    currentPlaylist: null,
    currentPlaylistItems: [],
    currentPlaylistId: null,
    tagsGenre: [],
    tagsMood: [],
    tagsStyle: [],
    playlistItemsCache: {},
    playlistIsFullyLoaded: {},
    mixTracksCache: {},
    prefetchStatus: null,
    libraryScanning: false,
    libraryScanProgress: null,
    wsConnected: false,
    error: null,
    _playlistsFetchedAt: null,
    _recentlyAddedFetchedAt: null,
    _hubsFetchedAt: null,
    _likedTracksFetchedAt: null,
    _likedTracksLimit: undefined,
    _likedArtistsFetchedAt: null,
    _likedArtistsLimit: undefined,
    _likedAlbumsFetchedAt: null,
    _likedAlbumsLimit: undefined,
    _tagsFetchedAt: null,
  }),
}), {
  name: "plex-library-v1",
  storage: idbJSONStorage,
  // Persist library data + TTL timestamps. Ephemeral state (loading flags,
  // per-playlist track cache, etc.) is intentionally excluded.
  partialize: (state) => ({
    playlists: state.playlists,
    recentlyAdded: state.recentlyAdded,
    hubs: state.hubs,
    likedTracks: state.likedTracks,
    likedArtists: state.likedArtists,
    likedAlbums: state.likedAlbums,
    tagsGenre: state.tagsGenre,
    tagsMood: state.tagsMood,
    tagsStyle: state.tagsStyle,
    recentMixes: state.recentMixes,
    _playlistsFetchedAt: state._playlistsFetchedAt,
    _recentlyAddedFetchedAt: state._recentlyAddedFetchedAt,
    _hubsFetchedAt: state._hubsFetchedAt,
    _likedTracksFetchedAt: state._likedTracksFetchedAt,
    _likedArtistsFetchedAt: state._likedArtistsFetchedAt,
    _likedAlbumsFetchedAt: state._likedAlbumsFetchedAt,
    _tagsFetchedAt: state._tagsFetchedAt,
  }),
  // Sanitize persisted data — stale hubs may lack `items` or `identifier`
  // after schema changes, which causes crashes during render.
  merge: (persisted, current) => {
    const p = persisted as Partial<LibraryState> | undefined
    if (!p) return current
    const sanitizedHubs = Array.isArray(p.hubs)
      ? p.hubs.filter(h => h && h.identifier && Array.isArray(h.items))
      : []
    return { ...current, ...p, hubs: sanitizedHubs }
  },
}))
