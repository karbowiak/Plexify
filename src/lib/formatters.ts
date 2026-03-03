import type { Track } from "../types/plex"

export function formatMs(ms: number): string {
  if (!ms || isNaN(ms)) return "0:00"
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
}

export function formatTotalMs(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  const hr = Math.floor(totalMin / 60)
  const min = totalMin % 60
  if (hr === 0) return `${min} min`
  return min > 0 ? `${hr} hr ${min} min` : `${hr} hr`
}

export function formatDate(value: string | null): string {
  if (!value) return ""
  const num = Number(value)
  const date = isNaN(num) ? new Date(value) : new Date(num * 1000)
  if (isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)
}

export function formatBitrate(kbps: number | null | undefined): string {
  if (!kbps) return ""
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`
}

export function formatTimeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000)
  if (m < 1) return "Just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function formatSampleRate(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)} kHz`
  return `${hz} Hz`
}

export function starsFromRating(rating: number | null): number {
  if (!rating) return 0
  return Math.round(rating / 2)
}

export function keyToId(key: string): number {
  return parseInt(key.split("/").pop() ?? "0", 10)
}

export function formatTotalDuration(tracks: Track[]): string {
  const totalMs = tracks.reduce((sum, t) => sum + t.duration, 0)
  const totalSec = Math.floor(totalMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
