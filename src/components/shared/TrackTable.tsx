import { useRef, useEffect } from "react"
import { Link } from "wouter"
import type { MusicTrack } from "../../types/music"
import type { ColId } from "../../hooks/useColumnPicker"
import { ColumnPicker } from "../../hooks/useColumnPicker"
import { SortTh } from "./SortTh"
import { StarRating } from "./StarRating"
import { formatMs, formatDate, formatBitrate } from "../../lib/formatters"
import { prefetchTrackAudio } from "../../stores/playerStore"
import { useContextMenu } from "../../hooks/useContextMenu"

export interface TrackTableProps {
  tracks: MusicTrack[]
  visibleCols: Set<ColId>
  toggleCol: (id: ColId) => void
  sortCol: string
  sortDir: "asc" | "desc"
  onSort: (col: string) => void
  onPlay: (track: MusicTrack, allTracks: MusicTrack[]) => void
  onAddToQueue: (tracks: MusicTrack[]) => void
  onPlayRadio: (id: string, type: "track" | "artist" | "album" | "playlist") => void
  columns: { id: ColId; label: string }[]
  searchPlaceholder: string
  filterQuery: string
  onFilterChange: (q: string) => void
  defaultResetTitle?: string
  isLoading?: boolean
  loadedCount?: number
  emptyMessage?: string
  sentinel?: React.RefObject<HTMLDivElement | null>
  spacerHeight?: number
  isFetchingMore?: boolean
  currentTrackId?: string | null
}

