export interface DzTrack {
	id: number;
	title: string;
	duration: number; // seconds
	track_position: number;
	disk_number: number;
	rank: number;
	preview: string; // 30s MP3 URL
	artist: DzArtistBrief;
	album: DzAlbumBrief;
}

export interface DzAlbum {
	id: number;
	title: string;
	cover_medium: string;
	cover_big: string;
	cover_xl: string;
	nb_tracks: number;
	duration: number; // seconds (total)
	fans: number;
	release_date: string; // "YYYY-MM-DD"
	record_type: string; // "album" | "single" | "ep" | "compile"
	label: string;
	genres?: { data: DzGenre[] };
	artist: DzArtistBrief;
	tracks?: { data: DzTrack[] };
}

export interface DzArtist {
	id: number;
	name: string;
	picture_medium: string;
	picture_big: string;
	picture_xl: string;
	nb_album: number;
	nb_fan: number;
}

export interface DzArtistBrief {
	id: number;
	name: string;
	picture_medium?: string;
	picture_big?: string;
	picture_xl?: string;
}

export interface DzAlbumBrief {
	id: number;
	title: string;
	cover_medium: string;
	cover_big?: string;
	cover_xl?: string;
}

export interface DzGenre {
	id: number;
	name: string;
	picture?: string;
}

export interface DzChart {
	tracks: { data: DzTrack[] };
	albums: { data: DzAlbum[] };
	artists: { data: DzArtist[] };
}

export interface DzSearchResult<T> {
	data: T[];
	total: number;
	next?: string;
}
