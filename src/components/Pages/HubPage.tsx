import { useShallow } from "zustand/react/shallow"
import { useLibraryStore, usePlayerStore } from "../../stores"
import { useProviderStore } from "../../stores/providerStore"
import { prefetchArtist, prefetchAlbum } from "../../stores/metadataCache"
import { makeOnPlay } from "../../lib/mediaPlay"
import { MediaCard } from "../MediaCard"
import { MediaGrid } from "../shared/MediaGrid"
import { getMediaInfo, makeDragPayload } from "./Home"

export function HubPage({ hubId }: { hubId: string }) {
  const { hubs } = useLibraryStore(useShallow(s => ({ hubs: s.hubs })))
  const provider = useProviderStore(s => s.provider)
  const { playFromUri, playTrack, playPlaylist } = usePlayerStore(useShallow(s => ({
    playFromUri:  s.playFromUri,
    playTrack:    s.playTrack,
    playPlaylist: s.playPlaylist,
  })))

  const hub = hubs.find(h => h.identifier === hubId)

  if (!hub) {
    return <div className="text-sm text-gray-400">Hub not found.</div>
  }

  const isAnniversary = hub.identifier.includes("anniversary")
  const items = isAnniversary
    ? [...hub.items].sort((a, b) => {
        const ya = a.type === "album" ? a.year : a.type === "track" ? a.year : 0
        const yb = b.type === "album" ? b.year : b.type === "track" ? b.year : 0
        return ya - yb
      })
    : hub.items

  function makePrefetch(info: ReturnType<typeof getMediaInfo>) {
    if (!info) return undefined
    if (info.itemType === "artist") return () => prefetchArtist(info.id)
    if (info.itemType === "album") return () => prefetchAlbum(info.id)
    return undefined
  }

  return (
    <div className="p-8">
      <h1 className="mb-6 text-3xl font-bold">{hub.title}</h1>
      {items.length === 0 ? (
        <div className="text-sm text-gray-400">No items in this hub.</div>
      ) : (
        <MediaGrid>
          {items.map((item, idx) => {
            const info = getMediaInfo(item, { showYear: isAnniversary })
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
