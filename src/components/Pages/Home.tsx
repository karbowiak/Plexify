import { useShallow } from "zustand/react/shallow"
import { useLibraryStore, useConnectionStore, buildPlexImageUrl } from "../../stores"
import { prefetchArtist, prefetchAlbum } from "../../stores/metadataCache"
import type { PlexMedia } from "../../types/plex"
import { ScrollRow } from "../ScrollRow"
import { MediaCard } from "../MediaCard"

function getItemYear(item: PlexMedia): number {
  if (item.type === "album") return item.year
  if (item.type === "track") return item.year
  return 0
}

function getMediaInfo(item: PlexMedia, baseUrl: string, token: string, opts?: { showYear?: boolean }) {
  switch (item.type) {
    case "album":
      return {
        title: item.title,
        desc: opts?.showYear && item.year > 0
          ? `${item.parent_title} · ${item.year}`
          : item.parent_title,
        thumb: item.thumb ? buildPlexImageUrl(baseUrl, token, item.thumb) : null,
        isArtist: false,
        href: `/album/${item.rating_key}`,
        ratingKey: item.rating_key,
        itemType: "album" as const,
      }
    case "artist":
      return {
        title: item.title,
        desc: "Artist",
        thumb: item.thumb ? buildPlexImageUrl(baseUrl, token, item.thumb) : null,
        isArtist: true,
        href: `/artist/${item.rating_key}`,
        ratingKey: item.rating_key,
        itemType: "artist" as const,
      }
    case "track":
      return {
        title: item.title,
        desc: opts?.showYear && item.year > 0
          ? `${item.grandparent_title} · ${item.year}`
          : item.grandparent_title,
        thumb: item.thumb ? buildPlexImageUrl(baseUrl, token, item.thumb) : null,
        isArtist: false,
        href: null,
        ratingKey: item.rating_key,
        itemType: "track" as const,
      }
    case "playlist":
      return {
        title: item.title,
        desc: "Playlist",
        thumb: item.composite ? buildPlexImageUrl(baseUrl, token, item.composite) : null,
        isArtist: false,
        href: `/playlist/${item.rating_key}`,
        ratingKey: item.rating_key,
        itemType: "playlist" as const,
      }
    default:
      return null
  }
}

export function Home() {
  // Granular selector: only re-render when recentlyAdded or hubs actually change.
  // Changes to playlistItemsCache (from background prefetch) do NOT trigger re-renders here.
  const { recentlyAdded, hubs } = useLibraryStore(useShallow(s => ({
    recentlyAdded: s.recentlyAdded,
    hubs: s.hubs,
  })))
  const { baseUrl, token, isConnected, isLoading: isConnecting, musicSectionId } = useConnectionStore()

  const hasRealData = recentlyAdded.length > 0 || hubs.length > 0

  if (!hasRealData) {
    const message = isConnecting
      ? "Connecting to your Plex library…"
      : isConnected
        ? "Loading your library…"
        : "Not connected to Plex."
    return (
      <div className="space-y-8">
        <div className="text-gray-400 text-sm">{message}</div>
      </div>
    )
  }

  const sectionId = musicSectionId ?? 0

  function makePrefetch(info: ReturnType<typeof getMediaInfo>) {
    if (!info) return undefined
    if (info.itemType === "artist") return () => prefetchArtist(info.ratingKey, sectionId)
    if (info.itemType === "album") return () => prefetchAlbum(info.ratingKey)
    return undefined
  }

  // "Mixes for You" comes from the music.mixes.* hub (requires Plex Pass + sonic analysis).
  const mixesHub = hubs.find(h => h.hub_identifier.startsWith("music.mixes"))
  const mixesItems = mixesHub?.metadata ?? []

  return (
    <div className="space-y-8 pb-8">
      {mixesItems.length > 0 && (
        <ScrollRow title={mixesHub!.title} restoreKey="home-mixes">
          {mixesItems.map((item, idx) => {
            const info = getMediaInfo(item, baseUrl, token)
            if (!info) return null
            return (
              <MediaCard
                key={idx}
                title={info.title}
                desc={info.desc}
                thumb={info.thumb}
                isArtist={info.isArtist}
                href={info.href ?? undefined}
                prefetch={makePrefetch(info)}
                scrollItem
              />
            )
          })}
        </ScrollRow>
      )}

      {recentlyAdded.length > 0 && (
        <ScrollRow title="Recently Added" restoreKey="home-recently-added">
          {recentlyAdded.slice(0, 30).map((item, idx) => {
            const info = getMediaInfo(item, baseUrl, token)
            if (!info) return null
            return (
              <MediaCard
                key={idx}
                title={info.title}
                desc={info.desc}
                thumb={info.thumb}
                isArtist={info.isArtist}
                href={info.href ?? undefined}
                prefetch={makePrefetch(info)}
                scrollItem
              />
            )
          })}
        </ScrollRow>
      )}

      {hubs.map(hub => {
        if (hub.metadata.length === 0) return null
        const isAnniversary = hub.hub_identifier.includes("anniversary")
        // "On This Day" — sort oldest → newest and show the release year.
        const items = isAnniversary
          ? [...hub.metadata].sort((a, b) => getItemYear(a) - getItemYear(b))
          : hub.metadata
        return (
          <ScrollRow key={hub.hub_identifier} title={hub.title} restoreKey={`home-hub-${hub.hub_identifier}`}>
            {items.slice(0, 30).map((item, idx) => {
              const info = getMediaInfo(item, baseUrl, token, { showYear: isAnniversary })
              if (!info) return null
              return (
                <MediaCard
                  key={idx}
                  title={info.title}
                  desc={info.desc}
                  thumb={info.thumb}
                  isArtist={info.isArtist}
                  href={info.href ?? undefined}
                  prefetch={makePrefetch(info)}
                  scrollItem
                />
              )
            })}
          </ScrollRow>
        )
      })}
    </div>
  )
}
