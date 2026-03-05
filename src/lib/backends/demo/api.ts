import type {
	DzTrack,
	DzAlbum,
	DzArtist,
	DzGenre,
	DzChart,
	DzSearchResult
} from './types';

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`/api/deezer/${path}`);
	if (!res.ok) throw new Error(`Deezer API error: ${res.status}`);
	return res.json();
}

// Search
export function searchAll(q: string, limit = 25): Promise<DzSearchResult<DzTrack>> {
	return get(`search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export function searchArtists(q: string, limit = 10): Promise<DzSearchResult<DzArtist>> {
	return get(`search/artist?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export function searchAlbums(q: string, limit = 10): Promise<DzSearchResult<DzAlbum>> {
	return get(`search/album?q=${encodeURIComponent(q)}&limit=${limit}`);
}

// Single-item fetch
export function getTrack(id: number): Promise<DzTrack> {
	return get(`track/${id}`);
}

export function getAlbum(id: number): Promise<DzAlbum> {
	return get(`album/${id}`);
}

export function getAlbumTracks(id: number): Promise<DzSearchResult<DzTrack>> {
	return get(`album/${id}/tracks?limit=200`);
}

export function getArtist(id: number): Promise<DzArtist> {
	return get(`artist/${id}`);
}

export function getArtistTop(id: number, limit = 10): Promise<DzSearchResult<DzTrack>> {
	return get(`artist/${id}/top?limit=${limit}`);
}

export function getArtistAlbums(id: number, limit = 50): Promise<DzSearchResult<DzAlbum>> {
	return get(`artist/${id}/albums?limit=${limit}`);
}

export function getArtistRelated(id: number, limit = 20): Promise<DzSearchResult<DzArtist>> {
	return get(`artist/${id}/related?limit=${limit}`);
}

// Charts & genres
export function getChart(): Promise<DzChart> {
	return get('chart');
}

export function getGenres(): Promise<{ data: DzGenre[] }> {
	return get('genre');
}

export function getGenreArtists(genreId: number, limit = 25): Promise<DzSearchResult<DzArtist>> {
	return get(`genre/${genreId}/artists?limit=${limit}`);
}
