/**
 * Deezer public API — TypeScript wrappers around Tauri invoke() calls.
 *
 * No API key or authentication required. All data is public.
 * Results should be cached by the caller (see deezerMetadataStore).
 */

import { invoke } from "@tauri-apps/api/core"

export interface DeezerArtistInfo {
  name: string
  fans: number
  nb_albums: number
  /** Full-resolution artist image (1000×1000). Null if no image available. */
  image_url: string | null
  deezer_url: string
}

export interface DeezerAlbumInfo {
  title: string
  artist: string
  /** Full-resolution album cover (1000×1000). Null if no cover available. */
  cover_url: string | null
  genres: string[]
  fans: number
  /** ISO date string e.g. "2001-03-07" */
  release_date: string
  label: string
  deezer_url: string
}

/** Search for an artist by name. Returns the best match or null if not found. */
export const deezerSearchArtist = (artist: string): Promise<DeezerArtistInfo | null> =>
  invoke("deezer_search_artist", { artist })

/**
 * Search for an album by artist + title.
 * Makes two Deezer requests (search → detail), so cache the result.
 */
export const deezerSearchAlbum = (artist: string, album: string): Promise<DeezerAlbumInfo | null> =>
  invoke("deezer_search_album", { artist, album })
