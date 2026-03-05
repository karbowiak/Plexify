import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { piHeaders, PI_BASE } from '$lib/podcast/piAuth';
import type { PodcastCategory } from '$lib/podcast/types';
import { apiCache } from '$lib/server/apiCache';

const CACHE_KEY = 'podcast:categories';
const TTL = 24 * 60 * 60 * 1000; // 24 hours

export const GET: RequestHandler = async () => {
	const cached = apiCache.get<PodcastCategory[]>(CACHE_KEY);
	if (cached) return json(cached, { headers: { 'Cache-Control': 'max-age=86400' } });

	const res = await fetch(`${PI_BASE}/categories/list`, { headers: piHeaders() });
	if (!res.ok) return json([], { status: res.status });

	const data = await res.json();
	const categories: PodcastCategory[] = (data.feeds ?? []).map(
		(f: { id: number; name: string }) => ({
			id: f.id,
			name: f.name
		})
	);

	apiCache.set(CACHE_KEY, categories, TTL);
	return json(categories, {
		headers: { 'Cache-Control': 'max-age=86400' }
	});
};
