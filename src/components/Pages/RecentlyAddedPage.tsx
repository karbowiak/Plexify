import { useShallow } from "zustand/react/shallow"
import { useLibraryStore, useConnectionStore, usePlayerStore, buildPlexImageUrl } from "../../stores"
import { prefetchArtist, prefetchAlbum } from "../../stores/metadataCache"
import { makeOnPlay } from "../../lib/mediaPlay"
import { MediaCard } from "../MediaCard"
import { MediaGrid } from "../shared/MediaGrid"
import { getMediaInfo } from "./Home"

export function RecentlyAddedPage() {
  const recentlyAdded = useLibraryStore(s => s.recentlyAdded)
  const { baseUrl, token, musicSectionId, sectionUuid } = useConnectionStore(useShallow(s => ({ baseUrl: s.baseUrl, token: s.token, musicSectionId: s.musicSectionId, sectionUuid: s.sectionUuid })))
  const { playFromUri, playTrack, playPlaylist } = usePlayerStore(useShallow(s => ({
    playFromUri:  s.playFromUri,
    playTrack:    s.playTrack,
    playPlaylist: s.playPlaylist,
  })))

  const sectionId = musicSectionId ?? 0

  function makePrefetch(info: ReturnType<typeof getMediaInfo>) {
    if (!info) return undefined
    if (info.itemType === "artist") return () => prefetchArtist(info.ratingKey, sectionId)
    if (info.itemType === "album") return () => prefetchAlbum(info.ratingKey)
    return undefined
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-3xl font-bold">Recently Added</h1>
      {recentlyAdded.length === 0 ? (
        <div className="text-sm text-gray-400">Nothing recently added.</div>
      ) : (
        <MediaGrid>
          {recentlyAdded.map((item, idx) => {
            const info = getMediaInfo(item, baseUrl, token)
            if (!info) return null
            return (
              <MediaCard
                key={"rating_key" in item ? (item.rating_key || `ra-${idx}`) : idx}
                title={info.title}
                desc={info.desc}
                thumb={info.thumb}
                isArtist={info.isArtist}
                href={info.href ?? undefined}
                prefetch={makePrefetch(info)}
                onPlay={makeOnPlay(item, { playTrack, playFromUri, playPlaylist, sectionUuid })}
              />
            )
          })}
        </MediaGrid>
      )}
    </div>
  )
}
