import type { RequestHandler } from './$types';
import { get } from '$lib/cache/registry';

export const GET: RequestHandler = async ({ params }) => {
	const provider = get(params.id);
	if (!provider) {
		return new Response(JSON.stringify({ error: `Unknown cache provider: ${params.id}` }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const stats = provider.getStats();
	const config = provider.getConfig();
	const envLocks = provider.getEnvLocks();

	return new Response(JSON.stringify({ ...stats, ...config, envLocks }), {
		headers: { 'Content-Type': 'application/json' }
	});
};

export const DELETE: RequestHandler = async ({ params }) => {
	const provider = get(params.id);
	if (!provider) {
		return new Response(JSON.stringify({ error: `Unknown cache provider: ${params.id}` }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	provider.clear();
	return new Response(JSON.stringify({ cleared: true }), {
		headers: { 'Content-Type': 'application/json' }
	});
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const provider = get(params.id);
	if (!provider) {
		return new Response(JSON.stringify({ error: `Unknown cache provider: ${params.id}` }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const body = await request.json();
	provider.configure(body);

	const stats = provider.getStats();
	const config = provider.getConfig();
	const envLocks = provider.getEnvLocks();

	return new Response(JSON.stringify({ ...stats, ...config, envLocks }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
