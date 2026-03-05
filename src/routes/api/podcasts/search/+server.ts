import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { piHeaders, PI_BASE } from '$lib/podcast/piAuth';
import type { Podcast } from '$lib/podcast/types';
import { apiCache } from '$lib/server/apiCache';

const TTL = 15 * 60 * 1000; // 15 minutes

interface RawFeed {
	id: number;
	title: string;
	author: string;
	description: string;
	artwork: string;
	url: string;
	categories: Record<string, string>;
	language: string;
	episodeCount: number;
}

function transform(raw: RawFeed): Podcast {
	return {
		id: raw.id,
		title: raw.title || '',
		author: raw.author || '',
		description: raw.description || '',
		artwork_url: raw.artwork || '',
		feed_url: raw.url || '',
		categories: raw.categories || {},
		language: raw.language || '',
		episode_count: raw.episodeCount || 0
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const max = url.searchParams.get('max') ?? '20';

	if (!q.trim()) return json([]);

	const cacheKey = `podcast:search:${q}:${max}`;
	const cached = apiCache.get<Podcast[]>(cacheKey);
	if (cached) return json(cached);

	const params = new URLSearchParams({ q, max });
	const res = await fetch(`${PI_BASE}/search/byterm?${params}`, { headers: piHeaders() });
	if (!res.ok) return json([], { status: res.status });

	const data = await res.json();
	const result = (data.feeds ?? []).map(transform);
	apiCache.set(cacheKey, result, TTL);
	return json(result);
};
