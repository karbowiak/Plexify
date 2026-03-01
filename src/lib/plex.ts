/**
 * TypeScript wrappers around Tauri invoke() calls to the Plex Rust backend.
 *
 * Call `connectPlex(baseUrl, token)` once at startup, then use any other
 * function freely — the backend keeps the connection alive in managed state.
 *
 * Helper functions that only construct URLs (buildItemUri, buildDirectoryUri)
 * are pure client-side and need no invoke() call.
 */

import { invoke } from "@tauri-apps/api/core"
import type {
  Album,
  Artist,
  Hub,
  IdentityResponse,
  Level,
  LibrarySection,
  PlayQueue,
  Playlist,
  PlexAuthPin,
  PlexMedia,
  PlexResource,
  PlexSettings,
  ServerInfo,
  Track,
} from "../types/plex"

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** Connect to a Plex Media Server. Must be called before all other functions. */
export function connectPlex(baseUrl: string, token: string): Promise<void> {
  return invoke("connect_plex", { baseUrl, token })
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

/** Get all library sections on the server. */
export function getLibrarySections(): Promise<LibrarySection[]> {
  return invoke("get_library_sections")
}

/**
 * Search a library section.
 * @param libtype Optional filter: "artist" | "album" | "track"
 */
export function searchLibrary(
  sectionId: number,
  query: string,
  libtype?: string
): Promise<PlexMedia[]> {
  return invoke("search_library", { sectionId, query, libtype: libtype ?? null })
}

/** Get recently added items in a section. */
export function getRecentlyAdded(
  sectionId: number,
  libtype?: string,
  limit?: number
): Promise<PlexMedia[]> {
  return invoke("get_recently_added", {
    sectionId,
    libtype: libtype ?? null,
    limit: limit ?? null,
  })
}

/** Get discovery hubs (home screen cards) for a section. */
export function getHubs(sectionId: number): Promise<Hub[]> {
  return invoke("get_hubs", { sectionId })
}

/** Get "on deck" / continue listening items for a section. */
export function getOnDeck(sectionId: number): Promise<PlexMedia[]> {
  return invoke("get_on_deck", { sectionId })
}

// ---------------------------------------------------------------------------
// Metadata fetch
// ---------------------------------------------------------------------------

/** Get a specific track by its rating key. */
export function getTrack(ratingKey: number): Promise<Track> {
  return invoke("get_track", { ratingKey })
}

/** Get an artist by rating key. */
export function getArtist(ratingKey: number): Promise<Artist> {
  return invoke("get_artist", { ratingKey })
}

/** Get an album by rating key. */
export function getAlbum(ratingKey: number): Promise<Album> {
  return invoke("get_album", { ratingKey })
}

/**
 * Get albums by an artist.
 * @param formatFilter Optional Plex `album.format` filter:
 *   - `undefined` / `null` → all albums
 *   - `"Single"` → only singles
 *   - `"!Single"` → full albums and EPs (excludes singles)
 */
export function getArtistAlbums(ratingKey: number, formatFilter?: string): Promise<Album[]> {
  return invoke("get_artist_albums", { ratingKey, formatFilter: formatFilter ?? null })
}

/** Get all tracks in an album. */
export function getAlbumTracks(ratingKey: number): Promise<Track[]> {
  return invoke("get_album_tracks", { ratingKey })
}

/** Get popular tracks for an artist (PlexAmp-style top tracks). */
export function getArtistPopularTracks(
  ratingKey: number,
  limit?: number
): Promise<Track[]> {
  return invoke("get_artist_popular_tracks", { ratingKey, limit: limit ?? null })
}

/** Get popular tracks for an artist using the /popularLeaves endpoint. */
export function getArtistPopularLeaves(
  ratingKey: number,
  limit?: number
): Promise<Track[]> {
  return invoke("get_artist_popular_leaves", { ratingKey, limit: limit ?? null })
}

/** Get metadata-based similar artists (from AllMusic/MusicBrainz). */
export function getArtistSimilar(ratingKey: number): Promise<Artist[]> {
  return invoke("get_artist_similar", { ratingKey })
}

/** Get sonically similar artists using the /nearest endpoint. */
export function getArtistSonicallySimilar(
  ratingKey: number,
  limit?: number,
  maxDistance?: number
): Promise<Artist[]> {
  return invoke("get_artist_sonically_similar", {
    ratingKey,
    limit: limit ?? null,
    maxDistance: maxDistance ?? null,
  })
}

/** Get albums for an artist using the section-specific endpoint (better deduplication). */
export function getArtistAlbumsInSection(
  sectionId: number,
  ratingKey: number,
  format?: string
): Promise<Album[]> {
  return invoke("get_artist_albums_in_section", {
    sectionId,
    ratingKey,
    format: format ?? null,
  })
}

/** Get popular tracks for an artist using the section-specific endpoint (server-side dedup via group=title). */
export function getArtistPopularTracksInSection(
  sectionId: number,
  ratingKey: number,
  limit?: number
): Promise<Track[]> {
  return invoke("get_artist_popular_tracks_in_section", {
    sectionId,
    ratingKey,
    limit: limit ?? null,
  })
}

/** Get hubs related to a specific item (e.g., sonically similar artists). */
export function getRelatedHubs(ratingKey: number, limit?: number): Promise<Hub[]> {
  return invoke("get_related_hubs", { ratingKey, limit: limit ?? null })
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

/** List all playlists in a library section. */
export function getPlaylists(sectionId: number): Promise<Playlist[]> {
  return invoke("get_playlists", { sectionId })
}

/** Get tracks that the user has rated (liked), sorted by most recently rated. */
export function getLikedTracks(sectionId: number, limit?: number): Promise<Track[]> {
  return invoke("get_liked_tracks", { sectionId, limit: limit ?? null })
}

/** Get tracks inside a playlist, with optional pagination. */
export function getPlaylistItems(
  playlistId: number,
  limit?: number,
  offset?: number
): Promise<Track[]> {
  return invoke("get_playlist_items", {
    playlistId,
    limit: limit ?? null,
    offset: offset ?? null,
  })
}

/** Create a new playlist from a list of track rating keys. */
export function createPlaylist(
  title: string,
  sectionId: number,
  itemIds: number[]
): Promise<Playlist> {
  return invoke("create_playlist", { title, sectionId, itemIds })
}

// ---------------------------------------------------------------------------
// Play queue
// ---------------------------------------------------------------------------

/**
 * Create a server-side play queue.
 *
 * Build the URI with the `buildItemUri` / `buildDirectoryUri` helpers, or
 * pass a raw path like `/library/metadata/{ratingKey}`.
 *
 * @param repeat 0 = off, 1 = repeat-one, 2 = repeat-all
 */
export function createPlayQueue(
  uri: string,
  shuffle: boolean,
  repeat: number
): Promise<PlayQueue> {
  return invoke("create_play_queue", { uri, shuffle, repeat })
}

/** Fetch an existing play queue by ID. */
export function getPlayQueue(queueId: number): Promise<PlayQueue> {
  return invoke("get_play_queue", { queueId })
}

/**
 * Add items to an existing play queue.
 * @param next If true, insert after current item; if false, append to end.
 */
export function addToPlayQueue(
  queueId: number,
  uri: string,
  next: boolean
): Promise<PlayQueue> {
  return invoke("add_to_play_queue", { queueId, uri, next })
}

// ---------------------------------------------------------------------------
// Playback tracking
// ---------------------------------------------------------------------------

/** Mark an item as played (scrobble). */
export function markPlayed(ratingKey: number): Promise<void> {
  return invoke("mark_played", { ratingKey })
}

/** Mark an item as unplayed. */
export function markUnplayed(ratingKey: number): Promise<void> {
  return invoke("mark_unplayed", { ratingKey })
}

/**
 * Report playback progress to the server.
 * Call every ~10 seconds during playback.
 */
export function reportTimeline(
  ratingKey: number,
  stateStr: "playing" | "paused" | "buffering" | "stopped",
  timeMs: number,
  durationMs: number
): Promise<void> {
  return invoke("report_timeline", { ratingKey, stateStr, timeMs, durationMs })
}

// ---------------------------------------------------------------------------
// Ratings (Phase 3)
// ---------------------------------------------------------------------------

/**
 * Rate a library item.
 *
 * `rating` is on a 0–10 scale (Plex half-star: 2 = 1★, 10 = 5★).
 * Pass `null` to clear an existing rating.
 */
export function rateItem(ratingKey: number, rating: number | null): Promise<void> {
  return invoke("rate_item", { ratingKey, rating })
}

// ---------------------------------------------------------------------------
// Sonic / PlexAmp features (Phase 2)
// ---------------------------------------------------------------------------

/** Get tracks sonically similar to a given track. */
export function getSonicallySimilar(
  ratingKey: number,
  limit?: number,
  maxDistance?: number
): Promise<Track[]> {
  return invoke("get_sonically_similar", {
    ratingKey,
    limit: limit ?? null,
    maxDistance: maxDistance ?? null,
  })
}

/** Get a track radio (mix) seeded from a track. */
export function getTrackRadio(
  sectionId: number,
  ratingKey: number,
  limit?: number
): Promise<Track[]> {
  return invoke("get_track_radio", { sectionId, ratingKey, limit: limit ?? null })
}

/**
 * Get radio stations seeded from an artist.
 * Returns playlists with `radio: true`.
 */
export function getArtistStations(ratingKey: number): Promise<Playlist[]> {
  return invoke("get_artist_stations", { ratingKey })
}

/**
 * Get all music stations available in a library section.
 *
 * Returns discovery hubs; filter by `hub.hub_identifier` containing
 * `"station"` to extract the station playlists from `hub.metadata`.
 */
export function getSectionStations(sectionId: number): Promise<Hub[]> {
  return invoke("get_section_stations", { sectionId })
}

/**
 * Compute a sonic path between two tracks.
 *
 * Returns intermediate tracks that bridge the sonic gap between `fromId`
 * and `toId` — the PlexAmp "Sonic Adventure" via `computePath`.
 */
export function computeSonicPath(
  sectionId: number,
  fromId: number,
  toId: number
): Promise<Track[]> {
  return invoke("compute_sonic_path", { sectionId, fromId, toId })
}

/**
 * Get loudness/peak level data for a media stream.
 *
 * Use for waveform visualisation. `streamId` is `track.media[0].parts[0].id`.
 * `subSample` controls resolution (128 = PlexAmp default).
 */
export function getStreamLevels(
  streamId: number,
  subSample?: number
): Promise<Level[]> {
  return invoke("get_stream_levels", { streamId, subSample: subSample ?? null })
}

// ---------------------------------------------------------------------------
// Streaming URLs (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Build a direct-play stream URL for a media part.
 *
 * Pass `track.media[0].parts[0].key` as `partKey`.
 * Returns a URL you can set as the `src` of an `<audio>` element.
 */
export function getStreamUrl(partKey: string): Promise<string> {
  return invoke("get_stream_url", { partKey })
}

/**
 * Build an artwork/thumbnail URL.
 *
 * Pass `track.thumb`, `album.thumb`, `artist.thumb`, etc. as `thumbPath`.
 */
export function getThumbUrl(thumbPath: string): Promise<string> {
  return invoke("get_thumb_url", { thumbPath })
}

/**
 * Build an audio transcode URL.
 *
 * Use when the client cannot play the native format.
 * @param bitrate Max bitrate in kbps (e.g. 320)
 * @param codec Target codec: "mp3" | "aac" | "opus"
 */
export function getAudioTranscodeUrl(
  partKey: string,
  bitrate?: number,
  codec?: string
): Promise<string> {
  return invoke("get_audio_transcode_url", {
    partKey,
    bitrate: bitrate ?? null,
    codec: codec ?? null,
  })
}

// ---------------------------------------------------------------------------
// Server info (Phase 5)
// ---------------------------------------------------------------------------

/** Get the server's identity (machine ID, version, claimed status). */
export function getIdentity(): Promise<IdentityResponse> {
  return invoke("get_identity")
}

/** Get full server capabilities and metadata. */
export function getServerInfo(): Promise<ServerInfo> {
  return invoke("get_server_info")
}

// ---------------------------------------------------------------------------
// Settings persistence (Phase 5)
// ---------------------------------------------------------------------------

/** Load saved connection settings from disk. Returns empty strings if unset. */
export function loadSettings(): Promise<PlexSettings> {
  return invoke("load_settings")
}

/** Persist connection settings to disk. `allUrls` stores every known URL for fallback. */
export function saveSettings(baseUrl: string, token: string, allUrls?: string[]): Promise<void> {
  return invoke("save_settings", { baseUrl, token, allUrls: allUrls ?? null })
}

/**
 * Probe a Plex server URL for reachability and latency.
 * Uses a 5-second timeout with no retries — call in parallel for multiple candidates.
 * Returns latency in milliseconds.
 */
export function testServerConnection(url: string, token: string): Promise<number> {
  return invoke("test_server_connection", { url, token })
}

/** Delete all cached Plex artwork from disk. Called before a force-refresh. */
export function clearImageCache(): Promise<void> {
  return invoke("clear_image_cache")
}

// ---------------------------------------------------------------------------
// Plex.tv OAuth (PIN-based authentication)
// ---------------------------------------------------------------------------

/**
 * Start the Plex OAuth PIN flow.
 *
 * Returns a `PlexAuthPin` containing:
 * - `pin_id`: poll with `plexAuthPoll()` every ~2s until a token arrives
 * - `auth_url`: open in the system browser so the user can sign in
 */
export function plexAuthStart(): Promise<PlexAuthPin> {
  return invoke("plex_auth_start")
}

/**
 * Poll plex.tv to check if the user has completed authentication.
 *
 * Returns the auth token string when done, or `null` while still waiting.
 * Call every ~2 seconds until non-null or the user cancels.
 */
export function plexAuthPoll(pinId: number): Promise<string | null> {
  return invoke("plex_auth_poll", { pinId })
}

/**
 * Fetch the user's Plex Media Servers from plex.tv.
 *
 * Call once `plexAuthPoll` returns a token. Returns servers with local
 * connections listed first. If only one server exists, auto-connect to it.
 */
export function plexGetResources(token: string): Promise<PlexResource[]> {
  return invoke("plex_get_resources", { token })
}

// ---------------------------------------------------------------------------
// URI helpers (client-side, no invoke needed)
// ---------------------------------------------------------------------------

/** Build a library item URI for a single track/album/playlist. */
export function buildItemUri(sectionUuid: string, itemKey: string): string {
  return `library://${sectionUuid}/item/${itemKey}`
}

/** Build a library directory URI for an album or playlist's children. */
export function buildDirectoryUri(sectionUuid: string, itemKey: string): string {
  return `library://${sectionUuid}/directory/${itemKey}/children`
}
