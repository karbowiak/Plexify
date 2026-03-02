/**
 * Last.fm auth + settings state.
 *
 * Mirrors the LastFM-related fields from PlexSettings (which lives on disk).
 * No Zustand persist needed — state is seeded from `loadSettings()` on init
 * and written back to disk via Tauri commands on every change.
 *
 * Important: the API secret is NEVER stored here — it lives only in Rust.
 */

import { create } from "zustand"
import { loadSettings } from "../lib/plex"
import {
  lastfmCompleteAuth,
  lastfmDisconnect as lastfmDisconnectApi,
  lastfmSetEnabled as lastfmSetEnabledApi,
  lastfmSetLoveThreshold as lastfmSetLoveThresholdApi,
  lastfmSetReplaceMetadata as lastfmSetReplaceMetadataApi,
} from "../lib/lastfm"

interface LastfmState {
  /** Whether the user has a valid session key on disk. */
  isAuthenticated: boolean
  /** Whether scrobbling + now-playing updates are enabled. */
  isEnabled: boolean
  /** Last.fm username to display in Settings. Null if not authenticated. */
  username: string | null
  /** Whether to use Last.fm as the primary metadata source (true) or augment Plex (false). */
  replaceMetadata: boolean
  /**
   * Minimum Plex rating (0–10) that triggers a Last.fm love.
   * Plex scale: 0=unrated, 2=1★, 4=2★, 6=3★, 8=4★, 10=5★.
   * Default 6 = 3 stars.
   */
  loveThreshold: number

  // Actions
  /** Seed state from saved settings. Call once on app start. */
  initialize: () => Promise<void>
  /** Enable or disable scrobbling (saves to disk). */
  setEnabled: (enabled: boolean) => Promise<void>
  /** Exchange an authorized token for a permanent session key. */
  completeAuth: (token: string) => Promise<void>
  /** Clear session key + username from disk and reset local state. */
  disconnect: () => Promise<void>
  /** Toggle augment/replace metadata mode (saves to disk). */
  setReplaceMetadata: (replace: boolean) => Promise<void>
  /** Update the love threshold rating (saves to disk). */
  setLoveThreshold: (threshold: number) => Promise<void>
}

export const useLastfmStore = create<LastfmState>((set) => ({
  isAuthenticated: false,
  isEnabled: false,
  username: null,
  replaceMetadata: false,
  loveThreshold: 6,

  initialize: async () => {
    try {
      const settings = await loadSettings()
      set({
        isAuthenticated: !!settings.lastfm_session_key,
        isEnabled: settings.lastfm_enabled,
        username: settings.lastfm_username || null,
        replaceMetadata: settings.lastfm_replace_metadata,
        loveThreshold: settings.lastfm_love_threshold ?? 6,
      })
    } catch {
      // Settings not yet saved — keep defaults
    }
  },

  setEnabled: async (enabled) => {
    await lastfmSetEnabledApi(enabled)
    set({ isEnabled: enabled })
  },

  completeAuth: async (token) => {
    const session = await lastfmCompleteAuth(token)
    await lastfmSetEnabledApi(true)
    set({
      isAuthenticated: true,
      isEnabled: true,
      username: session.username,
    })
  },

  disconnect: async () => {
    await lastfmDisconnectApi()
    set({
      isAuthenticated: false,
      isEnabled: false,
      username: null,
    })
  },

  setReplaceMetadata: async (replace) => {
    await lastfmSetReplaceMetadataApi(replace)
    set({ replaceMetadata: replace })
  },

  setLoveThreshold: async (threshold) => {
    await lastfmSetLoveThresholdApi(threshold)
    set({ loveThreshold: threshold })
  },
}))
