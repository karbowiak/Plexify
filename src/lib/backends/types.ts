export const Capability = {
	Search: 'search',
	Playlists: 'playlists',
	EditPlaylists: 'edit_playlists',
	Ratings: 'ratings',
	Radio: 'radio',
	SonicSimilarity: 'sonic_similarity',
	DJModes: 'dj_modes',
	PlayQueues: 'play_queues',
	Lyrics: 'lyrics',
	Waveforms: 'waveforms',
	Hubs: 'hubs',
	Mixes: 'mixes',
	Tags: 'tags',
	Scrobble: 'scrobble',
	Artists: 'artists',
	Albums: 'albums',
	Tracks: 'tracks'
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
}

export interface Backend {
	readonly id: string;
	readonly metadata: BackendMetadata;
	readonly capabilities: Set<Capability>;
	connect(config: Record<string, unknown>): Promise<void>;
	disconnect(): Promise<void>;
	isConnected(): boolean;
	supports(capability: Capability): boolean;
}

// ---------------------------------------------------------------------------
// Data models — re-exported from models/ for backward compatibility
// ---------------------------------------------------------------------------
export * from './models';
