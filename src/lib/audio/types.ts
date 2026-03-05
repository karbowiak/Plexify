export type PlaybackState = 'stopped' | 'buffering' | 'playing' | 'paused';

export interface EngineCallbacks {
	onPosition(positionMs: number, durationMs: number): void;
	onState(state: PlaybackState): void;
	onTrackStarted(trackId: string, durationMs?: number): void;
	onTrackEnded(trackId: string): void;
	onError(message: string): void;
	onVisFrame?(samples: Float32Array): void;
}

export interface TrackAnalysis {
	trackId: string;
	audioStartMs: number;
	audioEndMs: number;
	outroStartMs: number;
	introEndMs: number;
	medianEnergy: number;
	bpm: number;
}

export interface PlayRequest {
	url: string;
	trackId: string;
	durationMs: number;
	albumId: string;
	gainDb: number | null;
	skipCrossfade?: boolean;
	/** True for infinite streams (radio). Disables seek, preload, crossfade. */
	isStream?: boolean;
}
