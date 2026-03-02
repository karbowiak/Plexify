const STORAGE_KEY = "plex-recent-searches"
const MAX_RECENT = 10

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function recordRecentSearch(query: string): void {
  const q = query.trim()
  if (!q) return
  const existing = getRecentSearches().filter(s => s.toLowerCase() !== q.toLowerCase())
  existing.unshift(q)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, MAX_RECENT)))
}

export function clearRecentSearches(): void {
  localStorage.removeItem(STORAGE_KEY)
}
