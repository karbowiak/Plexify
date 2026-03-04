export interface Artist {
	// Identity
	id: string;
	backendId: string;

	// Core metadata
	title: string;
	sortTitle: string | null;

	// Artwork (pre-resolved URLs from backend)
	thumb: string | null; // artist portrait/photo
	art: string | null; // wide banner/background image

	// Descriptive
	summary: string | null;

	// Tags
	genres: string[];
	styles: string[];
	moods: string[];

	// User data
	userRating: number | null; // 0-10 scale
	addedAt: string | null; // ISO 8601
	lastPlayedAt: string | null; // ISO 8601

	// Extension point for backend-specific data
	extra: Record<string, unknown>;
}
