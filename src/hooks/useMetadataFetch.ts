import { useEffect } from "react"

export interface FetchSpec<T> {
  key: string | null | undefined  // skip fetch when falsy
  fetch(): Promise<T | null>
  setState(val: T | null): void
}

/**
 * Run multiple fetch-and-setState operations in a single cancellable useEffect.
 *
 * All setState functions are called with null at the start of each effect run,
 * then each fetch fires concurrently. If the component unmounts or deps change
 * before a fetch completes, the result is discarded.
 */
export function useMetadataFetch(specs: FetchSpec<unknown>[], deps: unknown[]): void {
  useEffect(() => {
    // Reset all states before fetching
    for (const spec of specs) spec.setState(null)

    let cancelled = false
    for (const spec of specs) {
      if (!spec.key) continue
      void spec.fetch().then(val => {
        if (!cancelled && val !== null) spec.setState(val)
      })
    }
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
