import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { XMLParser } from 'fast-xml-parser';
import type { PodcastDetail, PodcastEpisode } from '$lib/podcast/types';
import { apiCache } from '$lib/server/apiCache';

const TTL = 30 * 60 * 1000; // 30 minutes

function stripHtml(html: string): string {
	if (!html) return '';
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.trim();
}

function parseDuration(raw: string | number | undefined): number {
	if (!raw) return 0;
	if (typeof raw === 'number') return raw;
	const str = raw.trim();
	// Pure seconds
	if (/^\d+$/.test(str)) return parseInt(str, 10);
	// HH:MM:SS or MM:SS
	const parts = str.split(':').map(Number);
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return 0;
}

function attr(obj: unknown, key: string): string {
	if (!obj || typeof obj !== 'object') return '';
	const rec = obj as Record<string, unknown>;
	// fast-xml-parser stores attributes with @ prefix
	return String(rec[`@_${key}`] ?? rec[key] ?? '');
}

export const GET: RequestHandler = async ({ url }) => {
	const feedUrl = url.searchParams.get('url');
	if (!feedUrl) return json({ error: 'Missing url param' }, { status: 400 });

	const cacheKey = `podcast:feed:${feedUrl}`;
	const cached = apiCache.get<PodcastDetail>(cacheKey);
	if (cached) return json(cached);

	try {
		const res = await fetch(feedUrl, {
			headers: { 'User-Agent': 'PlexMusicClient/1.0' },
			signal: AbortSignal.timeout(15000)
		});
		if (!res.ok) return json({ error: 'Feed fetch failed' }, { status: res.status });

		const xml = await res.text();
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: '@_',
			isArray: (name) => name === 'item' || name === 'itunes:category'
		});
		const parsed = parser.parse(xml);
		const channel = parsed?.rss?.channel;
		if (!channel) return json({ error: 'Invalid RSS feed' }, { status: 422 });

		// Channel image
		const itunesImage = channel['itunes:image'];
		const artworkUrl =
			(typeof itunesImage === 'object' ? attr(itunesImage, 'href') : '') ||
			channel.image?.url ||
			'';

		// Categories
		const rawCats = channel['itunes:category'];
		const categories: string[] = [];
		if (Array.isArray(rawCats)) {
			for (const cat of rawCats) {
				const text = typeof cat === 'object' ? attr(cat, 'text') : String(cat);
				if (text) categories.push(text);
			}
		} else if (rawCats) {
			const text = typeof rawCats === 'object' ? attr(rawCats, 'text') : String(rawCats);
			if (text) categories.push(text);
		}

		// Episodes
		const items: unknown[] = channel.item ?? [];
		const episodes: PodcastEpisode[] = items.map((item: unknown) => {
			const it = item as Record<string, unknown>;
			const enclosure = it.enclosure as Record<string, unknown> | undefined;
			const epImage = it['itunes:image'] as Record<string, unknown> | undefined;

			return {
				guid: String(
					typeof it.guid === 'object' && it.guid !== null
						? (it.guid as Record<string, unknown>)['#text'] ?? ''
						: it.guid ?? ''
				),
				title: String(it.title ?? ''),
				description: stripHtml(String(it.description ?? it['itunes:summary'] ?? '')),
				pub_date: String(it.pubDate ?? ''),
				duration_secs: parseDuration(
					it['itunes:duration'] as string | number | undefined
				),
				audio_url: enclosure ? attr(enclosure, 'url') : '',
				audio_type: enclosure ? attr(enclosure, 'type') : 'audio/mpeg',
				audio_size: enclosure ? parseInt(attr(enclosure, 'length') || '0', 10) : 0,
				episode_number: it['itunes:episode']
					? parseInt(String(it['itunes:episode']), 10)
					: null,
				season_number: it['itunes:season']
					? parseInt(String(it['itunes:season']), 10)
					: null,
				artwork_url: epImage ? attr(epImage, 'href') : null
			};
		});

		const detail: PodcastDetail = {
			feed_url: feedUrl,
			title: String(channel.title ?? ''),
			author: String(channel['itunes:author'] ?? channel.author ?? ''),
			description: stripHtml(String(channel.description ?? '')),
			artwork_url: artworkUrl,
			link: String(channel.link ?? ''),
			language: String(channel.language ?? ''),
			categories,
			episodes: episodes.filter((ep) => ep.audio_url)
		};

		apiCache.set(cacheKey, detail, TTL);
		return json(detail);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: msg }, { status: 500 });
	}
};
