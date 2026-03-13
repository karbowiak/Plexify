/**
 * ListenBrainz API — TypeScript wrappers around Tauri invoke() calls.
 *
 * Authentication uses a simple user token (no OAuth).
 */

import { invoke } from "@tauri-apps/api/core"

export interface ListenBrainzTokenResult {
  valid: boolean
  username: string
}

/** Validate a token, save to settings, and return the username. */
export const listenbrainzSaveToken = (token: string): Promise<ListenBrainzTokenResult> =>
  invoke("listenbrainz_save_token", { token })

/** Clear token/username from settings (disconnect). */
export const listenbrainzDisconnect = (): Promise<void> =>
  invoke("listenbrainz_disconnect")

/** Enable or disable ListenBrainz scrobbling. */
export const listenbrainzSetEnabled = (enabled: boolean): Promise<void> =>
  invoke("listenbrainz_set_enabled", { enabled })

export interface ListenBrainzMbids {
  recordingMbid?: string
  artistMbids?: string[]
  releaseMbid?: string
  releaseGroupMbid?: string
}

/** Notify ListenBrainz that a track has started playing. */
export const listenbrainzSubmitNowPlaying = (
  artist: string,
  track: string,
  album: string,
  durationMs: number,
  mbids?: ListenBrainzMbids,
): Promise<void> =>
  invoke("listenbrainz_submit_now_playing", {
    artist,
    track,
    album,
    durationMs,
    recordingMbid: mbids?.recordingMbid ?? null,
    artistMbids: mbids?.artistMbids ?? null,
    releaseMbid: mbids?.releaseMbid ?? null,
    releaseGroupMbid: mbids?.releaseGroupMbid ?? null,
  })

/**
 * Submit a completed listen to ListenBrainz.
 * `listenedAt` is a Unix timestamp (seconds) when playback began.
 */
export const listenbrainzSubmitListen = (
  artist: string,
  track: string,
  album: string,
  durationMs: number,
  listenedAt: number,
  mbids?: ListenBrainzMbids,
): Promise<void> =>
  invoke("listenbrainz_submit_listen", {
    artist,
    track,
    album,
    durationMs,
    listenedAt,
    recordingMbid: mbids?.recordingMbid ?? null,
    artistMbids: mbids?.artistMbids ?? null,
    releaseMbid: mbids?.releaseMbid ?? null,
    releaseGroupMbid: mbids?.releaseGroupMbid ?? null,
  })
