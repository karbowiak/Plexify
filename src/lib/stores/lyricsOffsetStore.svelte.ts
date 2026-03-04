/**
 * Per-track lyrics timing offset stored in IndexedDB.
 * Key: track ID (string), Value: offset in milliseconds.
 */

const DB_NAME = 'plex-lyrics';
const DB_VERSION = 1;
const STORE_NAME = 'offsets';

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
	if (db) return Promise.resolve(db);
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(STORE_NAME);
		};
		req.onsuccess = () => {
			db = req.result;
			resolve(db);
		};
		req.onerror = () => reject(req.error);
	});
}

export async function getLyricsOffset(trackId: string): Promise<number> {
	const store = (await openDB()).transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
	return new Promise((resolve) => {
		const req = store.get(trackId);
		req.onsuccess = () => resolve((req.result as number) ?? 0);
		req.onerror = () => resolve(0);
	});
}

export async function setLyricsOffset(trackId: string, offsetMs: number): Promise<void> {
	const store = (await openDB()).transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
	return new Promise((resolve, reject) => {
		const req = offsetMs === 0 ? store.delete(trackId) : store.put(offsetMs, trackId);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

// --- Reactive wrapper for use in components ---

let currentTrackId = $state<string | null>(null);
let currentOffset = $state(0);

export function getLyricsState() {
	return { trackId: currentTrackId, offset: currentOffset };
}

export async function loadTrackOffset(trackId: string) {
	currentTrackId = trackId;
	currentOffset = await getLyricsOffset(trackId);
}

export async function updateOffset(offsetMs: number) {
	currentOffset = offsetMs;
	if (currentTrackId) {
		await setLyricsOffset(currentTrackId, offsetMs);
	}
}

export function clearTrack() {
	currentTrackId = null;
	currentOffset = 0;
}
