import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RadioCountry } from '$lib/radio/types';
import { apiCache } from '$lib/server/apiCache';

const API_BASE = 'https://de1.api.radio-browser.info';
const CACHE_KEY = 'radio:countries';
const TTL = 24 * 60 * 60 * 1000; // 24 hours

interface RawCountry {
	name: string;
	iso_3166_1: string;
	stationcount: number;
}

export const GET: RequestHandler = async () => {
	const cached = apiCache.get<RadioCountry[]>(CACHE_KEY);
	if (cached) return json(cached);

	const res = await fetch(
		`${API_BASE}/json/countries?order=stationcount&reverse=true`
	);
	if (!res.ok) {
		return json([], { status: res.status });
	}

	const raw: RawCountry[] = await res.json();
	const countries: RadioCountry[] = raw
		.filter((c) => c.name && c.stationcount > 0)
		.map((c) => ({
			name: c.name,
			code: c.iso_3166_1,
			station_count: c.stationcount
		}));

	apiCache.set(CACHE_KEY, countries, TTL);
	return json(countries);
};
