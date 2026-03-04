export interface AudioQuality {
	codec: string;
	bitrate: number | null;
	bitDepth: number | null;
	sampleRate: number | null;
	channels: number | null;
	gain: number | null;
	albumGain: number | null;
	peak: number | null;
	loudness: number | null;
}

export interface Track {
	// Identity
	id: string;
	backendId: string;

	// Core metadata
	title: string;
	artistName: string;
	artistId: string;
	albumName: string;
	albumId: string;
	trackNumber: number | null;
	discNumber: number | null;
	year: number | null;
	albumYear: number | null;

	// Duration (milliseconds)
	duration: number;

	// Artwork (pre-resolved URLs from backend)
	thumb: string | null;
	artistThumb: string | null;

	// User data
	playCount: number;
	skipCount: number | null;
	userRating: number | null;
	lastPlayedAt: string | null;
	addedAt: string | null;

	// Audio quality
	quality: AudioQuality | null;

	// Popularity
	popularity: number | null;

	// Lyrics
	hasLyrics: boolean;

	// Extension point for backend-specific data
	extra: Record<string, unknown>;
}
