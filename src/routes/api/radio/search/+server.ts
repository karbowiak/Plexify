import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RadioStation } from '$lib/radio/types';
import { apiCache } from '$lib/server/apiCache';

const API_BASE = 'https://de1.api.radio-browser.info';
const TTL = 15 * 60 * 1000; // 15 minutes

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
	const name = url.searchParams.get('name') ?? '';
	const tag = url.searchParams.get('tag') ?? '';
	const country = url.searchParams.get('country') ?? '';
	const limit = url.searchParams.get('limit') ?? '30';
	const offset = url.searchParams.get('offset') ?? '0';
	const order = url.searchParams.get('order') ?? 'votes';
	const cacheKey = `radio:search:${name}:${tag}:${country}:${limit}:${offset}:${order}`;

	const cached = apiCache.get<RadioStation[]>(cacheKey);
	if (cached) return json(cached);

	const params = new URLSearchParams({
		name,
		tag,
		country,
		limit,
		offset,
		order,
		reverse: 'true',
		hidebroken: 'true'
	});

	const res = await fetch(`${API_BASE}/json/stations/search?${params}`);
	if (!res.ok) {
		return json([], { status: res.status });
	}

	const raw: RawStation[] = await res.json();
	const result = raw.map(transform);
	apiCache.set(cacheKey, result, TTL);
	return json(result);
};
