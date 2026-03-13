import { useShallow } from "zustand/react/shallow"
import { useLibraryStore, usePlayerStore } from "../../stores"
import { useProviderStore } from "../../stores/providerStore"
import { prefetchArtist, prefetchAlbum } from "../../stores/metadataCache"
import { makeOnPlay } from "../../lib/mediaPlay"
import { MediaCard } from "../MediaCard"
import { MediaGrid } from "../shared/MediaGrid"
import { getMediaInfo, makeDragPayload } from "./Home"

export function RecentlyAddedPage() {
  const recentlyAdded = useLibraryStore(s => s.recentlyAdded)
  const provider = useProviderStore(s => s.provider)
  const { playFromUri, playTrack, playPlaylist } = usePlayerStore(useShallow(s => ({
    playFromUri:  s.playFromUri,
    playTrack:    s.playTrack,
    playPlaylist: s.playPlaylist,
  })))

  function makePrefetch(info: ReturnType<typeof getMediaInfo>) {
    if (!info) return undefined
    if (info.itemType === "artist") return () => prefetchArtist(info.id)
    if (info.itemType === "album") return () => prefetchAlbum(info.id)
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
            const info = getMediaInfo(item)
            if (!info) return null
            return (
              <MediaCard
                key={`${item.id}-${idx}`}
                title={info.title}
                desc={info.desc}
                thumb={info.thumb}
                isArtist={info.isArtist}
                href={info.href ?? undefined}
                prefetch={makePrefetch(info)}
                onPlay={makeOnPlay(item, { playTrack, playFromUri, playPlaylist, provider })}
                dragPayload={makeDragPayload(item)}
              />
            )
          })}
        </MediaGrid>
      )}
    </div>
  )
}
