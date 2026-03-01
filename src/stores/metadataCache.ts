/**
 * Eager-loading metadata cache for artists and albums.
 *
 * This is a plain module-level cache (not Zustand) — the Artist/Album pages
 * seed their local useState from it for an instant first render, then
 * re-fetch in the background for freshness.
 *
 * Usage:
 *   - Call prefetchArtist/prefetchAlbum on hover (fire-and-forget).
 *   - Read getCachedArtist/getCachedAlbum at the top of the page component.
 */

import {
  getArtist,
  getArtistAlbumsInSection,
  getAlbum,
  getAlbumTracks,
} from "../lib/plex"
import type { Artist, Album, Track } from "../types/plex"

export interface ArtistCacheEntry {
  artist: Artist
  albums: Album[]
  singles: Album[]
}

export interface AlbumCacheEntry {
  album: Album
  tracks: Track[]
}

const artistCache = new Map<number, ArtistCacheEntry>()
const albumCache = new Map<number, AlbumCacheEntry>()

// Track in-flight requests to avoid duplicate network calls.
const artistInflight = new Set<number>()
const albumInflight = new Set<number>()

function dedupeBy<T>(items: T[], key: (item: T) => unknown): T[] {
  const seen = new Set()
  return items.filter(item => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function getCachedArtist(id: number): ArtistCacheEntry | undefined {
  return artistCache.get(id)
}

export function getCachedAlbum(id: number): AlbumCacheEntry | undefined {
  return albumCache.get(id)
}

/**
 * Fire-and-forget: pre-fetch the artist page's primary data.
 * Only fetches artist metadata + albums/singles — secondary data
 * (popular tracks, similar artists, etc.) still loads on navigation.
 */
export function prefetchArtist(id: number, sectionId: number): void {
  if (artistCache.has(id) || artistInflight.has(id)) return
  artistInflight.add(id)

  Promise.all([
    getArtist(id),
    getArtistAlbumsInSection(sectionId, id).catch(() => [] as Album[]),
    getArtistAlbumsInSection(sectionId, id, "EP,Single").catch(() => [] as Album[]),
  ])
    .then(([artist, allAlbums, singleList]) => {
      const dedupedSingles = dedupeBy(singleList, a => (a as Album).rating_key)
      const singleKeys = new Set(dedupedSingles.map(s => (s as Album).rating_key))
      const albums = dedupeBy(allAlbums, a => (a as Album).rating_key).filter(
        a => !singleKeys.has((a as Album).rating_key)
      )
      artistCache.set(id, { artist, albums, singles: dedupedSingles })
    })
    .catch(() => {})
    .finally(() => artistInflight.delete(id))
}

/**
 * Fire-and-forget: pre-fetch the album page's primary data.
 */
export function prefetchAlbum(id: number): void {
  if (albumCache.has(id) || albumInflight.has(id)) return
  albumInflight.add(id)

  Promise.all([getAlbum(id), getAlbumTracks(id)])
    .then(([album, tracks]) => {
      albumCache.set(id, { album, tracks })
    })
    .catch(() => {})
    .finally(() => albumInflight.delete(id))
}
