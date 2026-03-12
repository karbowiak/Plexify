import { useSyncExternalStore } from "react"

const query = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : null

let _reduced = query?.matches ?? false

query?.addEventListener("change", (e) => {
  _reduced = e.matches
})

/** Module-level getter — use outside React (e.g. in RAF loops). */
export function getReducedMotion(): boolean {
  return _reduced
}

function subscribe(cb: () => void): () => void {
  if (!query) return () => {}
  const handler = () => { _reduced = query.matches; cb() }
  query.addEventListener("change", handler)
  return () => query.removeEventListener("change", handler)
}

function getSnapshot(): boolean {
  return _reduced
}

/** React hook — re-renders when the user toggles reduced motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
