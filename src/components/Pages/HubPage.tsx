import { useShallow } from "zustand/react/shallow"
import { useLibraryStore, useConnectionStore, usePlayerStore, buildPlexImageUrl } from "../../stores"
import { prefetchArtist, prefetchAlbum } from "../../stores/metadataCache"
import { makeOnPlay } from "../../lib/mediaPlay"
import { MediaCard } from "../MediaCard"
import { MediaGrid } from "../shared/MediaGrid"
import { getMediaInfo } from "./Home"

export function HubPage({ hubId }: { hubId: string }) {
  const { hubs } = useLibraryStore(useShallow(s => ({ hubs: s.hubs })))
  const { baseUrl, token, musicSectionId, sectionUuid } = useConnectionStore(useShallow(s => ({ baseUrl: s.baseUrl, token: s.token, musicSectionId: s.musicSectionId, sectionUuid: s.sectionUuid })))
  const { playFromUri, playTrack, playPlaylist } = usePlayerStore(useShallow(s => ({
    playFromUri:  s.playFromUri,
    playTrack:    s.playTrack,
    playPlaylist: s.playPlaylist,
  })))

  const hub = hubs.find(h => h.hub_identifier === hubId)

  if (!hub) {
    return <div className="text-sm text-gray-400">Hub not found.</div>
  }

  const sectionId = musicSectionId ?? 0
  const isAnniversary = hub.hub_identifier.includes("anniversary")
  const items = isAnniversary
    ? [...hub.metadata].sort((a, b) => {
        const ya = a.type === "album" ? a.year : a.type === "track" ? a.year : 0
        const yb = b.type === "album" ? b.year : b.type === "track" ? b.year : 0
        return ya - yb
      })
    : hub.metadata

  function makePrefetch(info: ReturnType<typeof getMediaInfo>) {
    if (!info) return undefined
    if (info.itemType === "artist") return () => prefetchArtist(info.ratingKey, sectionId)
    if (info.itemType === "album") return () => prefetchAlbum(info.ratingKey)
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
            const info = getMediaInfo(item, baseUrl, token, { showYear: isAnniversary })
            if (!info) return null
            return (
              <MediaCard
                key={"rating_key" in item ? (item.rating_key || `hub-${idx}`) : idx}
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
