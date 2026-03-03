import { useEffect, useState } from "react"

interface UseTableSortOpts<TCol extends string> {
  descByDefault?: TCol[]  // columns that sort descending by default (e.g. "rating")
  resetKey?: unknown       // reset sort when this value changes (e.g. playlistId)
}

export function useTableSort<TCol extends string>(opts?: UseTableSortOpts<TCol>) {
  const [sortCol, setSortCol] = useState<TCol | "default">("default")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  useEffect(() => {
    if (opts?.resetKey === undefined) return
    setSortCol("default")
    setSortDir("asc")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.resetKey])

  function handleSort(col: string) {
    const c = col as TCol
    if (sortCol === c) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortCol(c)
      setSortDir(opts?.descByDefault?.includes(c) ? "desc" : "asc")
    }
  }

  return { sortCol, sortDir, handleSort }
}
