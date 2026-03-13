import type { MetadataBackendDefinition } from "../types"
import { useListenBrainzStore } from "./authStore"
import { ListenBrainzSettings } from "./settings"

function ListenBrainzIcon({ size = 18 }: { size?: number }) {
  return (
    <svg height={size} width={size} viewBox="0 0 24 24" fill="currentColor" className="text-[#353070]">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
    </svg>
  )
}

export const listenbrainzMetadataBackend: MetadataBackendDefinition = {
  id: "listenbrainz",
  name: "ListenBrainz",
  description: "Open-source scrobbling — submit listens and now-playing updates.",
  icon: ListenBrainzIcon,
  capabilities: {
    artistBio: false,
    artistImages: false,
    albumCovers: false,
    genres: false,
    tags: false,
    fanCounts: false,
    listenerCounts: false,
    similarArtists: false,
    trackInfo: false,
    scrobble: true,
    lyrics: false,
  },
  SettingsComponent: ListenBrainzSettings,
  useIsEnabled: () => useListenBrainzStore(s => s.isAuthenticated),
}
