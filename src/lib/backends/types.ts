import type { Track } from './models/track';
import type { QueueItem } from '$lib/stores/unifiedQueue.svelte';
import type { Album } from './models/album';
import type { Artist } from './models/artist';
import type { Playlist } from './models/playlist';
import type { RadioStation, RadioCountry, RadioTag } from './models/radioStation';
import type { Podcast, PodcastEpisode, PodcastDetail, PodcastCategory } from './models/podcast';

export const Capability = {
	Search: 'search',
	Playlists: 'playlists',
	EditPlaylists: 'edit_playlists',
	Ratings: 'ratings',
	InternetRadio: 'internet_radio',
	Radio: 'radio',
	SonicSimilarity: 'sonic_similarity',
	DJModes: 'dj_modes',
	PlayQueues: 'play_queues',
	Lyrics: 'lyrics',
	Waveforms: 'waveforms',
	Hubs: 'hubs',
	Mixes: 'mixes',
	Tags: 'tags',
	NowPlaying: 'now_playing',
	Scrobble: 'scrobble',
	Artists: 'artists',
	Albums: 'albums',
	Tracks: 'tracks',
	Podcasts: 'podcasts'
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export interface ConfigField {
	key: string;
	label: string;
	type: 'text' | 'password' | 'url' | 'toggle' | 'select';
	placeholder?: string;
	required?: boolean;
	options?: { label: string; value: string }[];
}

export interface BackendMetadata {
	name: string;
	description: string;
	icon: string;
	version: string;
	author: string;
	configFields: ConfigField[];
	idPrefix?: string; // prefix used in compound entity IDs, e.g. "dz"
}

export interface ResourceResolver {
	/** The compound protocol this resolver handles, e.g. "demo-image" */
	protocol: string;
	/** Given the part after "protocol://", return the real fetchable URL + optional headers */
	resolve(
		resourcePath: string,
		config: Record<string, unknown>
	): { url: string; headers?: Record<string, string> };
}

/** @deprecated Use ResourceResolver instead */
export type ImageResolver = ResourceResolver;

export interface Backend {
	readonly id: string;
	readonly metadata: BackendMetadata;
	readonly capabilities: Set<Capability>;
	readonly resolvers?: ResourceResolver[];

	// Media type filter — which item types this backend handles for now-playing/scrobble
	readonly nowPlayingMediaTypes?: Set<'track' | 'radio' | 'podcast'>;
	// Scope — 'own' = only items originating from this backend, 'all' = any source
	readonly nowPlayingScope?: 'own' | 'all';

	connect(config: Record<string, unknown>): Promise<void>;
	disconnect(): Promise<void>;
	isConnected(): boolean;
	supports(capability: Capability): boolean;

	// NowPlaying (Capability.NowPlaying)
	updateNowPlaying?(item: QueueItem): Promise<void>;

	// Scrobble (Capability.Scrobble)
	scrobble?(item: QueueItem, durationPlayedMs: number): Promise<void>;

	// Search (Capability.Search)
	search?(query: string): Promise<{ tracks: Track[]; albums: Album[]; artists: Artist[] }>;

	// Library (Capability.Tracks / Albums / Artists)
	getTrack?(id: string): Promise<Track>;
	getAlbum?(id: string): Promise<Album>;
	getAlbumTracks?(albumId: string): Promise<Track[]>;
	getArtist?(id: string): Promise<Artist>;
	getArtistAlbums?(artistId: string): Promise<Album[]>;
	getArtistTopTracks?(artistId: string, limit?: number): Promise<Track[]>;
	getArtistRelated?(artistId: string): Promise<Artist[]>;

	// Playback (Capability.Tracks)
	getStreamUrl?(trackId: string): Promise<string>;

	// Hubs (Capability.Hubs)
	getHubs?(): Promise<Hub[]>;

	// Playlists (Capability.Playlists)
	getPlaylists?(): Promise<Playlist[]>;
	getPlaylistTracks?(
		playlistId: string,
		offset?: number,
		limit?: number
	): Promise<{ items: Track[]; total: number }>;

	// Playlist editing (Capability.EditPlaylists)
	createPlaylist?(title: string, trackIds?: string[]): Promise<Playlist>;
	addToPlaylist?(playlistId: string, trackIds: string[]): Promise<void>;
	deletePlaylist?(playlistId: string): Promise<void>;

	// Ratings (Capability.Ratings)
	rate?(itemId: string, rating: number | null): Promise<void>;

	// Tags (Capability.Tags)
	getTags?(tagType: string): Promise<{ tag: string; count: number | null }[]>;
	getTagItems?(tag: string): Promise<{ artists: Artist[]; albums: Album[] }>;

	// Internet Radio (Capability.InternetRadio)
	searchRadioStations?(params: {
		name?: string;
		tag?: string;
		country?: string;
		limit?: number;
		offset?: number;
	}): Promise<RadioStation[]>;
	getTopRadioStations?(category: string, count: number): Promise<RadioStation[]>;
	getRadioCountries?(): Promise<RadioCountry[]>;
	getRadioTags?(limit: number): Promise<RadioTag[]>;
	getRadioStreamUrl?(streamUrl: string): Promise<string>;
	registerRadioClick?(uuid: string): Promise<void>;

	// Podcasts (Capability.Podcasts)
	searchPodcasts?(query: string, max?: number): Promise<Podcast[]>;
	getTrendingPodcasts?(max?: number, category?: string): Promise<Podcast[]>;
	getPodcastCategories?(): Promise<PodcastCategory[]>;
	getPodcastFeed?(feedUrl: string): Promise<PodcastDetail>;
	getPodcastEpisodeStreamUrl?(episode: PodcastEpisode): Promise<string>;
}

// ---------------------------------------------------------------------------
// Hub layout types
// ---------------------------------------------------------------------------
export type HubLayout = 'scroller' | 'list' | 'hero' | 'pills';

export interface Hub {
	title: string;
	layout: HubLayout;
	items: (Track | Album | Artist)[];
}

// ---------------------------------------------------------------------------
// Data models — re-exported from models/ for backward compatibility
// ---------------------------------------------------------------------------
export * from './models';
