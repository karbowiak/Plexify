import type { Podcast, PodcastCategory, PodcastDetail } from './types';

export async function searchPodcasts(query: string, max = 20): Promise<Podcast[]> {
	const q = new URLSearchParams({ q: query, max: String(max) });
	const res = await fetch(`/api/podcasts/search?${q}`);
	if (!res.ok) throw new Error(`Podcast search failed: ${res.status}`);
	return res.json();
}

export async function trendingPodcasts(max = 15, category?: string): Promise<Podcast[]> {
	const q = new URLSearchParams({ max: String(max) });
	if (category) q.set('cat', category);
	const res = await fetch(`/api/podcasts/trending?${q}`);
	if (!res.ok) throw new Error(`Trending podcasts failed: ${res.status}`);
	return res.json();
}

export async function getCategories(): Promise<PodcastCategory[]> {
	const res = await fetch('/api/podcasts/categories');
	if (!res.ok) throw new Error(`Categories failed: ${res.status}`);
	return res.json();
}

export async function getPodcastFeed(feedUrl: string): Promise<PodcastDetail> {
	const res = await fetch(`/api/podcasts/feed?url=${encodeURIComponent(feedUrl)}`);
	if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
	return res.json();
}
