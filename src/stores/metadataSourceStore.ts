/**
 * Metadata source priority — persisted to IndexedDB via Zustand persist.
 *
 * Controls the order in which metadata sources are consulted for bio text,
 * images, genres, tags, and supplemental info.
 *
 * NOTE: Artist name, album name, and track name ALWAYS come from Plex
 * regardless of this setting — this only affects enrichment data.
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { idbJSONStorage } from "./idbStorage"

export type MetadataSource = "plex" | "deezer" | "lastfm" | "apple"

export const SOURCE_LABELS: Record<MetadataSource, string> = {
  plex: "Plex",
  deezer: "Deezer",
  lastfm: "Last.fm",
  apple: "Apple Music",
}

export const SOURCE_DESCRIPTIONS: Record<MetadataSource, string> = {
  plex: "Your Plex library metadata (always the source for names)",
  deezer: "Deezer artist bios, fan counts, genres, and cover art",
  lastfm: "Last.fm biographies, tags, listener counts, and similar artists",
  apple: "Apple Music genres, release dates, and album artwork",
}

const DEFAULT_PRIORITY: MetadataSource[] = ["plex", "deezer", "lastfm", "apple"]

interface MetadataSourceState {
  /** Ordered list of metadata sources, highest priority first. */
  priority: MetadataSource[]
  /** Replace the entire ordering. */
  setPriority: (order: MetadataSource[]) => void
}

export const useMetadataSourceStore = create<MetadataSourceState>()(
  persist(
    (set) => ({
      priority: DEFAULT_PRIORITY,
      setPriority: (order) => set({ priority: order }),
    }),
    {
      name: "metadata-source-priority-v1",
      storage: idbJSONStorage,
      partialize: (s) => ({ priority: s.priority }),
    },
  ),
)
