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

import { itunesSearchArtist, itunesSearchAlbum } from "../lib/itunes"
import type { ItunesArtistInfo, ItunesAlbumInfo } from "../lib/itunes"
import { createMetadataStore } from "./createMetadataStore"

export const useItunesMetadataStore = createMetadataStore<ItunesArtistInfo, ItunesAlbumInfo>({
  storeName: "itunes-metadata-v1",
  fetchArtist: itunesSearchArtist,
  fetchAlbum: itunesSearchAlbum,
})
