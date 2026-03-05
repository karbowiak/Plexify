/**
 * Server-side ICY metadata store.
 * Stores the latest now-playing info per stream URL.
 */

export interface IcyNowPlaying {
	streamTitle: string;
	artist: string | null;
	title: string | null;
	updatedAt: number;
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes

const store = new Map<string, IcyNowPlaying>();

/** Split "Artist - Title" on first ` - ` separator */
function splitStreamTitle(streamTitle: string): { artist: string | null; title: string | null } {
	const sep = streamTitle.indexOf(' - ');
	if (sep === -1) {
		return { artist: null, title: streamTitle };
	}
	return {
		artist: streamTitle.substring(0, sep),
		title: streamTitle.substring(sep + 3)
	};
}

/** Prune entries older than STALE_MS */
function pruneStale() {
	const now = Date.now();
	for (const [key, entry] of store) {
		if (now - entry.updatedAt > STALE_MS) {
			store.delete(key);
		}
	}
}

// ---------------------------------------------------------------------------
// Pub/sub for SSE push
// ---------------------------------------------------------------------------

type MetadataListener = (meta: IcyNowPlaying) => void;
const listeners = new Map<string, Set<MetadataListener>>();

export function subscribe(streamUrl: string, cb: MetadataListener): () => void {
	if (!listeners.has(streamUrl)) listeners.set(streamUrl, new Set());
	listeners.get(streamUrl)!.add(cb);
	// Send current value immediately
	const current = store.get(streamUrl);
	if (current) cb(current);
	// Return unsubscribe fn
	return () => {
		listeners.get(streamUrl)?.delete(cb);
		if (listeners.get(streamUrl)?.size === 0) listeners.delete(streamUrl);
	};
}

export function setMetadata(streamUrl: string, streamTitle: string): void {
	pruneStale();
	const { artist, title } = splitStreamTitle(streamTitle);
	const entry: IcyNowPlaying = {
		streamTitle,
		artist,
		title,
		updatedAt: Date.now()
	};
	store.set(streamUrl, entry);
	// Notify SSE subscribers
	for (const cb of listeners.get(streamUrl) ?? []) cb(entry);
}

export function getMetadata(streamUrl: string): IcyNowPlaying | null {
	return store.get(streamUrl) ?? null;
}

export function removeMetadata(streamUrl: string): void {
	store.delete(streamUrl);
}

export function clearAll(): void {
	store.clear();
}

export function getStoreInfo(): {
	count: number;
	estimatedBytes: number;
	oldestUpdatedAt: number | null;
	newestUpdatedAt: number | null;
} {
	let oldest: number | null = null;
	let newest: number | null = null;
	let estimatedBytes = 0;

	for (const entry of store.values()) {
		if (oldest === null || entry.updatedAt < oldest) oldest = entry.updatedAt;
		if (newest === null || entry.updatedAt > newest) newest = entry.updatedAt;
		// Rough estimate: stream title + artist + title strings
		estimatedBytes += (entry.streamTitle?.length ?? 0) * 2 + 100;
	}

	return { count: store.size, estimatedBytes, oldestUpdatedAt: oldest, newestUpdatedAt: newest };
}
