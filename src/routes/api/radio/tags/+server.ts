import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RadioTag } from '$lib/radio/types';
import { apiCache } from '$lib/server/apiCache';

const API_BASE = 'https://de1.api.radio-browser.info';
const TTL = 24 * 60 * 60 * 1000; // 24 hours

interface RawTag {
	name: string;
	stationcount: number;
}

export const GET: RequestHandler = async ({ url }) => {
	const limit = url.searchParams.get('limit') ?? '100';
	const cacheKey = `radio:tags:${limit}`;

	const cached = apiCache.get<RadioTag[]>(cacheKey);
	if (cached) return json(cached);

	const res = await fetch(
		`${API_BASE}/json/tags?order=stationcount&reverse=true&limit=${limit}`
	);
	if (!res.ok) {
		return json([], { status: res.status });
	}

	const raw: RawTag[] = await res.json();
	const tags: RadioTag[] = raw
		.filter((t) => t.name && t.stationcount > 0)
		.map((t) => ({
			name: t.name,
			station_count: t.stationcount
		}));

	apiCache.set(cacheKey, tags, TTL);
	return json(tags);
};
