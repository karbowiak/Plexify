/**
 * Apple iTunes Search API — TypeScript wrappers around Tauri invoke() calls.
 *
 * No API key or authentication required. All data is public.
 * Results should be cached by the caller (see itunesMetadataStore).
 */

import { invoke } from "@tauri-apps/api/core"

export interface ItunesArtistInfo {
  name: string
  /** Primary genre from Apple's taxonomy (e.g. "Electronic", "Pop"). */
  genre: string
  apple_music_url: string
  artist_id: number
}

export interface ItunesAlbumInfo {
  title: string
  artist: string
  /** Full-resolution album cover (~1000×1000) from Apple CDN. Null if unavailable. */
  cover_url: string | null
  genre: string
  /** ISO date string e.g. "2001-03-07" */
  release_date: string
  track_count: number
  apple_music_url: string
}

/** Search iTunes for an artist. Returns the best match or null if not found. */
export const itunesSearchArtist = (artist: string): Promise<ItunesArtistInfo | null> =>
  invoke("itunes_search_artist", { artist })

/** Search iTunes for an album. Returns the best match or null if not found. */
export const itunesSearchAlbum = (artist: string, album: string): Promise<ItunesAlbumInfo | null> =>
  invoke("itunes_search_album", { artist, album })
