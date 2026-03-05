import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DEEZER_BASE = 'https://api.deezer.com';

export const GET: RequestHandler = async ({ params, url }) => {
	const path = params.path;
	const query = url.search; // includes leading '?'
	const target = `${DEEZER_BASE}/${path}${query}`;

	const res = await fetch(target);
	if (!res.ok) {
		return json({ error: `Deezer API error: ${res.status}` }, { status: res.status });
	}

	const data = await res.json();
	return json(data);
};
