import type { RequestHandler } from './$types';
import { getCached, writeCached, evictIfOverSize, getTtlSeconds } from '$lib/server/imageCache';
import { resolveUrl, hasResolver, parseProtocolUrl } from '$lib/server/imageResolvers';

export const GET: RequestHandler = async ({ url }) => {
	const src = url.searchParams.get('src');
	if (!src) {
		return new Response('Missing src param', { status: 400 });
	}

	// Validate: must be a protocol URL or plain http/https
	const parsed = parseProtocolUrl(src);
	if (parsed && !hasResolver(parsed.protocol)) {
		return new Response(`Unknown image protocol: ${parsed.protocol}`, { status: 404 });
	}

	// Check disk cache
	const cached = getCached(src);
	if (cached) {
		return new Response(new Uint8Array(cached.data), {
			headers: {
				'Content-Type': cached.contentType,
				'Cache-Control': 'public, max-age=86400',
				'X-Cache': 'HIT'
			}
		});
	}

	// Resolve to fetchable URL
	let resolved: { url: string; headers?: Record<string, string> };
	try {
		resolved = resolveUrl(src);
	} catch (e) {
		return new Response(e instanceof Error ? e.message : 'Resolution failed', { status: 404 });
	}

	// Fetch from origin
	let response: Response;
	try {
		response = await fetch(resolved.url, {
			headers: resolved.headers ?? {}
		});
	} catch {
		return new Response('Failed to fetch image from origin', { status: 502 });
	}

	if (!response.ok) {
		return new Response('Origin returned error', { status: 502 });
	}

	const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
	const data = Buffer.from(await response.arrayBuffer());

	// Write to cache (fire-and-forget eviction)
	writeCached(src, data, contentType, getTtlSeconds());
	evictIfOverSize();

	return new Response(data, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=86400',
			'X-Cache': 'MISS'
		}
	});
};
