const EVICTION_TTL_MS = 14 * 24 * 60 * 60_000 // 14 days

/** Prune entries older than 14 days. Returns the same object if nothing was evicted. */
export function evictStaleEntries<T>(
  record: Record<string, { data: T; cachedAt: number }>,
): Record<string, { data: T; cachedAt: number }> {
  const cutoff = Date.now() - EVICTION_TTL_MS
  const entries = Object.entries(record)
  const fresh = entries.filter(([, v]) => v.cachedAt >= cutoff)
  if (fresh.length === entries.length) return record // nothing to evict
  return Object.fromEntries(fresh)
}

/** Evict oldest entries from a Map when it exceeds `max` size. */
export function evictMap<K, V>(map: Map<K, V>, max: number) {
  if (map.size <= max) return
  const toDelete = map.size - Math.floor(max * 0.75)
  let i = 0
  for (const key of map.keys()) {
    if (i++ >= toDelete) break
    map.delete(key)
  }
}
