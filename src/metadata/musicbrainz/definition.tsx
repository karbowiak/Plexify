import type { MetadataBackendDefinition } from "../types"
import { useMusicBrainzMetadataStore } from "./store"
import { MusicBrainzSettings } from "./settings"

function MusicBrainzIcon({ size = 18 }: { size?: number }) {
  return (
    <svg height={size} width={size} viewBox="0 0 24 24" fill="currentColor" className="text-[#BA478F]">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-3l-3 3v-7l3 3v-3l3 3v-3l3 3v-7l-3 3v-3l-3 3v-3l-3 3V5.5l9 6.5-9 6.5z" />
    </svg>
  )
}

export const musicbrainzMetadataBackend: MetadataBackendDefinition = {
  id: "musicbrainz",
  name: "MusicBrainz",
  description: "Artist info, tags/genres, and release data via public API.",
  icon: MusicBrainzIcon,
  capabilities: {
    artistBio: false,
    artistImages: false,
    albumCovers: false,
    genres: true,
    tags: true,
    fanCounts: false,
    listenerCounts: false,
    similarArtists: false,
    trackInfo: false,
    scrobble: false,
    lyrics: false,
  },
  SettingsComponent: MusicBrainzSettings,
  useIsEnabled: () => true,
  clearCache: () => useMusicBrainzMetadataStore.getState().clearCache(),
}
