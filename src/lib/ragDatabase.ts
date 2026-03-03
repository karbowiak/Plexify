/**
 * RAG (Retrieval-Augmented Generation) database for the music library.
 *
 * Indexes all artists, albums, tracks, genres, moods, and styles from Plex.
 * Stores structured documents in IndexedDB and provides text-based search
 * to build relevant context for AI queries.
 *
 * The index runs in the background after startup and rebuilds on demand.
 */

import { get, set, del } from "idb-keyval"
import { browseSection, searchLibrary } from "./plex"
import { useAiStore } from "../stores/aiStore"
import { useConnectionStore } from "../stores/connectionStore"
import { useLibraryStore } from "../stores/libraryStore"
import type { Track, Album, Artist, PlexMedia } from "../types/plex"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single indexed document in the RAG database. */
export interface RagDocument {
  /** Unique ID (e.g. "artist:1234", "track:5678") */
  id: string
  /** Document type for filtering */
  type: "artist" | "album" | "track" | "playlist" | "tag"
  /** The text content used for matching */
  text: string
  /** Structured metadata for the AI to use */
  metadata: Record<string, unknown>
}

const IDB_KEY_DOCS = "plexify-rag-documents-v1"
const IDB_KEY_TIMESTAMP = "plexify-rag-indexed-at-v1"

/** Page size when fetching items from Plex for indexing. */
const INDEX_PAGE_SIZE = 500

/** Delay between paginated fetches to avoid overwhelming the Plex server. */
const INDEX_FETCH_DELAY_MS = 100

// ---------------------------------------------------------------------------
// In-memory index
// ---------------------------------------------------------------------------

let documents: RagDocument[] = []
let isLoaded = false

/** Load documents from IndexedDB into memory. */
async function ensureLoaded(): Promise<void> {
  if (isLoaded) return
  try {
    const stored = await get<RagDocument[]>(IDB_KEY_DOCS)
    if (stored) {
      documents = stored
      isLoaded = true

      const ts = await get<number>(IDB_KEY_TIMESTAMP)
      const store = useAiStore.getState()
      store.setRagDocumentCount(documents.length)
      store.setRagLastIndexedAt(ts ?? null)
      if (documents.length > 0) {
        store.setRagStatus("ready")
      }
    }
  } catch {
    // Silently fail — will rebuild on next index
  }
}

/** Persist documents to IndexedDB. */
async function persist(): Promise<void> {
  await set(IDB_KEY_DOCS, documents)
  const now = Date.now()
  await set(IDB_KEY_TIMESTAMP, now)
  useAiStore.getState().setRagLastIndexedAt(now)
}

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

function artistDoc(a: Artist): RagDocument {
  return {
    id: `artist:${a.rating_key}`,
    type: "artist",
    text: [a.title, a.summary ?? ""].filter(Boolean).join(" — "),
    metadata: {
      rating_key: a.rating_key,
      title: a.title,
      summary: a.summary,
      user_rating: a.user_rating,
      guid: a.guid,
    },
  }
}

function albumDoc(a: Album): RagDocument {
  const tags = [
    ...(a.genre ?? []).map((g) => g.tag),
    ...(a.mood ?? []).map((m) => m.tag),
    ...(a.style ?? []).map((s) => s.tag),
  ]
  return {
    id: `album:${a.rating_key}`,
    type: "album",
    text: [
      a.title,
      a.parent_title,
      a.year ? String(a.year) : "",
      a.studio ?? "",
      ...tags,
    ]
      .filter(Boolean)
      .join(" | "),
    metadata: {
      rating_key: a.rating_key,
      title: a.title,
      artist: a.parent_title,
      year: a.year,
      studio: a.studio,
      genres: (a.genre ?? []).map((g) => g.tag),
      moods: (a.mood ?? []).map((m) => m.tag),
      styles: (a.style ?? []).map((s) => s.tag),
      track_count: a.leaf_count,
      user_rating: a.user_rating,
    },
  }
}

function trackDoc(t: Track): RagDocument {
  return {
    id: `track:${t.rating_key}`,
    type: "track",
    text: [
      t.title,
      t.grandparent_title,
      t.parent_title,
      t.year ? String(t.year) : "",
    ]
      .filter(Boolean)
      .join(" | "),
    metadata: {
      rating_key: t.rating_key,
      title: t.title,
      artist: t.grandparent_title,
      album: t.parent_title,
      year: t.year,
      duration_ms: t.duration,
      play_count: t.view_count,
      user_rating: t.user_rating,
      added_at: t.added_at,
    },
  }
}

// ---------------------------------------------------------------------------
// Indexer
// ---------------------------------------------------------------------------

/**
 * Build the RAG index from the Plex music library.
 *
 * Fetches all artists, albums, and tracks from the library section,
 * plus tag data and playlist metadata from the library store.
 *
 * Runs in the background with throttled pagination to avoid server overload.
 */
