export type AlbumType = 'album' | 'single' | 'ep' | 'compilation' | 'live' | 'soundtrack' | 'demo' | 'unknown';

export interface Album {
	// Identity
	id: string;
	backendId: string;

	// Core metadata
	title: string;
	artistName: string;
	artistId: string;
	year: number | null;
	albumType: AlbumType;

	// Counts
	trackCount: number;

	// Artwork (pre-resolved URLs from backend)
	thumb: string | null;
	artistThumb: string | null;

	// Descriptive
	summary: string | null;
	studio: string | null; // record label
	releaseDate: string | null; // ISO 8601 (originallyAvailableAt in Plex)

	// Tags — flat string arrays, backends normalize from their native format
	genres: string[];
	styles: string[];
	moods: string[];
	labels: string[];

	// User data
	userRating: number | null; // 0-10 scale
	addedAt: string | null; // ISO 8601
	lastPlayedAt: string | null; // ISO 8601

	// Reviews (some backends like Plex include critic reviews)
	reviews: AlbumReview[];

	// Extension point for backend-specific data
	extra: Record<string, unknown>;
}

export interface AlbumReview {
	source: string; // e.g. "AllMusic", "Rolling Stone"
	text: string;
	link: string | null;
	image: string | null;
}
