import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useLocation } from "wouter"
import { open } from "@tauri-apps/plugin-shell"
import { useShallow } from "zustand/react/shallow"
import { useContextMenuStore } from "../stores/contextMenuStore"
import { usePlayerStore, useLibraryStore } from "../stores"
import { useConnectionStore } from "../stores/connectionStore"
import { useDeezerMetadataStore } from "../stores/deezerMetadataStore"
import { useUIStore } from "../stores/uiStore"
import { useDebugStore } from "../stores/debugStore"
import { useDebugPanelStore } from "../stores/debugPanelStore"
import { addItemsToPlaylist, getAlbumTracks, buildItemUri } from "../lib/plex"
import { keyToId } from "../lib/formatters"
import { StarRating } from "./shared/StarRating"
import {
  MenuItem as Item, MenuDivider as Divider, MenuSectionLabel as SectionLabel,
  IconPlay, IconNext, IconQueue, IconNewPlaylist, IconRadio, IconShare,
  IconArtist, IconAlbum, IconPlaylist, IconBug,
} from "./shared/ContextMenuPrimitives"
import { getRecentPlaylistIds, recordRecentPlaylist } from "../lib/recentPlaylists"
import type { Track, Album, Artist, Playlist } from "../types/plex"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function lfmUrl(type: "artist" | "album" | "track", artist: string, albumOrTrack?: string): string {
  const a = encodeURIComponent(artist)
  if (type === "artist") return `https://www.last.fm/music/${a}`
  if (type === "album") return `https://www.last.fm/music/${a}/${encodeURIComponent(albumOrTrack ?? "")}`
  return `https://www.last.fm/music/${a}/_/${encodeURIComponent(albumOrTrack ?? "")}`
}

// ---------------------------------------------------------------------------
// Playlist section
// ---------------------------------------------------------------------------

interface PlaylistSectionProps {
  itemIds: number[]
  close: () => void
  onNewPlaylist: () => void
}