export async function buildRagIndex(): Promise<void> {
  const aiStore = useAiStore.getState()
  const { musicSectionId } = useConnectionStore.getState()

  if (!musicSectionId) {
    aiStore.setRagError("No music library connected")
    aiStore.setRagStatus("error")
    return
  }

  aiStore.setRagStatus("indexing")
  aiStore.setRagError(null)

  const newDocs: RagDocument[] = []

  try {
    // ── 1. Index all artists (paginated) ──
    let offset = 0
    while (true) {
      const page = await browseSection(musicSectionId, "artist", "titleSort:asc", INDEX_PAGE_SIZE, offset)
      for (const item of page) {
        if (item.type === "artist") newDocs.push(artistDoc(item as Artist & { type: "artist" }))
      }
      if (page.length < INDEX_PAGE_SIZE) break
      offset += page.length
      await delay(INDEX_FETCH_DELAY_MS)
    }

    // ── 2. Index all albums (paginated) ──
    offset = 0
    while (true) {
      const page = await browseSection(musicSectionId, "album", "titleSort:asc", INDEX_PAGE_SIZE, offset)
      for (const item of page) {
        if (item.type === "album") newDocs.push(albumDoc(item as Album & { type: "album" }))
      }
      if (page.length < INDEX_PAGE_SIZE) break
      offset += page.length
      await delay(INDEX_FETCH_DELAY_MS)
    }

    // ── 3. Index all tracks (paginated) ──
    offset = 0
    while (true) {
      const page = await browseSection(musicSectionId, "track", "titleSort:asc", INDEX_PAGE_SIZE, offset)
      for (const item of page) {
        if (item.type === "track") newDocs.push(trackDoc(item as Track & { type: "track" }))
      }
      if (page.length < INDEX_PAGE_SIZE) break
      offset += page.length
      await delay(INDEX_FETCH_DELAY_MS)
    }

    // ── 4. Index tags (genres, moods, styles) from library store ──
    const libStore = useLibraryStore.getState()
    for (const genre of libStore.tagsGenre) {
      newDocs.push({
        id: `tag:genre:${genre.tag}`,
        type: "tag",
        text: `Genre: ${genre.tag}`,
        metadata: { tag_type: "genre", tag: genre.tag, count: genre.count },
      })
    }
    for (const mood of libStore.tagsMood) {
      newDocs.push({
        id: `tag:mood:${mood.tag}`,
        type: "tag",
        text: `Mood: ${mood.tag}`,
        metadata: { tag_type: "mood", tag: mood.tag, count: mood.count },
      })
    }
    for (const style of libStore.tagsStyle) {
      newDocs.push({
        id: `tag:style:${style.tag}`,
        type: "tag",
        text: `Style: ${style.tag}`,
        metadata: { tag_type: "style", tag: style.tag, count: style.count },
      })
    }

    // ── 5. Index playlists from library store ──
    for (const pl of libStore.playlists) {
      newDocs.push({
        id: `playlist:${pl.rating_key}`,
        type: "playlist",
        text: [pl.title, pl.summary ?? ""].filter(Boolean).join(" — "),
        metadata: {
          rating_key: pl.rating_key,
          title: pl.title,
          track_count: pl.leaf_count,
          smart: pl.smart,
          summary: pl.summary,
        },
      })
    }

    // Commit
    documents = newDocs
    isLoaded = true
    await persist()
    aiStore.setRagDocumentCount(documents.length)
    aiStore.setRagStatus("ready")
  } catch (err) {
    aiStore.setRagError(String(err))
    aiStore.setRagStatus("error")
  }
}

/** Clear the RAG index from memory and disk. */
export async function clearRagIndex(): Promise<void> {
  documents = []
  isLoaded = false
  await del(IDB_KEY_DOCS)
  await del(IDB_KEY_TIMESTAMP)
  const aiStore = useAiStore.getState()
  aiStore.setRagDocumentCount(0)
  aiStore.setRagLastIndexedAt(null)
  aiStore.setRagStatus("idle")
}

// ---------------------------------------------------------------------------
// Search / retrieval
// ---------------------------------------------------------------------------

/**
 * Search the RAG index for documents matching the query.
 *
 * Uses simple case-insensitive keyword matching with scoring.
 * Returns up to `maxResults` documents, sorted by relevance.
 */
export async function searchRag(
  query: string,
  opts?: {
    maxResults?: number
    types?: RagDocument["type"][]
  },
): Promise<RagDocument[]> {
  await ensureLoaded()

  const max = opts?.maxResults ?? 100
  const types = opts?.types

  // Tokenize query into search terms
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)

  if (terms.length === 0) return []

  // Score each document
  const scored: { doc: RagDocument; score: number }[] = []

  for (const doc of documents) {
    if (types && !types.includes(doc.type)) continue

    const text = doc.text.toLowerCase()
    let score = 0

    for (const term of terms) {
      if (text.includes(term)) {
        score += 1
        // Bonus for exact word boundary matches
        if (new RegExp(`\\b${escapeRegex(term)}\\b`).test(text)) {
          score += 1
        }
      }
    }

    // Bonus for matching the full query as a substring
    if (text.includes(query.toLowerCase())) {
      score += terms.length
    }

    if (score > 0) {
      scored.push({ doc, score })
    }
  }

  // Sort by score descending, then by type priority (tracks first for playlists)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const typePriority: Record<string, number> = { track: 0, album: 1, artist: 2, playlist: 3, tag: 4 }
    return (typePriority[a.doc.type] ?? 5) - (typePriority[b.doc.type] ?? 5)
  })

  return scored.slice(0, max).map((s) => s.doc)
}

