import { useLayoutEffect, useRef } from "react"

/**
 * Module-level Map — survives the entire session without a store.
 */
const positions = new Map<string, number>()

/**
 * Saves and restores a scrollable element's scroll position.
 *
 * Uses `useLayoutEffect` so that:
 * - The cleanup (save) runs before React clears refs → `ref.current` is valid.
 * - The body (restore) runs after React commits the DOM but before paint → no
 *   flash at position 0.
 *
 * Pass `axis: "y"` for vertical scroll (default is "x" for horizontal rows).
 * Pass `undefined` as `key` to opt out.
 */
export function useScrollRestore(key: string | undefined, axis: "x" | "y" = "x") {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!key) return

    // Restore — runs synchronously after DOM commit, before paint.
    const saved = positions.get(key)
    if (saved !== undefined && ref.current) {
      if (axis === "x") ref.current.scrollLeft = saved
      else ref.current.scrollTop = saved
    }

    // Save on unmount — useLayoutEffect cleanup runs before React clears
    // refs, so ref.current is still the real DOM node here.
    return () => {
      if (!ref.current) return
      positions.set(key, axis === "x" ? ref.current.scrollLeft : ref.current.scrollTop)
    }
  }, [key, axis])

  return ref
}
