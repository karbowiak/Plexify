import type { RadioStation } from '$lib/radio/types';
import { source } from 'sveltekit-sse';

const STORAGE_KEY = 'radio-state';
const MAX_RECENT = 50;

interface RadioPersistedState {
	favorites: RadioStation[];
	recentStations: RadioStation[];
}

function load(): RadioPersistedState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				favorites: parsed.favorites ?? [],
				recentStations: parsed.recentStations ?? []
			};
		}
	} catch {
		// ignore corrupt data
	}
	return { favorites: [], recentStations: [] };
}

const initial = load();

let favorites = $state<RadioStation[]>(initial.favorites);
let recentStations = $state<RadioStation[]>(initial.recentStations);
let nowPlaying = $state<{ artist: string | null; title: string | null } | null>(null);
let sseConnection: ReturnType<typeof source> | null = null;

function save() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify({ favorites, recentStations }));
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

export function getFavorites(): RadioStation[] {
	return favorites;
}

export function getRecentStations(): RadioStation[] {
	return recentStations;
}

export function getNowPlaying(): { artist: string | null; title: string | null } | null {
	return nowPlaying;
}

// ---------------------------------------------------------------------------
// Favorites & recents
// ---------------------------------------------------------------------------

export function addToRecent(station: RadioStation) {
	recentStations = [station, ...recentStations.filter((s) => s.uuid !== station.uuid)].slice(
		0,
		MAX_RECENT
	);
	save();
}

export function toggleFavorite(station: RadioStation) {
	const idx = favorites.findIndex((s) => s.uuid === station.uuid);
	if (idx >= 0) {
		favorites = favorites.filter((s) => s.uuid !== station.uuid);
	} else {
		favorites = [station, ...favorites];
	}
	save();
}

export function isFavorite(uuid: string): boolean {
	return favorites.some((s) => s.uuid === uuid);
}

export function clearRecent() {
	recentStations = [];
	save();
}

// ---------------------------------------------------------------------------
// ICY metadata via SSE (called by playerStore callbacks)
// ---------------------------------------------------------------------------

export function startIcyStream(streamUrl: string) {
	stopIcyStream();
	sseConnection = source(`/api/radio/nowplaying?url=${encodeURIComponent(streamUrl)}`);
	const metaStore = sseConnection.select('metadata').json<{
		streamTitle: string;
		artist: string | null;
		title: string | null;
	}>((err) => {
		console.warn('ICY SSE parse error:', err);
		return { streamTitle: '', artist: null, title: null };
	});
	metaStore.subscribe((data) => {
		if (data?.streamTitle) {
			nowPlaying = { artist: data.artist, title: data.title };
		}
	});
}

export function stopIcyStream() {
	sseConnection?.close();
	sseConnection = null;
	nowPlaying = null;
}
