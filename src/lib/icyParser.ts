/**
 * Parse an ICY metadata string (StreamTitle='Artist - Title';) into artist/title.
 *
 * @example parseIcyString("StreamTitle='Radiohead - Creep';")
 * // { artist: "Radiohead", title: "Creep" }
 */
export function parseIcyString(raw: string): { artist: string | null; title: string | null } {
  // Extract StreamTitle value
  const match = raw.match(/StreamTitle='([^']*)'/i)
  if (!match || !match[1]) return { artist: null, title: null }

  const streamTitle = match[1].trim()
  if (!streamTitle) return { artist: null, title: null }

  // Try "Artist - Title" format (most common)
  const dashIdx = streamTitle.indexOf(" - ")
  if (dashIdx > 0) {
    return {
      artist: streamTitle.slice(0, dashIdx).trim() || null,
      title: streamTitle.slice(dashIdx + 3).trim() || null,
    }
  }

  // Fallback: entire string is the title
  return { artist: null, title: streamTitle }
}
