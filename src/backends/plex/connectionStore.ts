import { create } from "zustand"
import { PlexProvider } from "./provider"
import { useProviderStore } from "../../stores/providerStore"
import { useLibraryStore } from "../../stores/libraryStore"
import {
  connectPlex,
  getIdentity,
  getLibrarySections,
  loadSettings,
  saveSettings,
  plexAuthStart,
} from "./api"
import type { PlexAuthPin } from "./types"

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

      const sectionId = musicSection?.key ?? null
      const sectionUuid = musicSection?.uuid ?? null

      // Fetch machine identifier for server-level URIs (playlists)
      const identity = await getIdentity()

      // Create and register the PlexProvider in the global provider store
      const provider = new PlexProvider()
      await provider.connect({ baseUrl, token, sectionId, sectionUuid, machineIdentifier: identity.machine_identifier })
      useProviderStore.getState().setProvider(provider)

      set({
        baseUrl,
        token,
        isConnected: true,
        isLoading: false,
        musicSectionId: sectionId,
        sectionUuid,
        allUrls: allUrls ?? [],
      })
    } catch (err) {
      set({ isLoading: false, error: String(err), isConnected: false })
      throw err  // re-throw so callers (Promise.any, connectToServer) can handle it
    }
  },

  disconnect: () => {
    useProviderStore.getState().clearProvider()
    useLibraryStore.getState().clearAll()
    set({
      baseUrl: "",
      token: "",
      isConnected: false,
      musicSectionId: null,
      sectionUuid: null,
    })
  },

  disconnectAndClear: async () => {
    try {
      await saveSettings("", "")
    } catch (err) {
      console.error("Failed to clear saved settings:", err)
    }
    useProviderStore.getState().clearProvider()
    useLibraryStore.getState().clearAll()
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
