import { Link, useLocation } from "wouter"
import clsx from "clsx"
import { useLibraryStore, useConnectionStore, buildPlexImageUrl } from "../stores"

export function SideBar({ onCreatePlaylist }: { onCreatePlaylist: () => void }) {
  const [location] = useLocation()
  const playlists = useLibraryStore(s => s.playlists)
  const { baseUrl, token } = useConnectionStore()

  return (
    <div className="flex h-full w-60 flex-shrink-0 flex-col bg-black p-6">
      <ul className="flex-shrink-0 pt-1 text-sm font-semibold">
        {routes1.map((i, index) => (
          <li key={`${i.href}-${index}`}>
            <Link
              href={i.href}
              className={clsx(
                "flex h-10 cursor-pointer items-center gap-4 rounded no-underline transition-colors duration-300 hover:fill-white hover:text-white hover:no-underline",
                location !== i.href
                  ? "fill-gray-400 text-gray-400"
                  : "fill-white text-white"
              )}
            >
              <svg height="24" width="24" viewBox="0 0 24 24">
                {location !== i.href ? i.icon : i.iconActive}
              </svg>
              <span>{i.title}</span>
            </Link>
          </li>
        ))}
      </ul>

      <ul className="flex-shrink-0 border-b border-[#282828] pb-1 pt-8 text-sm font-semibold">
        {routes2.map((i, index) => (
          <li key={`${i.href}-${index}`}>
            {i.href === "/create" ? (
              <button
                onClick={onCreatePlaylist}
                className="flex h-10 w-full cursor-pointer items-center gap-4 rounded fill-gray-400 text-gray-400 transition-colors duration-300 hover:fill-white hover:text-white"
              >
                {i.icon}
                <span>{i.title}</span>
              </button>
            ) : (
              <Link
                href={i.href}
                className={clsx(
                  "flex h-10 cursor-pointer items-center gap-4 rounded no-underline transition-colors duration-300 hover:fill-white hover:text-white hover:no-underline",
                  location !== i.href
                    ? "fill-gray-400 text-gray-400"
                    : "fill-white text-white"
                )}
              >
                {i.icon}
                <span>{i.title}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        <ul className="pt-1">
          {playlists.map((playlist) => {
            const href = `/playlist/${playlist.rating_key}`
            const artPath = playlist.thumb ?? playlist.composite
            const artUrl = artPath ? buildPlexImageUrl(baseUrl, token, artPath) : null
            return (
              <li key={playlist.rating_key}>
                <Link
                  href={href}
                  className={clsx(
                    "flex cursor-default items-center gap-3 rounded-md px-1 py-[5px] no-underline hover:bg-white/10 hover:no-underline",
                    location !== href ? "text-[#b3b3b3]" : "text-white"
                  )}
                >
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-[#282828]">
                    {artUrl && (
                      <img src={artUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <span className="truncate text-sm font-normal">{playlist.title}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

const routes1 = [
  {
    title: "Home",
    href: "/",
    icon: (
      <path d="M12.5 3.247a1 1 0 0 0-1 0L4 7.577V20h4.5v-6a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v6H20V7.577l-7.5-4.33zm-2-1.732a3 3 0 0 1 3 0l7.5 4.33a2 2 0 0 1 1 1.732V21a1 1 0 0 1-1 1h-6.5a1 1 0 0 1-1-1v-6h-3v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.577a2 2 0 0 1 1-1.732l7.5-4.33z"></path>
    ),
    iconActive: (
      <path d="M13.5 1.515a3 3 0 0 0-3 0L3 5.845a2 2 0 0 0-1 1.732V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6h4v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7.577a2 2 0 0 0-1-1.732l-7.5-4.33z" />
    ),
  },
  {
    title: "Search",
    href: "/search",
    icon: (
      <path d="M10.533 1.279c-5.18 0-9.407 4.14-9.407 9.279s4.226 9.279 9.407 9.279c2.234 0 4.29-.77 5.907-2.058l4.353 4.353a1 1 0 1 0 1.414-1.414l-4.344-4.344a9.157 9.157 0 0 0 2.077-5.816c0-5.14-4.226-9.28-9.407-9.28zm-7.407 9.279c0-4.006 3.302-7.28 7.407-7.28s7.407 3.274 7.407 7.28-3.302 7.279-7.407 7.279-7.407-3.273-7.407-7.28z"></path>
    ),
    iconActive: (
      <path d="M1.126 10.558c0-5.14 4.226-9.28 9.407-9.28 5.18 0 9.407 4.14 9.407 9.28a9.157 9.157 0 0 1-2.077 5.816l4.344 4.344a1 1 0 0 1-1.414 1.414l-4.353-4.353a9.454 9.454 0 0 1-5.907 2.058c-5.18 0-9.407-4.14-9.407-9.28z"></path>
    ),
  },
  {
    title: "Your Library",
    href: "/library",
    icon: (
      <path d="M14.5 2.134a1 1 0 0 1 1 0l6 3.464a1 1 0 0 1 .5.866V21a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V3a1 1 0 0 1 .5-.866zM16 4.732V20h4V7.041l-4-2.309zM3 22a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v18a1 1 0 0 1-1 1zm6 0a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v18a1 1 0 0 1-1 1z"></path>
    ),
    iconActive: (
      <path d="M3 22a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v18a1 1 0 0 1-1 1zM15.5 2.134A1 1 0 0 0 14 3v18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.464a1 1 0 0 0-.5-.866l-6-3.464zM9 2a1 1 0 0 0-1 1v18a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1z"></path>
    ),
  },
  {
    title: "Stations",
    href: "/stations",
    icon: (
      <path d="M12 2a8.997 8.997 0 0 1 7.663 4.267 1 1 0 1 1-1.697 1.06A6.998 6.998 0 0 0 5.034 7.327a1 1 0 1 1-1.697-1.06A8.997 8.997 0 0 1 12 2zM2.868 9.923a1 1 0 0 1 1.326.482A6.98 6.98 0 0 0 12 14.993a6.98 6.98 0 0 0 7.806-4.588 1 1 0 0 1 1.808.844A8.98 8.98 0 0 1 12 16.993a8.98 8.98 0 0 1-9.614-5.744 1 1 0 0 1 .482-1.326zM12 18a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-4 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm8 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    ),
    iconActive: (
      <path d="M12 2a8.997 8.997 0 0 1 7.663 4.267 1 1 0 1 1-1.697 1.06A6.998 6.998 0 0 0 5.034 7.327a1 1 0 1 1-1.697-1.06A8.997 8.997 0 0 1 12 2zM2.868 9.923a1 1 0 0 1 1.326.482A6.98 6.98 0 0 0 12 14.993a6.98 6.98 0 0 0 7.806-4.588 1 1 0 0 1 1.808.844A8.98 8.98 0 0 1 12 16.993a8.98 8.98 0 0 1-9.614-5.744 1 1 0 0 1 .482-1.326zM12 18a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-4 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm8 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    ),
  },
]

const routes2 = [
  {
    title: "Create Playlist",
    href: "/create",
    icon: (
      <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-white bg-opacity-60 text-black group-hover:bg-opacity-100">
        <svg viewBox="0 0 16 16" width="12" height="12" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 7H9V2H7v5H2v2h5v5h2V9h5z" fill="currentColor"></path>
          <path fill="none" d="M0 0h16v16H0z"></path>
        </svg>
      </span>
    ),
  },
  {
    title: "Liked Songs",
    href: "/collection/tracks",
    icon: (
      <svg height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.724 4.22A4.313 4.313 0 0 0 12 6.192 4.313 4.313 0 0 0 8.276 4.22a4.313 4.313 0 0 0-4.204 4.32c0 3.96 4.49 7.98 7.928 10.47 3.44-2.49 7.928-6.51 7.928-10.47a4.313 4.313 0 0 0-4.204-4.32z" />
      </svg>
    ),
  },
]
