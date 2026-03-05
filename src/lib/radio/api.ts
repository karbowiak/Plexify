import type { RadioStation, RadioCountry, RadioTag } from './types';

export interface SearchParams {
	name?: string;
	tag?: string;
	country?: string;
	limit?: number;
	offset?: number;
	order?: string;
}

export async function searchStations(params: SearchParams): Promise<RadioStation[]> {
	const q = new URLSearchParams();
	if (params.name) q.set('name', params.name);
	if (params.tag) q.set('tag', params.tag);
	if (params.country) q.set('country', params.country);
	if (params.limit) q.set('limit', String(params.limit));
	if (params.offset) q.set('offset', String(params.offset));
	if (params.order) q.set('order', params.order);
	const res = await fetch(`/api/radio/search?${q}`);
	if (!res.ok) throw new Error(`Search failed: ${res.status}`);
	return res.json();
}

export async function topStations(
	category: string = 'topvote',
	count: number = 15
): Promise<RadioStation[]> {
	const res = await fetch(`/api/radio/top?category=${category}&count=${count}`);
	if (!res.ok) throw new Error(`Top stations failed: ${res.status}`);
	return res.json();
}

export async function getCountries(): Promise<RadioCountry[]> {
	const res = await fetch('/api/radio/countries');
	if (!res.ok) throw new Error(`Countries failed: ${res.status}`);
	return res.json();
}

export async function getTags(limit: number = 100): Promise<RadioTag[]> {
	const res = await fetch(`/api/radio/tags?limit=${limit}`);
	if (!res.ok) throw new Error(`Tags failed: ${res.status}`);
	return res.json();
}

export async function registerClick(uuid: string): Promise<void> {
	fetch('/api/radio/click', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ uuid })
	}).catch(() => {});
}
