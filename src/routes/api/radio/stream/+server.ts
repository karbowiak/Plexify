import type { RequestHandler } from './$types';
import { createIcyParser } from '$lib/radio/icyParser';
import { setMetadata } from '$lib/radio/icyMetadataStore';

export const GET: RequestHandler = async ({ url }) => {
	const streamUrl = url.searchParams.get('url');
	if (!streamUrl) {
		return new Response('Missing url param', { status: 400 });
	}

	let parsed: URL;
	try {
		parsed = new URL(streamUrl);
	} catch {
		return new Response('Invalid URL', { status: 400 });
	}

	if (!['http:', 'https:'].includes(parsed.protocol)) {
		return new Response('Invalid protocol', { status: 400 });
	}

	const upstream = await fetch(streamUrl, {
		headers: {
			'Icy-MetaData': '1'
		}
	});
	if (!upstream.ok || !upstream.body) {
		return new Response('Upstream error', { status: 502 });
	}

	const metaIntHeader = upstream.headers.get('icy-metaint');
	const contentType = upstream.headers.get('Content-Type') || 'audio/mpeg';

	if (metaIntHeader) {
		const metaInt = parseInt(metaIntHeader, 10);
		if (metaInt > 0) {
			const parser = createIcyParser(metaInt, (meta) => {
				setMetadata(streamUrl, meta.streamTitle);
			});
			const cleanStream = upstream.body.pipeThrough(parser);
			return new Response(cleanStream, {
				headers: { 'Content-Type': contentType }
			});
		}
	}

	// No ICY support — passthrough
	return new Response(upstream.body, {
		headers: { 'Content-Type': contentType }
	});
};
