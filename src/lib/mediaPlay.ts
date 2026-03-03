import { buildItemUri } from "./plex"
import type { PlexMedia, Track } from "../types/plex"

interface PlayStore {
  playTrack: (track: Track, queue?: Track[], title?: string, sourceUri?: string | null) => Promise<void>
  playFromUri: (uri: string, forceShuffle?: boolean, title?: string, sourceUri?: string | null) => Promise<void>
  playPlaylist: (playlistId: number, leafCount: number, title: string, sourceUri: string | null) => Promise<void>
  sectionUuid: string | null
}

/**
 * Returns an onPlay callback for a PlexMedia item, or undefined if the item
 * type is not playable (or sectionUuid is not available).
 */
export function makeOnPlay(item: PlexMedia, store: PlayStore): (() => void) | undefined {
  const { playTrack, playFromUri, playPlaylist, sectionUuid } = store
  if (item.type === "track") {
    return () => void playTrack(item, [item], item.grandparent_title, null)
  }
  if (!sectionUuid) return undefined
  if (item.type === "album") {
    const uri = buildItemUri(sectionUuid, `/library/metadata/${item.rating_key}`)
    return () => void playFromUri(uri, false, item.title, `/album/${item.rating_key}`)
  }
  if (item.type === "artist") {
    const uri = buildItemUri(sectionUuid, `/library/metadata/${item.rating_key}`)
    return () => void playFromUri(uri, false, item.title, `/artist/${item.rating_key}`)
  }
  if (item.type === "playlist") {
    return () => void playPlaylist(item.rating_key, item.leaf_count, item.title, `/playlist/${item.rating_key}`)
  }
  return undefined
}
