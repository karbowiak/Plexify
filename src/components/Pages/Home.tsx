import { useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useLocation } from "wouter"
import { useLibraryStore, useConnectionStore, usePlayerStore } from "../../stores"
import { useProviderStore } from "../../stores/providerStore"
import { prefetchArtist, prefetchAlbum } from "../../stores/metadataCache"
import type { MusicItem, MusicPlaylist } from "../../types/music"
import { useContextMenu } from "../../hooks/useContextMenu"
import { makeOnPlay } from "../../lib/mediaPlay"
import { ScrollRow } from "../ScrollRow"
import { MediaCard } from "../MediaCard"
import { PriorityMediaCard } from "../PriorityMediaCard"
import { selectMix, shuffleTracks } from "./Mix"

/** Strip common mix suffixes to get the artist name: "Ado Mix" → "Ado" */
export function mixTitleToArtistName(title: string): string {
  return title.replace(/\s+(Mix|Radio|Station|Mix Radio)$/i, "").trim()
}

/**
 * Module-level cache of mix title → artist thumb URL.
 * Survives component unmount/remount so images don't flash grey on navigation.
 * Shared with StationsPage so the two pages don't duplicate searches.
 * The actual image bytes are cached separately by the image:// Tauri handler.
 */
export const mixThumbCache = new Map<string, string>()

function getItemYear(item: MusicItem): number {
  if (item.type === "album") return item.year
  if (item.type === "track") return item.year
  return 0
}

