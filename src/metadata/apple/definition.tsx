import type { MetadataBackendDefinition } from "../types"
import { useItunesMetadataStore } from "./store"
import { AppleSettings } from "./settings"

function AppleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg height={size} width={size} viewBox="0 0 24 24" fill="currentColor" className="text-pink-400">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  )
}

export const appleMetadataBackend: MetadataBackendDefinition = {
  id: "apple",
  name: "Apple Music",
  description: "Album covers, genres, and release dates via public API.",
  icon: AppleIcon,
  capabilities: {
    artistBio: false,
    artistImages: false,
    albumCovers: true,
    genres: true,
    tags: false,
    fanCounts: false,
    listenerCounts: false,
    similarArtists: false,
    trackInfo: false,
    scrobble: false,
  },
  SettingsComponent: AppleSettings,
  useIsEnabled: () => true,
  clearCache: () => useItunesMetadataStore.getState().clearCache(),
}
