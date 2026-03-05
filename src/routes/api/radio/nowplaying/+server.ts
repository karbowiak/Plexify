import type { RequestHandler } from './$types';
import { produce } from 'sveltekit-sse';
import { subscribe, getMetadata } from '$lib/radio/icyMetadataStore';

export const POST: RequestHandler = async ({ url }) => {
	const streamUrl = url.searchParams.get('url');
	if (!streamUrl) {
		return new Response('Missing url parameter', { status: 400 });
	}

	return produce(function start({ emit }) {
		// Send current metadata immediately
		const current = getMetadata(streamUrl);
		if (current) emit('metadata', JSON.stringify(current));

		// Subscribe to future changes
		const unsub = subscribe(streamUrl, (meta) => {
			const { error } = emit('metadata', JSON.stringify(meta));
			if (error) unsub();
		});

		return () => unsub();
	});
};
