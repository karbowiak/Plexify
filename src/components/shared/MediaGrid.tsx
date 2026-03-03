import type { ReactNode } from "react"

interface MediaGridProps {
  gap?: 3 | 4
  children: ReactNode
  className?: string
}

export function MediaGrid({ gap = 4, children, className }: MediaGridProps) {
  return (
    <div
      className={`grid ${gap === 3 ? "gap-3" : "gap-4"}${className ? ` ${className}` : ""}`}
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(var(--card-size, 160px), 1fr))" }}
    >
      {children}
    </div>
  )
}
