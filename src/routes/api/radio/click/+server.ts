import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const API_BASE = 'https://de1.api.radio-browser.info';

export const POST: RequestHandler = async ({ request }) => {
	const { uuid } = await request.json();
	if (!uuid) {
		return json({ ok: false }, { status: 400 });
	}

	// Fire and forget
	fetch(`${API_BASE}/json/url/${uuid}`).catch(() => {});

	return json({ ok: true });
};
