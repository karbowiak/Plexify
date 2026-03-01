import { Link } from "wouter"
import clsx from "clsx"

interface MediaCardProps {
  title: string
  desc: string
  thumb: string | null
  isArtist?: boolean
  /** When true, fixes card at 160px wide and prevents flex shrink (for scroll rows) */
  scrollItem?: boolean
  href?: string
  onClick?: () => void
  /** Called once on first hover — used for eager pre-fetching of page data. */
  prefetch?: () => void
}

export function MediaCard({ title, desc, thumb, isArtist, scrollItem, href, onClick, prefetch }: MediaCardProps) {
  const inner = (
    <div
      onMouseEnter={prefetch}
      className={clsx(
        "group cursor-pointer rounded-md bg-[#181818] p-3 transition-colors hover:bg-[#282828]",
        scrollItem && "w-40 flex-shrink-0"
      )}
    >
      <div className="mb-3">
        {thumb ? (
          <img
            src={thumb}
            alt={title}
            draggable={false}
            loading="lazy"
            className={
              isArtist
                ? "aspect-square w-full rounded-full object-cover"
                : "aspect-square w-full rounded-md object-cover"
            }
          />
        ) : (
          <div
            className={
              isArtist
                ? "aspect-square w-full rounded-full bg-[#282828]"
                : "aspect-square w-full rounded-md bg-[#282828]"
            }
          />
        )}
      </div>
      <div className="truncate text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 truncate text-xs text-neutral-400">{desc}</div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className={clsx("no-underline hover:no-underline", scrollItem && "flex-shrink-0")}>
        {inner}
      </Link>
    )
  }

  if (onClick) {
    return <div onClick={onClick} className={clsx(scrollItem && "flex-shrink-0")}>{inner}</div>
  }

  return inner
}
