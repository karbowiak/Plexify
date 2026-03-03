import { useEffect, useMemo } from "react"
import { Link } from "wouter"
import { useShallow } from "zustand/react/shallow"
import { useLibraryStore, usePlayerStore, useConnectionStore, buildPlexImageUrl, useUIStore } from "../../stores"
import { formatMs, formatTotalMs, formatDate, keyToId } from "../../lib/formatters"
import { SortTh } from "../shared/SortTh"
import { StarRating } from "../shared/StarRating"
import { prefetchTrackAudio } from "../../stores/playerStore"
import { useContextMenu } from "../../hooks/useContextMenu"
import { useTableSort } from "../../hooks/useTableSort"



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
  const { handler: ctxMenu, isTarget: isCtxTarget } = useContextMenu()
  const { baseUrl, token, musicSectionId } = useConnectionStore(useShallow(s => ({
    baseUrl: s.baseUrl,
    token: s.token,
    musicSectionId: s.musicSectionId,
  })))
  const pageRefreshKey = useUIStore(s => s.pageRefreshKey)

  useEffect(() => {
    if (musicSectionId !== null) void fetchLikedTracks(musicSectionId)
  }, [musicSectionId, pageRefreshKey])

  // Deduplicate by GUID (smart playlists can return the same track twice)
  const seen = new Set<string>()
  const dedupedTracks = likedTracks.filter(t => {
    const key = t.guid ?? `${t.grandparent_key}||${t.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  type SortCol = "default" | "title" | "artist" | "album" | "rating" | "rated_at" | "duration"
  const { sortCol, sortDir, handleSort } = useTableSort<SortCol>({ descByDefault: ["rating"] })

  const tracks = useMemo(() => {
    if (sortCol === "default") return dedupedTracks
    const items = [...dedupedTracks]
    items.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case "title":    cmp = a.title.localeCompare(b.title); break
        case "artist":   cmp = a.grandparent_title.localeCompare(b.grandparent_title); break
        case "album":    cmp = a.parent_title.localeCompare(b.parent_title); break
        case "rating":   cmp = (a.user_rating ?? 0) - (b.user_rating ?? 0); break
        case "rated_at": cmp = (a.last_rated_at ? +new Date(a.last_rated_at) : 0) - (b.last_rated_at ? +new Date(b.last_rated_at) : 0); break
        case "duration": cmp = a.duration - b.duration; break
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return items
  }, [dedupedTracks, sortCol, sortDir])

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
      <div className="px-8 pt-4">
        <table className="w-full text-sm text-gray-400">
          <thead className="border-b border-white/10">
            <tr>
              <th
                className="p-2 text-center w-8"
                onClick={() => handleSort("default")}
                title="Restore default order (most recently rated)"
                style={{ cursor: sortCol !== "default" ? "pointer" : "default" }}
              >#</th>
              <SortTh col="title"    label="Title"       active={sortCol} dir={sortDir} onSort={handleSort} align="left" />
              <SortTh col="album"    label="Album"       active={sortCol} dir={sortDir} onSort={handleSort} align="left" />
              <SortTh col="rating"   label="Rating"      active={sortCol} dir={sortDir} onSort={handleSort} align="left" />
              <SortTh col="rated_at" label="Date Rated"  active={sortCol} dir={sortDir} onSort={handleSort} align="left" />
              <SortTh col="duration" label="Duration"    active={sortCol} dir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {tracks.map((track, idx) => {
              const rawThumb = track.thumb || track.parent_thumb || null
              const trackThumb = rawThumb ? buildPlexImageUrl(baseUrl, token, rawThumb) : null
              const albumId = keyToId(track.parent_key)
              const artistId = keyToId(track.grandparent_key)
              const isActive = currentTrack?.rating_key === track.rating_key
              const isContextTarget = isCtxTarget(track.rating_key)
              return (
                <tr
                  key={track.rating_key}
                  className={`group cursor-pointer rounded ${isActive || isContextTarget ? "bg-accent/5" : "hover:bg-accent/5"}`}
                  onClick={() => void playTrack(track, tracks, "Liked Songs", "/collection/tracks")}
                  onMouseEnter={() => prefetchTrackAudio(track)}
                  onContextMenu={ctxMenu("track", track)}
                >
                  {/* Index */}
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

                  {/* Title cell: thumbnail + title + subtitle row */}
                  <td className="p-2">
                    <div className="flex items-center gap-3">
                      {trackThumb ? (
                        <img className="h-10 w-10 rounded-sm flex-shrink-0 object-cover" src={trackThumb} alt="" />
                      ) : (
                        <div className="h-10 w-10 rounded-sm flex-shrink-0 bg-app-surface" />
                      )}
                      <div className="min-w-0">
                        <div className={`truncate ${isActive ? "text-accent" : "text-white"}`}>{track.title}</div>
                        {/* Subtitle: artist + fade-in actions */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="truncate shrink min-w-0">
                            {artistId ? (
                              <Link
                                href={`/artist/${artistId}`}
                                className="text-gray-500 hover:text-white hover:underline transition-colors"
                                onClick={e => e.stopPropagation()}
                              >
                                {track.grandparent_title}
                              </Link>
                            ) : (
                              <span className="text-gray-500">{track.grandparent_title}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-accent/10"
                              title="Add to Queue"
                              onClick={e => { e.stopPropagation(); addToQueue([track]) }}
                            >
                              <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                                <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/>
                              </svg>
                              Queue
                            </button>
                            <button
                              className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-accent/10"
                              title="Track Radio"
                              onClick={e => { e.stopPropagation(); void playRadio(track.rating_key, 'track') }}
                            >
                              <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5a3 3 0 1 0 0 6A3 3 0 0 0 8 5zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
                              </svg>
                              Radio
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Album */}
                  <td className="p-2 truncate max-w-[200px]">
                    {albumId ? (
                      <Link
                        href={`/album/${albumId}`}
                        className="hover:text-white hover:underline transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        {track.parent_title}
                      </Link>
                    ) : (
                      track.parent_title
                    )}
                  </td>

                  {/* Rating — always visible, interactive */}
                  <td className="p-2">
                    <StarRating ratingKey={track.rating_key} userRating={track.user_rating} artist={track.grandparent_title ?? ""} track={track.title} />
                  </td>

                  {/* Date Rated */}
                  <td className="p-2 whitespace-nowrap">{formatDate(track.last_rated_at ?? null)}</td>

                  {/* Duration */}
                  <td className="p-2 text-right tabular-nums">{formatMs(track.duration)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {count === 0 && (
          <div className="py-12 text-center text-sm text-gray-500">
            No rated tracks yet. Rate a song in Plex to see it here.
          </div>
        )}
      </div>
    </div>
  )
}
