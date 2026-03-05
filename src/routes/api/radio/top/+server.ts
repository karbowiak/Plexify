import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RadioStation } from '$lib/radio/types';
import { apiCache } from '$lib/server/apiCache';

const API_BASE = 'https://de1.api.radio-browser.info';
const TTL = 60 * 60 * 1000; // 1 hour

interface RawStation {
	stationuuid: string;
	name: string;
	url_resolved: string;
	homepage: string;
	favicon: string;
	tags: string;
	country: string;
	countrycode: string;
	language: string;
	codec: string;
	bitrate: number;
	hls: number;
	votes: number;
	clickcount: number;
	clicktrend: number;
}

function transform(raw: RawStation): RadioStation {
	return {
		uuid: raw.stationuuid,
		name: raw.name,
		stream_url: raw.url_resolved,
		homepage: raw.homepage,
		favicon: raw.favicon,
		tags: raw.tags
			? raw.tags
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean)
			: [],
		country: raw.country,
		country_code: raw.countrycode,
		language: raw.language,
		codec: raw.codec,
		bitrate: raw.bitrate,
		is_hls: raw.hls === 1,
		votes: raw.votes,
		click_count: raw.clickcount,
		click_trend: raw.clicktrend
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const category = url.searchParams.get('category') ?? 'topvote';
	const count = url.searchParams.get('count') ?? '15';
	const cacheKey = `radio:top:${category}:${count}`;

	const cached = apiCache.get<RadioStation[]>(cacheKey);
	if (cached) return json(cached);

	const res = await fetch(
		`${API_BASE}/json/stations/${category}/${count}?hidebroken=true`
	);
	if (!res.ok) {
		return json([], { status: res.status });
	}

	const raw: RawStation[] = await res.json();
	const result = raw.map(transform);
	apiCache.set(cacheKey, result, TTL);
	return json(result);
};
