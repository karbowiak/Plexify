import { PI_KEY, PI_SECRET } from '$env/static/private';
import { createHash } from 'crypto';

export function piHeaders(): Record<string, string> {
	const epoch = Math.floor(Date.now() / 1000).toString();
	const hash = createHash('sha1').update(PI_KEY + PI_SECRET + epoch).digest('hex');
	return {
		'X-Auth-Key': PI_KEY,
		'X-Auth-Date': epoch,
		Authorization: hash,
		'User-Agent': 'PlexMusicClient/1.0'
	};
}

export const PI_BASE = 'https://api.podcastindex.org/api/1.0';
