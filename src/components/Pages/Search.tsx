import clsx from "clsx"
import { useSearchStore, useConnectionStore, buildPlexImageUrl } from "../../stores"
import type { PlexMedia } from "../../types/plex"
import { MediaCard } from "../MediaCard"
import { prefetchArtist, prefetchAlbum } from "../../stores/metadataCache"
import searchcards from "../../data/search_cards.json"

type MediaType = "artist" | "album" | "track" | "playlist"

const GROUP_ORDER: MediaType[] = ["artist", "album", "track", "playlist"]
const GROUP_LABELS: Record<MediaType, string> = {
  artist: "Artists",
  album: "Albums",
  track: "Tracks",
  playlist: "Playlists",
}

function groupByType(results: PlexMedia[]) {
  const groups: Record<MediaType, PlexMedia[]> = {
    artist: [],
    album: [],
    track: [],
    playlist: [],
  }
  for (const item of results) {
    if (item.type in groups) groups[item.type as MediaType].push(item)
  }
  return groups
}

function getInfo(item: PlexMedia, baseUrl: string, token: string) {
  switch (item.type) {
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
    case "album":
      return {
        title: item.title,
        desc: item.parent_title,
        thumb: item.thumb ? buildPlexImageUrl(baseUrl, token, item.thumb) : null,
        isArtist: false,
        href: `/album/${item.rating_key}`,
        ratingKey: item.rating_key,
        itemType: "album" as const,
      }
    case "track":
      return {
        title: item.title,
        desc: `${item.grandparent_title} · ${item.parent_title}`,
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

export function Search() {
  const { results, isSearching, query } = useSearchStore()
  const { baseUrl, token, musicSectionId } = useConnectionStore()

  const showResults = query.trim().length > 0
  const groups = groupByType(results)

  return (
    <div className="pb-32">
      {showResults ? (
        <div className="space-y-8">
          {isSearching && <div className="text-sm text-gray-400">Searching…</div>}
          {!isSearching && results.length === 0 && (
            <div className="text-sm text-gray-400">No results for "{query}"</div>
          )}
          {GROUP_ORDER.map(type => {
            const items = groups[type]
            if (!items || items.length === 0) return null
            return (
              <div key={type}>
                <div className="mb-3 text-xl font-bold">{GROUP_LABELS[type]}</div>
                <div className="grid grid-cols-4 gap-4 2xl:grid-cols-5">
                  {items.slice(0, 5).map((item, idx) => {
                    const info = getInfo(item, baseUrl, token)
                    if (!info) return null
                    const prefetch = info.itemType === "artist"
                      ? () => prefetchArtist(info.ratingKey, musicSectionId ?? 0)
                      : info.itemType === "album"
                        ? () => prefetchAlbum(info.ratingKey)
                        : undefined
                    return (
                      <MediaCard
                        key={idx}
                        title={info.title}
                        desc={info.desc}
                        thumb={info.thumb}
                        isArtist={info.isArtist}
                        href={info.href ?? undefined}
                        prefetch={prefetch}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div>
          <div className="grow pb-5 text-2xl font-bold">Browse all</div>
          <div className="grid grid-cols-5 gap-3 2xl:grid-cols-6">
            {searchcards.map((i) => (
              <div
                key={i.title}
                className={clsx(
                  "relative aspect-square cursor-pointer overflow-hidden rounded-lg",
                  bgColors[Math.floor(Math.random() * bgColors.length)]
                )}
              >
                <span className="line-clamp-1 p-3 text-base font-bold">{i.title}</span>
                <img
                  src={i.img}
                  alt=""
                  className="shadow-spotify absolute right-0 bottom-0 h-[55%] w-[55%] translate-x-[18%] translate-y-[5%] rotate-[25deg]"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const bgColors = [
  "bg-blue-700",
  "bg-blue-950",
  "bg-green-700",
  "bg-orange-700",
  "bg-orange-600",
  "bg-cyan-700",
]