export function TrackTable({
  tracks,
  visibleCols,
  toggleCol,
  sortCol,
  sortDir,
  onSort,
  onPlay,
  onAddToQueue,
  onPlayRadio,
  columns,
  searchPlaceholder,
  filterQuery,
  onFilterChange,
  defaultResetTitle = "Restore default order",
  isLoading = false,
  loadedCount = 0,
  emptyMessage = "No tracks.",
  sentinel,
  spacerHeight = 0,
  isFetchingMore = false,
  currentTrackId,
}: TrackTableProps) {
  const { handler: ctxMenu, isTarget: isCtxTarget } = useContextMenu()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Whether to show inline StarRating in the title cell action buttons.
  // If the columns array offers a "rating" column, the parent renders it as a table column instead.
  const showInlineRating = !columns.some(c => c.id === "rating")

  // Cmd/Ctrl+K hotkey
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        onFilterChange("")
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onFilterChange])

  return (
    <div className="px-8 pt-2">
      {/* Toolbar row: search + column picker */}
      <div className="flex items-center justify-between pb-1">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={filterQuery}
            onChange={e => onFilterChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-56 pl-7 pr-2 py-1 text-sm rounded bg-white/5 border border-white/10 text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-accent/50 focus:bg-white/[0.07] transition-colors"
          />
        </div>
        <ColumnPicker visible={visibleCols} toggle={toggleCol} columns={columns} />
      </div>

      <table className="w-full text-sm text-gray-400">
        <thead className="border-b border-white/10">
          <tr>
            <th
              className="p-2 text-center w-8"
              onClick={() => onSort("default")}
              title={defaultResetTitle}
              style={{ cursor: sortCol !== "default" ? "pointer" : "default" }}
            >#</th>
            <SortTh col="title"      label="Title"                active={sortCol} dir={sortDir} onSort={onSort} align="left" />
            {visibleCols.has("artist")     && <SortTh col="artist"     label="Artist"               active={sortCol} dir={sortDir} onSort={onSort} align="left" />}
            {visibleCols.has("album")      && <SortTh col="album"      label="Album"                active={sortCol} dir={sortDir} onSort={onSort} align="left" />}
            {visibleCols.has("year")       && <SortTh col="year"       label="Year"                 active={sortCol} dir={sortDir} onSort={onSort} align="left" />}
            {visibleCols.has("plays")      && <SortTh col="plays"      label="Plays"                active={sortCol} dir={sortDir} onSort={onSort} align="right" />}
            {visibleCols.has("popularity") && <SortTh col="popularity" label="Popularity"           active={sortCol} dir={sortDir} onSort={onSort} align="right" />}
            {visibleCols.has("label")      && <SortTh col="label"      label="Label"                active={sortCol} dir={sortDir} onSort={onSort} align="left" />}
            {visibleCols.has("bitrate")    && <SortTh col="bitrate"    label="Bit Rate"             active={sortCol} dir={sortDir} onSort={onSort} align="right" />}
            {visibleCols.has("format")     && <SortTh col="format"     label="Format"               active={sortCol} dir={sortDir} onSort={onSort} align="left" />}
            {visibleCols.has("added_at")   && <SortTh col="added_at"   label="Date Added (Library)" active={sortCol} dir={sortDir} onSort={onSort} align="left" />}
            {visibleCols.has("rating")     && <SortTh col="rating"     label="Rating"               active={sortCol} dir={sortDir} onSort={onSort} align="left" />}
            {visibleCols.has("rated_at")   && <SortTh col="rated_at"   label="Date Rated"           active={sortCol} dir={sortDir} onSort={onSort} align="left" />}
            <SortTh col="duration"   label="Duration"             active={sortCol} dir={sortDir} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {/* Loading skeletons */}
          {isLoading && loadedCount === 0 && Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="animate-pulse">
              <td className="p-2 w-8"><div className="h-3 w-3 rounded bg-white/10 mx-auto" /></td>
              <td className="p-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-sm bg-white/10 flex-shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 rounded bg-white/10 w-2/3" />
                    <div className="h-2.5 rounded bg-white/10 w-1/3" />
                  </div>
                </div>
              </td>
              {[...visibleCols].map(id => (
                <td key={id} className="p-2"><div className="h-3 rounded bg-white/10 w-3/4" /></td>
              ))}
              <td className="p-2 text-right"><div className="h-3 rounded bg-white/10 w-10 ml-auto" /></td>
            </tr>
          ))}

          {/* Track rows */}
          {tracks.map((track, idx) => {
            const isActive = currentTrackId === track.id
            const isContextTarget = isCtxTarget(track.id)
            return (
              <tr
                key={`${track.id}-${idx}`}
                className={`group cursor-pointer rounded ${isActive || isContextTarget ? "bg-hl-row" : "hover:bg-hl-row"}`}
                onClick={() => onPlay(track, tracks)}
                onMouseEnter={() => prefetchTrackAudio(track)}
                onContextMenu={ctxMenu("track", track)}
              >
                {/* Index / now-playing indicator */}
                <td className="p-2 text-center w-8">
                  {isActive ? (
                    <>
                      <span className="group-hover:hidden flex items-center justify-center text-accent">
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                          <rect x="1" y="3" width="3" height="10" rx="1"/><rect x="6" y="1" width="3" height="12" rx="1"/><rect x="11" y="5" width="3" height="8" rx="1"/>
                        </svg>
                      </span>
                      <span className="hidden group-hover:flex items-center justify-center text-accent">
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><polygon points="3,2 13,8 3,14" /></svg>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="group-hover:hidden">{idx + 1}</span>
                      <span className="hidden group-hover:flex items-center justify-center">
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                          <polygon points="3,2 13,8 3,14" />
                        </svg>
                      </span>
                    </>
                  )}
                </td>

                {/* Title cell: thumbnail + title + subtitle row (artist + fade-in actions) */}
                <td className="p-2">
                  <div className="flex items-center gap-3">
                    {track.thumbUrl ? (
                      <img className="h-10 w-10 rounded-sm flex-shrink-0 object-cover" src={track.thumbUrl} alt="" />
                    ) : (
                      <div className="h-10 w-10 rounded-sm flex-shrink-0 bg-app-surface" />
                    )}
                    <div className="min-w-0">
                      <div className={`truncate ${isActive ? "text-accent" : "text-white"}`}>{track.title}</div>
                      <div className="flex items-center gap-2 min-w-0">
                        {!visibleCols.has("artist") && (
                          <div className="truncate shrink min-w-0">
                            {track.artistId ? (
                              <Link
                                href={`/artist/${track.artistId}`}
                                className="text-gray-500 hover:text-white hover:underline transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                {track.artistName}
                              </Link>
                            ) : (
                              <span className="text-gray-500">{track.artistName}</span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-hl-menu"
                            title="Add to Queue"
                            onClick={e => { e.stopPropagation(); onAddToQueue([track]) }}
                          >
                            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/>
                            </svg>
                            Queue
                          </button>
                          <button
                            className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-hl-menu"
                            title="Track Radio"
                            onClick={e => { e.stopPropagation(); void onPlayRadio(track.id, "track") }}
                          >
                            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5a3 3 0 1 0 0 6A3 3 0 0 0 8 5zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
                            </svg>
                            Radio
                          </button>
                          {showInlineRating && (
                            <>
                              <span className="w-px h-3 bg-white/20 mx-0.5" />
                              <StarRating itemId={track.id} userRating={track.userRating} artist={track.artistName ?? ""} track={track.title} size={11} />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Artist */}
                {visibleCols.has("artist") && (
                  <td className="p-2 truncate max-w-[180px]">
                    {track.artistId ? (
                      <Link
                        href={`/artist/${track.artistId}`}
                        className="hover:text-white hover:underline transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        {track.artistName}
                      </Link>
                    ) : (
                      track.artistName
                    )}
                  </td>
                )}

                {/* Album */}
                {visibleCols.has("album") && (
                  <td className="p-2 truncate max-w-[200px]">
                    {track.albumId ? (
                      <Link
                        href={`/album/${track.albumId}`}
                        className="hover:text-white hover:underline transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        {track.albumName}
                      </Link>
                    ) : (
                      track.albumName
                    )}
                  </td>
                )}

                {/* Year */}
                {visibleCols.has("year") && (
                  <td className="p-2 tabular-nums">{(track.albumYear ?? track.year) || ""}</td>
                )}

                {/* Plays */}
                {visibleCols.has("plays") && (
                  <td className="p-2 text-right tabular-nums">{track.playCount || ""}</td>
                )}

                {/* Popularity */}
                {visibleCols.has("popularity") && (
                  <td className="p-2 text-right tabular-nums">{track.ratingCount ?? ""}</td>
                )}

                {/* Label */}
                {visibleCols.has("label") && (
                  <td className="p-2 truncate max-w-[160px]">{track.parentStudio ?? ""}</td>
                )}

                {/* Bit Rate */}
                {visibleCols.has("bitrate") && (
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">{formatBitrate(track.bitrate)}</td>
                )}

                {/* Format */}
                {visibleCols.has("format") && (
                  <td className="p-2 uppercase text-xs">{track.codec ?? ""}</td>
                )}

                {/* Date Added */}
                {visibleCols.has("added_at") && (
                  <td className="p-2 whitespace-nowrap">{formatDate(track.addedAt)}</td>
                )}

                {/* Rating */}
                {visibleCols.has("rating") && (
                  <td className="p-2">
                    <StarRating itemId={track.id} userRating={track.userRating} artist={track.artistName ?? ""} track={track.title} />
                  </td>
                )}

                {/* Date Rated */}
                {visibleCols.has("rated_at") && (
                  <td className="p-2 whitespace-nowrap">{formatDate(track.lastRatedAt ?? null)}</td>
                )}

                {/* Duration */}
                <td className="p-2 text-right tabular-nums">{formatMs(track.duration)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Sentinel + virtual spacer for infinite scroll */}
      {sentinel && <div ref={sentinel} />}
      {sentinel && spacerHeight > 0 && (
        <div style={{ height: `${spacerHeight}px` }} className="relative">
          {isFetchingMore && (
            <div className="flex items-center justify-center gap-2 pt-4 text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading more…
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {tracks.length === 0 && !isLoading && (
        <div className="py-12 text-center text-sm text-gray-500">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}