export function getMediaInfo(item: MusicItem, opts?: { showYear?: boolean }) {
  switch (item.type) {
    case "album":
      return {
        title: item.title,
        desc: opts?.showYear && item.year > 0
          ? `${item.artistName} · ${item.year}`
          : item.artistName,
        thumb: item.thumbUrl,
        isArtist: false,
        href: `/album/${item.id}`,
        id: item.id,
        itemType: "album" as const,
        artistName: item.artistName,
        albumName: item.title,
      }
    case "artist":
      return {
        title: item.title,
        desc: "Artist",
        thumb: item.thumbUrl,
        isArtist: true,
        href: `/artist/${item.id}`,
        id: item.id,
        itemType: "artist" as const,
        artistName: item.title,
        albumName: null,
      }
    case "track":
      return {
        title: item.title,
        desc: opts?.showYear && item.year > 0
          ? `${item.artistName} · ${item.year}`
          : item.artistName,
        thumb: item.thumbUrl,
        isArtist: false,
        href: item.albumId ? `/album/${item.albumId}` : null,
        id: item.id,
        itemType: "track" as const,
        artistName: item.artistName,
        albumName: item.albumName,
      }
    case "playlist":
      return {
        title: item.title,
        desc: "Playlist",
        thumb: item.thumbUrl,
        isArtist: false,
        href: `/playlist/${item.id}`,
        id: item.id,
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
  const { isConnected, isLoading: isConnecting } = useConnectionStore(
    useShallow(s => ({ isConnected: s.isConnected, isLoading: s.isLoading }))
  )
  const provider = useProviderStore(s => s.provider)
  const { playFromUri, playTrack, playPlaylist } = usePlayerStore(useShallow(s => ({
    playFromUri: s.playFromUri,
    playTrack:   s.playTrack,
    playPlaylist: s.playPlaylist,
  })))
  const [, navigate] = useLocation()
  const { handler: ctxMenu } = useContextMenu()

  function makeOnContextMenu(item: MusicItem) {
    if (item.type === "album" || item.type === "artist" || item.type === "track") return ctxMenu(item.type, item)
    return undefined
  }

  // Seed from module-level cache so images are available immediately on remount.
  const [mixThumbs, setMixThumbs] = useState<Record<string, string>>(
    () => Object.fromEntries(mixThumbCache)
  )

  const hasRealData = recentlyAdded.length > 0 || hubs.length > 0

  const { mixesItems, mixesTitle } = useMemo(() => {
    const mh = hubs.filter(h => h.identifier?.startsWith("music.mixes"))
    return { mixesItems: mh.flatMap(h => h.items), mixesTitle: mh[0]?.title ?? "Mixes for You" }
  }, [hubs])

  // For each mix, search the library for the artist named in the title and
  // cache their thumbnail. Already-cached titles are skipped.
  useEffect(() => {
    if (!isConnected || !provider || mixesItems.length === 0) return
    const controller = new AbortController()

    const run = async () => {
      // Filter to playlist items that need resolution
      const pending = mixesItems.filter(
        (item): item is Extract<typeof item, { type: "playlist" }> =>
          item.type === "playlist" && !mixThumbCache.has(item.title) && !!mixTitleToArtistName(item.title)
      )
      if (pending.length === 0) return

      const BATCH = 5
      const updates: Record<string, string> = {}

      for (let i = 0; i < pending.length; i += BATCH) {
        if (controller.signal.aborted) break
        await Promise.all(
          pending.slice(i, i + BATCH).map(async (item) => {
            const artistName = mixTitleToArtistName(item.title)
            if (!artistName) return
            try {
              const results = await provider.search(artistName, "artist")
              const artist = results.find(
                r => r.type === "artist" && r.title.toLowerCase() === artistName.toLowerCase()
              ) ?? results.find(r => r.type === "artist")
              if (artist && artist.type === "artist" && artist.thumbUrl) {
                mixThumbCache.set(item.title, artist.thumbUrl)
                updates[item.title] = artist.thumbUrl
              }
            } catch {
              // search failure for one mix shouldn't abort the rest
            }
          })
        )
      }
      if (!controller.signal.aborted && Object.keys(updates).length > 0) {
        setMixThumbs(prev => ({ ...prev, ...updates }))
      }
    }

    void run()
    return () => controller.abort()
  }, [isConnected, provider, mixesItems.length])

  if (!hasRealData) {
    const message = isConnecting
      ? "Connecting…"
      : isConnected
        ? "Loading your library…"
        : "Not connected. Go to Settings to connect."
    return (
      <div className="space-y-8">
        <div className="text-gray-400 text-sm">{message}</div>
      </div>
    )
  }

  function makePrefetch(info: ReturnType<typeof getMediaInfo>) {
    if (!info) return undefined
    if (info.itemType === "artist") return () => prefetchArtist(info.id)
    if (info.itemType === "album") return () => prefetchAlbum(info.id)
    return undefined
  }

  return (
    <div className="space-y-8 pb-8">
      {mixesItems.length > 0 && (
        <ScrollRow title={mixesTitle} titleHref="/stations" restoreKey="home-mixes">
          {mixesItems.map((item, idx) => {
            if (item.type !== "playlist") return null
            const thumb = mixThumbs[item.title] ?? item.thumbUrl
            return (
              <MediaCard
                key={`${item.id}-${idx}`}
                title={item.title}
                desc="Mix for You"
                thumb={thumb}
                isArtist={false}
                onClick={() => {
                  selectMix(item as MusicPlaylist)
                  navigate("/mix")
                }}
                onPlay={() => {
                  const mixKey = item.providerKey as string | undefined
                  if (!mixKey || !provider?.getMixTracks) return
                  provider.getMixTracks(mixKey)
                    .then(tracks => {
                      if (tracks.length === 0) return
                      const sorted = shuffleTracks(tracks, item.title)
                      void playTrack(sorted[0], sorted, item.title, "/mix")
                    })
                    .catch(() => {})
                }}
                scrollItem
                large
              />
            )
          })}
        </ScrollRow>
      )}

      {recentlyAdded.length > 0 && (
        <ScrollRow title="Recently Added" titleHref="/recently-added" restoreKey="home-recently-added">
          {recentlyAdded.slice(0, 30).map((item, idx) => {
            const info = getMediaInfo(item)
            if (!info) return null
            const usePriority = info.itemType === "artist" || info.itemType === "album"
            const Card = usePriority ? PriorityMediaCard : MediaCard
            return (
              <Card
                key={`${item.id}-${idx}`}
                title={info.title}
                desc={info.desc}
                thumb={info.thumb}
                isArtist={info.isArtist}
                href={info.href ?? undefined}
                prefetch={makePrefetch(info)}
                onPlay={makeOnPlay(item, { playTrack, playFromUri, playPlaylist, provider })}
                onContextMenu={makeOnContextMenu(item)}
                artistName={"artistName" in info ? info.artistName : undefined}
                albumName={"albumName" in info ? info.albumName : undefined}
                scrollItem
              />
            )
          })}
        </ScrollRow>
      )}

      {hubs.map(hub => {
        if (hub.items.length === 0 || !hub.identifier) return null
        // Skip mixes hubs — already rendered as the pinned top section
        if (hub.identifier.startsWith("music.mixes")) return null
        // Skip recently-added hubs — identifier-based + title fallback for server-variant identifiers
        if (hub.identifier.toLowerCase().includes("recently.added") ||
            hub.identifier.toLowerCase().includes("recentlyadded") ||
            hub.title.toLowerCase().startsWith("recently added")) return null
        // Skip station hubs — already shown on the /stations page
        if (hub.identifier.toLowerCase().includes("station")) return null
        const isAnniversary = hub.identifier.includes("anniversary")
        // "On This Day" — sort oldest → newest and show the release year.
        const items = isAnniversary
          ? [...hub.items].sort((a, b) => getItemYear(a) - getItemYear(b))
          : hub.items
        return (
          <ScrollRow
            key={hub.identifier}
            title={hub.title}
            titleHref={"/hub/" + encodeURIComponent(hub.identifier)}
            restoreKey={`home-hub-${hub.identifier}`}
          >
            {items.slice(0, 30).map((item, idx) => {
              const info = getMediaInfo(item, { showYear: isAnniversary })
              if (!info) return null
              const usePriority = info.itemType === "artist" || info.itemType === "album"
              const Card = usePriority ? PriorityMediaCard : MediaCard
              return (
                <Card
                  key={`${item.id}-${idx}`}
                  title={info.title}
                  desc={info.desc}
                  thumb={info.thumb}
                  isArtist={info.isArtist}
                  href={info.href ?? undefined}
                  prefetch={makePrefetch(info)}
                  onPlay={makeOnPlay(item, { playTrack, playFromUri, playPlaylist, provider })}
                  onContextMenu={makeOnContextMenu(item)}
                  artistName={"artistName" in info ? info.artistName : undefined}
                  albumName={"albumName" in info ? info.albumName : undefined}
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
