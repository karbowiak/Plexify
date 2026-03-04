export interface Playlist {
	// Identity
	id: string;
	backendId: string;

	// Core metadata
	title: string;
	sortTitle: string | null;
	description: string | null;

	// Type flags
	smart: boolean;
	radio: boolean;

	// Counts & duration
	trackCount: number;
	duration: number | null; // total duration in ms

	// Artwork
	thumb: string | null; // user-uploaded custom art
	composite: string | null; // auto-generated mosaic from track art

	// Timestamps
	addedAt: string | null; // ISO 8601
	updatedAt: string | null; // ISO 8601

	// Extension point for backend-specific data
	extra: Record<string, unknown>;
}
