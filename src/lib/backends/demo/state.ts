const STORAGE_KEY = 'demo-backend-state';

interface DemoPlaylist {
	id: string;
	title: string;
	description: string;
	trackIds: string[];
	createdAt: string;
}

interface PersistedState {
	playlists: Record<string, DemoPlaylist>;
	ratings: Record<string, number>;
	playCounts: Record<string, number>;
	nextPlaylistId: number;
}

function loadState(): PersistedState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as PersistedState;
	} catch {
		/* ignore */
	}
	return { playlists: {}, ratings: {}, playCounts: {}, nextPlaylistId: 1 };
}

let state = loadState();

function save() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Playlists
export function getPlaylists(): DemoPlaylist[] {
	return Object.values(state.playlists);
}

export function getPlaylist(id: string): DemoPlaylist | undefined {
	return state.playlists[id];
}

export function createPlaylist(
	title: string,
	trackIds: string[] = []
): DemoPlaylist {
	const id = `demo-pl-${state.nextPlaylistId++}`;
	const pl: DemoPlaylist = {
		id,
		title,
		description: '',
		trackIds,
		createdAt: new Date().toISOString()
	};
	state.playlists[id] = pl;
	save();
	return pl;
}

export function addToPlaylist(playlistId: string, trackIds: string[]) {
	const pl = state.playlists[playlistId];
	if (!pl) return;
	pl.trackIds.push(...trackIds);
	save();
}

export function deletePlaylist(playlistId: string) {
	delete state.playlists[playlistId];
	save();
}

// Ratings
export function getRating(itemId: string): number | null {
	return state.ratings[itemId] ?? null;
}

export function setRating(itemId: string, rating: number | null) {
	if (rating === null || rating === 0) {
		delete state.ratings[itemId];
	} else {
		state.ratings[itemId] = rating;
	}
	save();
}

// Play counts
export function getPlayCount(itemId: string): number {
	return state.playCounts[itemId] ?? 0;
}

export function incrementPlayCount(itemId: string) {
	state.playCounts[itemId] = (state.playCounts[itemId] ?? 0) + 1;
	save();
}
