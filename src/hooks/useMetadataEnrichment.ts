/**
 * Centralized metadata enrichment hooks.
 *
 * Instead of each component importing 3 metadata stores + 3 types + calling
 * useMetadataFetch manually, components use these hooks which return all
 * enrichment data from a single call.
 */

import { useState } from "react"
import { useLastfmMetadataStore } from "../metadata/lastfm/store"
import { useDeezerMetadataStore } from "../metadata/deezer/store"
import { useItunesMetadataStore } from "../metadata/apple/store"
import type { LastfmArtistInfo, LastfmAlbumInfo, LastfmTrackInfo } from "../metadata/lastfm/api"
import type { DeezerArtistInfo, DeezerAlbumInfo } from "../metadata/deezer/api"
import type { ItunesArtistInfo, ItunesAlbumInfo } from "../metadata/apple/api"
import { useMetadataFetch } from "./useMetadataFetch"

export interface ArtistEnrichment {
  lastfm: LastfmArtistInfo | null
  deezer: DeezerArtistInfo | null
  itunes: ItunesArtistInfo | null
}

export interface AlbumEnrichment {
  lastfm: LastfmAlbumInfo | null
  deezer: DeezerAlbumInfo | null
  itunes: ItunesAlbumInfo | null
}

export interface TrackEnrichment {
  lastfm: LastfmTrackInfo | null
  deezer: DeezerArtistInfo | null
}

/**
 * Fetch enrichment metadata for an artist from all metadata backends.
 * Re-fetches when artistName changes. Returns null for each backend until loaded.
 */
export function useArtistEnrichment(artistName: string | null): ArtistEnrichment {
  const getLastfm = useLastfmMetadataStore(s => s.getArtist)
  const getDeezer = useDeezerMetadataStore(s => s.getArtist)
  const getItunes = useItunesMetadataStore(s => s.getArtist)

  const [lastfm, setLastfm] = useState<LastfmArtistInfo | null>(null)
  const [deezer, setDeezer] = useState<DeezerArtistInfo | null>(null)
  const [itunes, setItunes] = useState<ItunesArtistInfo | null>(null)

  useMetadataFetch([
    { key: artistName, fetch: () => getLastfm(artistName!), setState: setLastfm },
    { key: artistName, fetch: () => getDeezer(artistName!), setState: setDeezer },
    { key: artistName, fetch: () => getItunes(artistName!), setState: setItunes },
  ], [artistName, getLastfm, getDeezer, getItunes])

  return { lastfm, deezer, itunes }
}

/**
 * Fetch enrichment metadata for an album from all metadata backends.
 * Re-fetches when artistName or albumName changes.
 */
export function useAlbumEnrichment(artistName: string | null, albumName: string | null): AlbumEnrichment {
  const getLastfm = useLastfmMetadataStore(s => s.getAlbum)
  const getDeezer = useDeezerMetadataStore(s => s.getAlbum)
  const getItunes = useItunesMetadataStore(s => s.getAlbum)

  const [lastfm, setLastfm] = useState<LastfmAlbumInfo | null>(null)
  const [deezer, setDeezer] = useState<DeezerAlbumInfo | null>(null)
  const [itunes, setItunes] = useState<ItunesAlbumInfo | null>(null)

  const key = artistName && albumName ? `${artistName}::${albumName}` : null

  useMetadataFetch([
    { key, fetch: () => getLastfm(artistName!, albumName!), setState: setLastfm },
    { key, fetch: () => getDeezer(artistName!, albumName!), setState: setDeezer },
    { key, fetch: () => getItunes(artistName!, albumName!), setState: setItunes },
  ], [key, getLastfm, getDeezer, getItunes])

  return { lastfm, deezer, itunes }
}

/**
 * Fetch enrichment metadata for a track from metadata backends that support track info.
 * Also fetches the artist's Deezer data for fan count display in TrackInfoPanel.
 */
export function useTrackEnrichment(artistName: string | null, trackName: string | null): TrackEnrichment {
  const getLastfm = useLastfmMetadataStore(s => s.getTrack)
  const getDeezerArtist = useDeezerMetadataStore(s => s.getArtist)

  const [lastfm, setLastfm] = useState<LastfmTrackInfo | null>(null)
  const [deezer, setDeezer] = useState<DeezerArtistInfo | null>(null)

  const key = artistName && trackName ? `${artistName}::${trackName}` : null

  useMetadataFetch([
    { key, fetch: () => getLastfm(artistName!, trackName!), setState: setLastfm },
    { key: artistName, fetch: () => getDeezerArtist(artistName!), setState: setDeezer },
  ], [key, artistName, getLastfm, getDeezerArtist])

  return { lastfm, deezer }
}

// Re-export types for consumers
export type { LastfmArtistInfo, LastfmAlbumInfo, LastfmTrackInfo } from "../metadata/lastfm/api"
export type { DeezerArtistInfo, DeezerAlbumInfo } from "../metadata/deezer/api"
export type { ItunesArtistInfo, ItunesAlbumInfo } from "../metadata/apple/api"
