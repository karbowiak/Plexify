import type { MetadataBackendDefinition } from "../types"
import { useLastfmStore } from "./authStore"
import { useLastfmMetadataStore } from "./store"
import { LastfmSettings } from "./settings"

function LastfmIcon({ size = 18 }: { size?: number }) {
  return (
    <svg height={size} width={size} viewBox="0 0 24 24" fill="currentColor" className="text-red-500">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
    </svg>
  )
}

export const lastfmMetadataBackend: MetadataBackendDefinition = {
  id: "lastfm",
  name: "Last.fm",
  description: "Scrobbling, artist bios, tags, listener counts, and similar artists.",
  icon: LastfmIcon,
  capabilities: {
    artistBio: true,
    artistImages: false,
    albumCovers: false,
    genres: true,
    tags: true,
    fanCounts: false,
    listenerCounts: true,
    similarArtists: true,
    trackInfo: true,
    scrobble: true,
  },
  SettingsComponent: LastfmSettings,
  useIsEnabled: () => useLastfmStore(s => s.hasApiKey),
  clearCache: () => useLastfmMetadataStore.getState().clearCache(),
}
