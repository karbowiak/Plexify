import { Route, useLocation } from "wouter"
import { createContext, useContext, useLayoutEffect, useRef, RefObject } from "react"
import { Playlist } from "./Pages/Playlist"
import { Home } from "./Pages/Home"
import { Library } from "./Pages/Library"
import { ArtistPage } from "./Pages/Artist"
import { AlbumPage } from "./Pages/Album"
import { Liked } from "./Pages/Liked"
import { SettingsPage } from "./Pages/Settings"
import clsx from "clsx"
import { TopBar } from "./TopBar"
import { Search } from "./Pages/Search"

// Module-level map — persists for the app lifetime.
const verticalScrollPositions = new Map<string, number>()

/**
 * Provides the main scroll container ref to nested page components.
 * Pass the ref OBJECT (not ref.current) so children can read .current
 * inside their useEffect hooks after the DOM has been committed.
 */
export const ScrollContainerContext = createContext<RefObject<HTMLDivElement | null> | null>(null)
export const useScrollContainer = () => useContext(ScrollContainerContext)


const bg = {
  home: "bg-gradient-to-b from-[#222222] from-10% via-[#121212] via-40% to-[#121212] to-90%",
  search:
    "bg-gradient-to-b from-[#121212] from-10% via-[#121212] via-40% to-[#121212] to-90%",
  library:
    "bg-gradient-to-b from-[#121212] from-10% via-[#121212] via-40% to-[#121212] to-90%",
  collection:
    "bg-gradient-to-b from-indigo-900 from-10% via-[#121212] via-40% to-[#121212] to-90%",
  playlist: "bg-gradient-to-b from-[#121212] from-10% via-[#121212] via-40% to-[#121212] to-90%",
  artist: "bg-gradient-to-b from-[#121212] from-10% via-[#121212] via-40% to-[#121212] to-90%",
  album: "bg-gradient-to-b from-[#121212] from-10% via-[#121212] via-40% to-[#121212] to-90%",
  stations: "bg-gradient-to-b from-[#121212] from-10% via-[#121212] via-40% to-[#121212] to-90%",
  settings: "bg-gradient-to-b from-[#121212] from-10% via-[#121212] via-40% to-[#121212] to-90%",
}

const NO_PADDING_ROUTES = new Set(["playlist", "artist", "album", "collection", "settings"])

export function Page() {
  const [location] = useLocation()
  const baseLoc = location.split("/")[1]
  const scrollRef = useRef<HTMLDivElement>(null)

  const bgClass = bg[baseLoc as keyof typeof bg] || bg["home"]
  const hasPadding = !NO_PADDING_ROUTES.has(baseLoc)

  // Restore scroll before the browser paints (no flash at position 0).
  // The content is already committed to the DOM when useLayoutEffect runs,
  // so scrollTop lands correctly even for tall cached pages.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = verticalScrollPositions.get(location) ?? 0
  }, [location])

  return (
    // Pass the ref object (stable identity) — children read .current in their effects.
    <ScrollContainerContext.Provider value={scrollRef}>
    <div className={clsx("flex h-full flex-col", bgClass)}>
      <TopBar />

      <div
        ref={scrollRef}
        onScroll={e => verticalScrollPositions.set(location, e.currentTarget.scrollTop)}
        className={clsx(
          "flex-1 overflow-auto border-[#413a43] transition-colors scrollbar scrollbar-track-transparent scrollbar-thumb-[#636363] scrollbar-track-rounded-lg scrollbar-w-3 hover:scrollbar-thumb-[#8f8f8f] dark:border-neutral-600",
          hasPadding ? "p-8" : undefined
        )}
      >
        <Route path="/" key="home">
          <Home />
        </Route>

        <Route path="/index.html" key="index">
          <Home />
        </Route>

        <Route path="/search" key="search">
          <Search />
        </Route>

        <Route path="/library" key="library">
          <Library />
        </Route>

        <Route path="/playlist/:id" key="playlist">
          {(params: { id?: string }) => {
            const id = parseInt(params.id ?? "0", 10)
            return id ? <Playlist playlistId={id} /> : null
          }}
        </Route>

        <Route path="/artist/:id" key="artist">
          {(params: { id?: string }) => {
            const id = parseInt(params.id ?? "0", 10)
            return id ? <ArtistPage artistId={id} /> : null
          }}
        </Route>

        <Route path="/collection/tracks" key="liked">
          <Liked />
        </Route>

        <Route path="/stations" key="stations">
          <div>
            <h1 className="mb-4 text-2xl font-bold">Stations</h1>
            <p className="text-sm text-gray-400">Stations coming soon — artist mixes, album mixes, and radio will appear here.</p>
          </div>
        </Route>

        <Route path="/album/:id" key="album">
          {(params: { id?: string }) => {
            const id = parseInt(params.id ?? "0", 10)
            return id ? <AlbumPage albumId={id} /> : null
          }}
        </Route>

        <Route path="/settings" key="settings">
          <SettingsPage />
        </Route>
      </div>
    </div>
    </ScrollContainerContext.Provider>
  )
}
