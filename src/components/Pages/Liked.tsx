import { useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useLibraryStore, usePlayerStore, useUIStore } from "../../stores"
import { formatTotalMs } from "../../lib/formatters"
import { useTableSort } from "../../hooks/useTableSort"
import { ALL_COLUMNS, usePlaylistColumns } from "../../hooks/useColumnPicker"
import { TrackTable } from "../shared/TrackTable"

const LIKED_COLUMNS = ALL_COLUMNS
const LIKED_DEFAULT_COLS = ["album" as const, "rating" as const, "rated_at" as const]

export function Liked() {
  const { likedTracks, fetchLikedTracks } = useLibraryStore(useShallow(s => ({
    likedTracks: s.likedTracks,
    fetchLikedTracks: s.fetchLikedTracks,
  })))
  const { playTrack, playRadio, addToQueue, currentTrack } = usePlayerStore(useShallow(s => ({
    playTrack: s.playTrack,
    playRadio: s.playRadio,
    addToQueue: s.addToQueue,
    currentTrack: s.currentTrack,
  })))
  const pageRefreshKey = useUIStore(s => s.pageRefreshKey)

  const { visible: visibleCols, toggle: toggleCol } = usePlaylistColumns("plex-liked-columns", LIKED_DEFAULT_COLS)

  // In-playlist search
  const [filterQuery, setFilterQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(filterQuery), 150)
    return () => clearTimeout(t)
  }, [filterQuery])

  useEffect(() => {
    void fetchLikedTracks()
  }, [pageRefreshKey])

  // Deduplicate by GUID (smart playlists can return the same track twice)
  const seen = new Set<string>()
  const dedupedTracks = likedTracks.filter(t => {
    const key = t.guid ?? `${t.artistId}||${t.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const filteredTracks = useMemo(() => {
    if (!debouncedQuery) return dedupedTracks
    const q = debouncedQuery.toLowerCase()
    return dedupedTracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artistName.toLowerCase().includes(q) ||
      t.albumName.toLowerCase().includes(q)
    )
  }, [dedupedTracks, debouncedQuery])

  type SortCol = "default" | "title" | "artist" | "album" | "year" | "plays" | "popularity" | "label" | "bitrate" | "format" | "added_at" | "rating" | "rated_at" | "duration"
  const { sortCol, sortDir, handleSort } = useTableSort<SortCol>({ descByDefault: ["rating"] })

  const tracks = useMemo(() => {
    if (sortCol === "default") return filteredTracks
    const items = [...filteredTracks]
    items.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case "title":      cmp = a.title.localeCompare(b.title); break
        case "artist":     cmp = a.artistName.localeCompare(b.artistName); break
        case "album":      cmp = a.albumName.localeCompare(b.albumName); break
        case "year":       cmp = (a.albumYear ?? a.year) - (b.albumYear ?? b.year); break
        case "plays":      cmp = a.playCount - b.playCount; break
        case "popularity": cmp = (a.ratingCount ?? 0) - (b.ratingCount ?? 0); break
        case "label":      cmp = (a.parentStudio ?? "").localeCompare(b.parentStudio ?? ""); break
        case "bitrate":    cmp = (a.bitrate ?? 0) - (b.bitrate ?? 0); break
        case "format":     cmp = (a.codec ?? "").localeCompare(b.codec ?? ""); break
        case "added_at":   cmp = (a.addedAt ? +new Date(a.addedAt) : 0) - (b.addedAt ? +new Date(b.addedAt) : 0); break
        case "rating":     cmp = (a.userRating ?? 0) - (b.userRating ?? 0); break
        case "rated_at": {
          cmp = (a.lastRatedAt ? +new Date(a.lastRatedAt) : 0) - (b.lastRatedAt ? +new Date(b.lastRatedAt) : 0)
          break
        }
        case "duration":   cmp = a.duration - b.duration; break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return items
  }, [filteredTracks, sortCol, sortDir])

  const totalMs = tracks.reduce((sum, t) => sum + t.duration, 0)
  const count = tracks.length

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex flex-row items-end p-8">
        <div className="flex w-60 h-60 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-accent/70 to-accent/20 shadow-2xl">
          <svg viewBox="0 0 24 24" width="80" height="80" fill="white">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>

        {/* Info column */}
        <div className="pl-6 flex flex-col justify-between flex-1 h-60 min-w-0">
          <div>
            <div className="whitespace-nowrap text-[76px] font-black leading-none">Liked</div>
            <p className="mt-2 max-w-xl select-text text-sm text-gray-400">
              All your rated tracks, in one convenient place.
            </p>
          </div>

          {/* Bottom row: stats + buttons */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {count} {count === 1 ? "song" : "songs"}
              {totalMs > 0 && <> · {formatTotalMs(totalMs)}</>}
            </p>
            <div className="flex items-center gap-3">
              {/* Play */}
              <button
                onClick={() => count > 0 && void playTrack(tracks[0], tracks, "Liked Songs", "/collection/tracks")}
                disabled={count === 0}
                title="Play"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-accent hover:bg-black/45 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg viewBox="0 0 16 16" width="22" height="22" fill="currentColor">
                  <polygon points="3,2 13,8 3,14" />
                </svg>
              </button>
              {/* Shuffle */}
              <button
                onClick={() => {
                  if (count === 0) return
                  const s = [...tracks].sort(() => Math.random() - 0.5)
                  void playTrack(s[0], s, "Liked Songs", "/collection/tracks")
                }}
                disabled={count === 0}
                title="Shuffle"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm border border-white/10 text-accent hover:bg-black/45 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                  <path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.5H0V14h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356a2.25 2.25 0 0 1 1.724-.804h1.947l-1.017 1.018a.75.75 0 0 0 1.06 1.06L15.98 3.75 13.15.922zM.391 3.5H0V2h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167-1.796-2.14A2.25 2.25 0 0 0 .39 3.5z" />
                  <path d="m7.5 10.723.98-1.167.957 1.14a2.25 2.25 0 0 0 1.724.804h1.947l-1.017-1.018a.75.75 0 1 1 1.06-1.06l2.829 2.828-2.829 2.828a.75.75 0 1 1-1.06-1.06L13.109 13H11.16a3.75 3.75 0 0 1-2.873-1.34l-.787-.938z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      <TrackTable
        tracks={tracks}
        visibleCols={visibleCols}
        toggleCol={toggleCol}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={handleSort}
        onPlay={(track, all) => void playTrack(track, all, "Liked Songs", "/collection/tracks")}
        onAddToQueue={addToQueue}
        onPlayRadio={playRadio}
        columns={LIKED_COLUMNS}
        searchPlaceholder="Search in liked songs…  ⌘K"
        filterQuery={filterQuery}
        onFilterChange={setFilterQuery}
        defaultResetTitle="Restore default order (most recently rated)"
        emptyMessage="No rated tracks yet. Rate a song in Plex to see it here."
        currentTrackId={currentTrack?.id ?? null}
      />
    </div>
  )
}
