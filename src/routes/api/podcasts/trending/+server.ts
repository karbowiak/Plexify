import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { piHeaders, PI_BASE } from '$lib/podcast/piAuth';
import type { Podcast } from '$lib/podcast/types';
import { apiCache } from '$lib/server/apiCache';

const TTL = 60 * 60 * 1000; // 1 hour

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
	const max = url.searchParams.get('max') ?? '15';
	const cat = url.searchParams.get('cat');
	const cacheKey = `podcast:trending:${max}:${cat ?? ''}`;

	const cached = apiCache.get<Podcast[]>(cacheKey);
	if (cached) return json(cached);

	const params = new URLSearchParams({ max, lang: 'en' });
	if (cat) params.set('cat', cat);

	const res = await fetch(`${PI_BASE}/podcasts/trending?${params}`, { headers: piHeaders() });
	if (!res.ok) return json([], { status: res.status });

	const data = await res.json();
	const result = (data.feeds ?? []).map(transform);
	apiCache.set(cacheKey, result, TTL);
	return json(result);
};
