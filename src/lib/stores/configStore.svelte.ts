const STORAGE_KEY = 'app-config';

export interface GeneralConfig {
	language: string;
	startPage: string;
	animationsEnabled: boolean;
}

export interface BackendInstanceConfig {
	enabled: boolean;
	config: Record<string, unknown>;
}

export type BackendsConfig = Record<string, BackendInstanceConfig>;

export interface MetadataConfig {
	preferredSource: string;
}

export interface VolumeConfig {
	level: number;
	muted: boolean;
	preMuteLevel: number;
}

export interface EQConfig {
	enabled: boolean;
	preset: string;
	bands: number[];
}

export type RepeatMode = 'off' | 'one' | 'all';

export interface PlaybackConfig {
	crossfadeEnabled: boolean;
	crossfadeDuration: number;
	gaplessPlayback: boolean;
	normalizeVolume: boolean;
	volume: VolumeConfig;
	eq: EQConfig;
	repeatMode: RepeatMode;
	shuffled: boolean;
}

export interface CustomColors {
	bgBase: string | null;
	bgSurface: string | null;
	bgElevated: string | null;
	bgHighlight: string | null;
	bgHover: string | null;
	textPrimary: string | null;
	textSecondary: string | null;
	textMuted: string | null;
	overlayBase: string | null;
	scrollbarBase: string | null;
	rangeTrackBase: string | null;
	accentSecondary: string | null;
}

export interface AppearanceConfig {
	theme: 'dark' | 'light' | 'system';
	font: string;
	accentColor: string;
	cardSize: number;
	highlightIntensity: number;
	compactMode: boolean;
	customColors: CustomColors | null;
}

export interface AppConfig {
	general: GeneralConfig;
	backends: BackendsConfig;
	metadata: MetadataConfig;
	playback: PlaybackConfig;
	appearance: AppearanceConfig;
}

const defaults: AppConfig = {
	general: {
		language: 'en',
		startPage: '/',
		animationsEnabled: true
	},
	backends: {
		demo: { enabled: true, config: {} }
	},
	metadata: {
		preferredSource: 'plex'
	},
	playback: {
		crossfadeEnabled: false,
		crossfadeDuration: 5,
		gaplessPlayback: true,
		normalizeVolume: false,
		volume: { level: 70, muted: false, preMuteLevel: 70 },
		eq: { enabled: true, preset: 'flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
		repeatMode: 'off',
		shuffled: false
	},
	appearance: {
		theme: 'dark',
		font: 'System',
		accentColor: '#1db954',
		cardSize: 100,
		highlightIntensity: 100,
		compactMode: false,
		customColors: null
	}
};

function mergeBackends(parsed: Record<string, any> | undefined): BackendsConfig {
	const result: BackendsConfig = structuredClone(defaults.backends);
	if (!parsed) return result;
	for (const [id, val] of Object.entries(parsed)) {
		const base = result[id] ?? { enabled: false, config: {} };
		result[id] = {
			enabled: val?.enabled ?? base.enabled,
			config: { ...base.config, ...(val?.config ?? {}) }
		};
	}
	return result;
}

function load(): AppConfig {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				general: { ...defaults.general, ...parsed.general },
				backends: mergeBackends(parsed.backends),
				metadata: { ...defaults.metadata, ...parsed.metadata },
				playback: {
					...defaults.playback,
					...parsed.playback,
					volume: { ...defaults.playback.volume, ...parsed.playback?.volume },
					eq: { ...defaults.playback.eq, ...parsed.playback?.eq }
				},
				appearance: { ...defaults.appearance, ...parsed.appearance }
			};
		}
	} catch {
		// ignore corrupt data
	}
	return structuredClone(defaults);
}

const initial = load();

let general = $state<GeneralConfig>(initial.general);
let backends = $state<BackendsConfig>(initial.backends);
let metadata = $state<MetadataConfig>(initial.metadata);
let playback = $state<PlaybackConfig>(initial.playback);
let appearance = $state<AppearanceConfig>(initial.appearance);

function save() {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({ general, backends, metadata, playback, appearance })
	);
}

// General
export function getGeneral(): GeneralConfig {
	return general;
}

export function setGeneral(patch: Partial<GeneralConfig>) {
	general = { ...general, ...patch };
	save();
}

// Backends
export function getBackends(): BackendsConfig {
	return backends;
}

export function getBackendConfig(id: string): BackendInstanceConfig {
	return backends[id] ?? { enabled: false, config: {} };
}

export function setBackend(id: string, patch: Partial<BackendInstanceConfig>) {
	const current = getBackendConfig(id);
	backends = {
		...backends,
		[id]: {
			enabled: patch.enabled ?? current.enabled,
			config: patch.config ? { ...current.config, ...patch.config } : current.config
		}
	};
	save();
}

// Metadata
export function getMetadata(): MetadataConfig {
	return metadata;
}

export function setMetadata(patch: Partial<MetadataConfig>) {
	metadata = { ...metadata, ...patch };
	save();
}

// Playback
export function getPlayback(): PlaybackConfig {
	return playback;
}

export function setPlayback(patch: Partial<PlaybackConfig>) {
	playback = { ...playback, ...patch };
	save();
}

// Volume
export function getVolume(): VolumeConfig {
	return playback.volume;
}

export function setVolume(patch: Partial<VolumeConfig>) {
	playback = { ...playback, volume: { ...playback.volume, ...patch } };
	save();
}

// EQ
export function getEQ(): EQConfig {
	return playback.eq;
}

export function setEQ(patch: Partial<EQConfig>) {
	playback = { ...playback, eq: { ...playback.eq, ...patch } };
	save();
}

// Appearance
export function getAppearance(): AppearanceConfig {
	return appearance;
}

export function setAppearance(patch: Partial<AppearanceConfig>) {
	appearance = { ...appearance, ...patch };
	save();
}

// Repeat
export function getRepeatMode(): RepeatMode {
	return playback.repeatMode;
}

const repeatCycle: RepeatMode[] = ['off', 'all', 'one'];
export function cycleRepeatMode() {
	const idx = repeatCycle.indexOf(playback.repeatMode);
	playback = { ...playback, repeatMode: repeatCycle[(idx + 1) % repeatCycle.length] };
	save();
}

// Shuffle
export function getShuffled(): boolean {
	return playback.shuffled;
}

export function setShuffled(value: boolean) {
	playback = { ...playback, shuffled: value };
	save();
}
