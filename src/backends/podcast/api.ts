/**
 * Podcast API — TypeScript wrappers around Tauri invoke() calls.
 *
 * Uses iTunes Search API for discovery and RSS feed parsing for episodes.
 * No API key or authentication required.
 */

import { invoke } from "@tauri-apps/api/core"

// ---------------------------------------------------------------------------
// Types (mirror Rust structs)
// ---------------------------------------------------------------------------

export interface PodcastSearchResult {
  id: number
  name: string
  artist_name: string
  artwork_url: string
  feed_url: string
  genre: string
  track_count: number
  itunes_url: string
}

export interface PodcastDetail {
  feed_url: string
  title: string
  author: string
  description: string
  artwork_url: string
  link: string
  language: string
  categories: string[]
  episodes: PodcastEpisode[]
}

export interface PodcastEpisode {
  guid: string
  title: string
  description: string
  pub_date: string
  duration_secs: number
  audio_url: string
  audio_type: string
  audio_size: number
  episode_number: number | null
  season_number: number | null
  artwork_url: string | null
}

export interface PodcastCategory {
  id: number
  name: string
}

export interface PodcastTopChart {
  itunes_id: number
  name: string
  artist_name: string
  artwork_url: string
  feed_url: string
  genre: string
  itunes_url: string
}

// ---------------------------------------------------------------------------
// Invoke wrappers
// ---------------------------------------------------------------------------

export const podcastSearch = (query: string, limit?: number): Promise<PodcastSearchResult[]> =>
  invoke("podcast_search", { query, limit })

export const podcastGetTop = (category?: string, limit?: number): Promise<PodcastTopChart[]> =>
  invoke("podcast_get_top", { category, limit })

export const podcastGetFeed = (feedUrl: string): Promise<PodcastDetail> =>
  invoke("podcast_get_feed", { feedUrl })

export const podcastLookup = (itunesId: number): Promise<PodcastSearchResult | null> =>
  invoke("podcast_lookup", { itunesId })

export const podcastGetCategories = (): Promise<PodcastCategory[]> =>
  invoke("podcast_get_categories")