/**
 * Build a context string from the RAG database for an AI prompt.
 *
 * Retrieves relevant documents for the user's query and formats them
 * as a structured text block that the AI can use for recommendations.
 */
export async function buildRagContext(query: string): Promise<string> {
  await ensureLoaded()

  if (documents.length === 0) {
    return "No music library data indexed yet."
  }

  const parts: string[] = []

  // Library overview
  const artistCount = documents.filter((d) => d.type === "artist").length
  const albumCount = documents.filter((d) => d.type === "album").length
  const trackCount = documents.filter((d) => d.type === "track").length
  const genres = documents
    .filter((d) => d.type === "tag" && d.metadata.tag_type === "genre")
    .map((d) => d.metadata.tag as string)
  const moods = documents
    .filter((d) => d.type === "tag" && d.metadata.tag_type === "mood")
    .map((d) => d.metadata.tag as string)

  parts.push(
    `Library overview: ${artistCount} artists, ${albumCount} albums, ${trackCount} tracks.`,
  )
  if (genres.length) parts.push(`Genres: ${genres.join(", ")}`)
  if (moods.length) parts.push(`Moods: ${moods.join(", ")}`)

  // Search for relevant tracks
  const relevantTracks = await searchRag(query, { maxResults: 80, types: ["track"] })
  if (relevantTracks.length > 0) {
    parts.push("\nRelevant tracks:")
    for (const doc of relevantTracks) {
      const m = doc.metadata
      parts.push(
        `  - [${m.rating_key}] "${m.title}" by ${m.artist} (album: ${m.album}, year: ${m.year}${m.play_count ? `, plays: ${m.play_count}` : ""})`,
      )
    }
  }

  // Search for relevant albums
  const relevantAlbums = await searchRag(query, { maxResults: 20, types: ["album"] })
  if (relevantAlbums.length > 0) {
    parts.push("\nRelevant albums:")
    for (const doc of relevantAlbums) {
      const m = doc.metadata
      const tags = [
        ...(m.genres as string[] ?? []),
        ...(m.moods as string[] ?? []),
      ]
      parts.push(
        `  - "${m.title}" by ${m.artist} (${m.year}, ${m.track_count} tracks${tags.length ? `, tags: ${tags.join(", ")}` : ""})`,
      )
    }
  }

  // Search for relevant artists
  const relevantArtists = await searchRag(query, { maxResults: 10, types: ["artist"] })
  if (relevantArtists.length > 0) {
    parts.push("\nRelevant artists:")
    for (const doc of relevantArtists) {
      const m = doc.metadata
      parts.push(`  - [${m.rating_key}] ${m.title}`)
    }
  }

  // If keyword search didn't find much, also include a broad sample of tracks
  if (relevantTracks.length < 20) {
    // Provide a random sample of library tracks for broader coverage
    const allTracks = documents.filter((d) => d.type === "track")
    const sampleSize = Math.min(100, allTracks.length)
    const sample = shuffleArray(allTracks).slice(0, sampleSize)
    parts.push(`\nSample of ${sampleSize} tracks from the library:`)
    for (const doc of sample) {
      const m = doc.metadata
      parts.push(
        `  - [${m.rating_key}] "${m.title}" by ${m.artist} (album: ${m.album}, year: ${m.year})`,
      )
    }
  }

  return parts.join("\n")
}

/**
 * Perform a Plex search and return results as additional RAG context.
 * Useful when the local index doesn't have enough matches.
 */
export async function searchPlexForContext(query: string): Promise<string> {
  const { musicSectionId } = useConnectionStore.getState()
  if (!musicSectionId) return ""

  try {
    const results = await searchLibrary(musicSectionId, query)
    if (results.length === 0) return ""

    const lines: string[] = [`\nPlex search results for "${query}":`]
    for (const item of results) {
      if (item.type === "track") {
        const t = item as Track & { type: "track" }
        lines.push(
          `  - [${t.rating_key}] "${t.title}" by ${t.grandparent_title} (album: ${t.parent_title})`,
        )
      } else if (item.type === "album") {
        const a = item as Album & { type: "album" }
        lines.push(`  - Album: "${a.title}" by ${a.parent_title} (${a.year})`)
      } else if (item.type === "artist") {
        const ar = item as Artist & { type: "artist" }
        lines.push(`  - Artist: ${ar.title}`)
      }
    }
    return lines.join("\n")
  } catch {
    return ""
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// ---------------------------------------------------------------------------
// Auto-load on import
// ---------------------------------------------------------------------------

void ensureLoaded()
