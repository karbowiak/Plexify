import { create } from "zustand"

/**
 * Build a Plex image URL routed through the `pleximg://` custom protocol.
 *
 * The Tauri handler intercepts these URLs, caches images to disk on first
 * load, and serves cached bytes on subsequent requests — eliminating pop-in.
 * Pass the result directly to an `<img src={...}>` tag.
 */
export function buildPlexImageUrl(baseUrl: string, token: string, path: string): string {
  if (!baseUrl || !token || !path) return ""
  const base = baseUrl.replace(/\/$/, "")
  const cleanPath = path.replace(/^\//, "")
  const plexUrl = `${base}/${cleanPath}?X-Plex-Token=${token}`
  return `pleximg://img?src=${encodeURIComponent(plexUrl)}`
}
import {
  connectPlex,
  getLibrarySections,
  loadSettings,
  saveSettings,
  plexAuthStart,
} from "../lib/plex"
import type { PlexAuthPin } from "../types/plex"

interface ConnectionState {
  baseUrl: string
  token: string
  isConnected: boolean
  isLoading: boolean
  error: string | null
  musicSectionId: number | null
  sectionUuid: string | null

  allUrls: string[]

  loadAndConnect: () => Promise<void>
  connect: (baseUrl: string, token: string, allUrls?: string[]) => Promise<void>
  disconnect: () => void
  disconnectAndClear: () => Promise<void>
  clearError: () => void
  /** Start the Plex OAuth PIN flow — returns pin info for the modal to poll. */
  startPlexAuth: () => Promise<PlexAuthPin>
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  baseUrl: "",
  token: "",
  isConnected: false,
  isLoading: true,
  error: null,
  musicSectionId: null,
  sectionUuid: null,
  allUrls: [],

  loadAndConnect: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await loadSettings()
      if (!settings.base_url || !settings.token) {
        set({ isLoading: false })
        return
      }
      // Try the saved primary URL first. If it fails and we have fallbacks,
      // try them in parallel and use whichever responds first.
      try {
        await get().connect(settings.base_url, settings.token, settings.all_urls)
      } catch {
        const fallbacks = (settings.all_urls ?? []).filter(u => u !== settings.base_url)
        if (fallbacks.length === 0) throw new Error("Could not reach Plex server")
        const winner = await Promise.any(
          fallbacks.map(url => get().connect(url, settings.token, settings.all_urls).then(() => url))
        )
        // connect() already updated state; just ensure base_url is updated
        await saveSettings(winner, settings.token, settings.all_urls)
      }
    } catch (err) {
      set({ isLoading: false, error: String(err) })
    }
  },

  connect: async (baseUrl: string, token: string, allUrls?: string[]) => {
    set({ isLoading: true, error: null })
    try {
      await connectPlex(baseUrl, token)
      await saveSettings(baseUrl, token, allUrls)
      const sections = await getLibrarySections()
      const musicSection = sections.find(s => s.section_type === "artist")
      set({
        baseUrl,
        token,
        isConnected: true,
        isLoading: false,
        musicSectionId: musicSection?.key ?? null,
        sectionUuid: musicSection?.uuid ?? null,
        allUrls: allUrls ?? [],
      })
    } catch (err) {
      set({ isLoading: false, error: String(err), isConnected: false })
      throw err  // re-throw so callers (Promise.any, connectToServer) can handle it
    }
  },

  disconnect: () =>
    set({
      baseUrl: "",
      token: "",
      isConnected: false,
      musicSectionId: null,
      sectionUuid: null,
    }),

  disconnectAndClear: async () => {
    try {
      await saveSettings("", "")
    } catch (err) {
      console.error("Failed to clear saved settings:", err)
    }
    set({
      baseUrl: "",
      token: "",
      isConnected: false,
      musicSectionId: null,
      sectionUuid: null,
    })
  },

  clearError: () => set({ error: null }),

  startPlexAuth: async () => {
    set({ error: null })
    return plexAuthStart()
  },
}))