function PlaylistSection({ itemIds, close, onNewPlaylist }: PlaylistSectionProps) {
  const playlists = useLibraryStore(s => s.playlists).filter(p => !p.smart && !p.radio)
  const recentIds = getRecentPlaylistIds()

  const recentPlaylists = recentIds
    .map(id => playlists.find(p => p.rating_key === id))
    .filter((p): p is Playlist => p !== undefined)

  const otherPlaylists = playlists
    .filter(p => !recentIds.includes(p.rating_key))
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))

  async function addTo(playlist: Playlist) {
    recordRecentPlaylist(playlist.rating_key)
    await addItemsToPlaylist(playlist.rating_key, itemIds).catch(() => {})
    useLibraryStore.getState().invalidatePlaylistItems(playlist.rating_key)
    close()
  }

  return (
    <div className="max-h-52 overflow-y-auto">
      <Item icon={IconNewPlaylist} label="New playlist…" onClick={onNewPlaylist} />
      {recentPlaylists.length > 0 && (
        <>
          <Divider />
          <SectionLabel label="Recent" />
          {recentPlaylists.map(pl => (
            <Item key={pl.rating_key} icon={IconPlaylist} label={pl.title} onClick={() => void addTo(pl)} />
          ))}
          {otherPlaylists.length > 0 && <Divider />}
        </>
      )}
      {otherPlaylists.length > 0 && recentPlaylists.length === 0 && <Divider />}
      {otherPlaylists.map(pl => (
        <Item key={pl.rating_key} icon={IconPlaylist} label={pl.title} onClick={() => void addTo(pl)} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContextMenu() {
  const { open: isOpen, x, y, type, data, close } = useContextMenuStore()
  const debugEnabled = useDebugStore(s => s.debugEnabled)
  const showDebugPanel = useDebugPanelStore(s => s.show)
  const { playTrack, playFromUri, playRadio, addNext, addToQueue } = usePlayerStore(useShallow(s => ({
    playTrack: s.playTrack,
    playFromUri: s.playFromUri,
    playRadio: s.playRadio,
    addNext: s.addNext,
    addToQueue: s.addToQueue,
  })))
  const { sectionUuid } = useConnectionStore(useShallow(s => ({ sectionUuid: s.sectionUuid })))
  const { setShowCreatePlaylist, setPendingPlaylistItemIds } = useUIStore(useShallow(s => ({
    setShowCreatePlaylist: s.setShowCreatePlaylist,
    setPendingPlaylistItemIds: s.setPendingPlaylistItemIds,
  })))
  const [, navigate] = useLocation()
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ left: -9999, top: -9999 })

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [isOpen, close])

  // Clamp to viewport after actual render so we know the real menu height.
  // When closed, reset to off-screen so there's no flash at the old position on next open.
  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPos({ left: -9999, top: -9999 })
      return
    }
    if (!menuRef.current) return
    const el = menuRef.current
    const rect = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    setMenuPos({ left, top })
  }, [isOpen, x, y])

  if (!isOpen || !type || !data) return null

  const track = type === "track" ? (data as Track) : null
  const album = type === "album" ? (data as Album) : null
  const artist = type === "artist" ? (data as Artist) : null

  // Deezer URLs (synchronous cache read)
  const deezerState = useDeezerMetadataStore.getState()
  let deezerUrl: string | null = null
  if (artist) {
    const cached = deezerState.artists[artist.title.toLowerCase()]
    deezerUrl = cached?.data.deezer_url ?? null
  } else if (album) {
    const key = `${album.parent_title.toLowerCase()}::${album.title.toLowerCase()}`
    const cached = deezerState.albums[key]
    deezerUrl = cached?.data.deezer_url ?? null
  } else if (track) {
    const key = `${(track.grandparent_title ?? "").toLowerCase()}::${(track.parent_title ?? "").toLowerCase()}`
    const cached = deezerState.albums[key]
    deezerUrl = cached?.data.deezer_url ?? null
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function doPlay() {
    if (track) void playTrack(track)
    else if (album) {
      const uri = buildItemUri(sectionUuid, album.key)
      void playFromUri(uri, false, album.title, `/album/${album.rating_key}`)
    } else if (artist) {
      const uri = buildItemUri(sectionUuid, artist.key)
      void playFromUri(uri, false, artist.title, `/artist/${artist.rating_key}`)
    }
    close()
  }

  function doAddNext() {
    if (track) {
      addNext([track])
      close()
    } else if (album) {
      void getAlbumTracks(album.rating_key).then(tracks => { addNext(tracks); close() })
    }
  }

  function doQueue() {
    if (track) {
      addToQueue([track])
      close()
    } else if (album) {
      void getAlbumTracks(album.rating_key).then(tracks => {
        addToQueue(tracks)
        close()
      })
    } else if (artist) {
      // For artists, play from URI in shuffle mode which enqueues all tracks
      const uri = buildItemUri(sectionUuid, artist.key)
      void playFromUri(uri, true, artist.title, `/artist/${artist.rating_key}`)
      close()
    }
  }

  function doRadio() {
    const key = track?.rating_key ?? album?.rating_key ?? artist?.rating_key
    const radioType = track ? "track" : album ? "album" : "artist"
    if (key) void playRadio(key, radioType as "track" | "album" | "artist")
    close()
  }

  function doShare(url: string) {
    void open(url)
    close()
  }

  function goToArtist() {
    if (track) navigate(`/artist/${keyToId(track.grandparent_key)}`)
    close()
  }

  function goToAlbum() {
    if (track) navigate(`/album/${keyToId(track.parent_key)}`)
    close()
  }

  // Determine item IDs for "add to playlist"
  const itemIds = track
    ? [track.rating_key]
    : album
    ? [album.rating_key]
    : artist
    ? [artist.rating_key]
    : []

  // Rating data
  const ratingKey = data.rating_key
  const userRating = data.user_rating ?? null
  const artistName = track?.grandparent_title ?? album?.parent_title ?? artist?.title ?? ""
  const itemTitle = track?.title ?? album?.title ?? artist?.title ?? ""

  // Share URLs
  const lfmArtistUrl = lfmUrl("artist", artistName)
  const lfmItemUrl = track
    ? lfmUrl("track", artistName, itemTitle)
    : album
    ? lfmUrl("album", artistName, itemTitle)
    : null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998]" onContextMenu={e => { e.preventDefault(); close() }} onClick={close} />

      {/* Menu */}
      <div
        ref={menuRef}
        style={{ left: menuPos.left, top: menuPos.top }}
        className="fixed z-[9999] w-60 rounded-lg border border-white/10 bg-[#1a1a1f] shadow-2xl py-1 text-sm select-none"
      >
        {/* Play */}
        <Item
          icon={IconPlay}
          label={type === "track" ? "Play now" : type === "album" ? "Play album" : "Play all"}
          onClick={doPlay}
        />
        {(track || album) && <Item icon={IconNext} label="Play next" onClick={doAddNext} />}
        <Item icon={IconQueue} label="Add to bottom" onClick={doQueue} />
        <Item icon={IconRadio} label="Start radio" onClick={doRadio} />

        <Divider />

        {/* Rating */}
        <StarRating
          ratingKey={ratingKey}
          userRating={userRating}
          enableLove={type === "track"}
          artist={artistName}
          track={itemTitle}
          size={14}
          onRated={close}
        />

        {/* Add to playlist — tracks only */}
        {track && (
          <>
            <Divider />
            <SectionLabel label="Add to playlist" />
            <PlaylistSection
              itemIds={itemIds}
              close={close}
              onNewPlaylist={() => {
                setPendingPlaylistItemIds(itemIds)
                setShowCreatePlaylist(true)
                close()
              }}
            />
          </>
        )}

        <Divider />

        {/* Share */}
        <SectionLabel label="Share" />
        <Item icon={IconShare} label="Last.fm artist" onClick={() => doShare(lfmArtistUrl)} />
        {lfmItemUrl && (
          <Item
            icon={IconShare}
            label={type === "track" ? "Last.fm track" : "Last.fm album"}
            onClick={() => doShare(lfmItemUrl)}
          />
        )}
        {deezerUrl && (
          <Item icon={IconShare} label="Deezer" onClick={() => doShare(deezerUrl!)} />
        )}

        {/* Navigation */}
        {track && (
          <>
            <Divider />
            <Item icon={IconArtist} label="Go to artist" onClick={goToArtist} />
            <Item icon={IconAlbum} label="Go to album" onClick={goToAlbum} />
          </>
        )}
        {album && (
          <>
            <Divider />
            <Item
              icon={IconArtist}
              label="Go to artist"
              onClick={() => { navigate(`/artist/${keyToId(album.parent_key)}`); close() }}
            />
          </>
        )}

        {debugEnabled && (
          <>
            <Divider />
            <SectionLabel label="Debug" />
            <Item
              icon={IconBug}
              label="Debug Info"
              onClick={() => { showDebugPanel(type!, data!); close() }}
            />
          </>
        )}
      </div>
    </>
  )
}
