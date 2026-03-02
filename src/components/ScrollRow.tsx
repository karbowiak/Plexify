import { Link } from "wouter"
import { useScrollRestore } from "../hooks/useScrollRestore"

interface ScrollRowProps {
  title: string
  titleHref?: string
  children: React.ReactNode
  restoreKey?: string
}

export function ScrollRow({ title, titleHref, children, restoreKey }: ScrollRowProps) {
  const scrollRef = useScrollRestore(restoreKey, "x")

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -440 : 440, behavior: "smooth" })
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {titleHref ? (
          <Link
            href={titleHref}
            className="grow text-2xl font-bold hover:underline decoration-white/40 underline-offset-4 flex items-center gap-2 group"
          >
            {title}
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"
                 className="text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0">
              <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"/>
            </svg>
          </Link>
        ) : (
          <span className="grow text-2xl font-bold">{title}</span>
        )}
        <button
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-black transition-all hover:brightness-110 active:scale-95"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-black transition-all hover:brightness-110 active:scale-95"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  )
}
