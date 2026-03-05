import type { Track } from '$lib/backends/models/track';
import type { PlaybackState, EngineCallbacks, PlayRequest } from '$lib/audio/types';
import { WebAudioEngine } from '$lib/audio/engine';
import {
	getCurrentItem,
	getNextItem,
	advanceIndex,
	retreatIndex,
	setCurrentIndex,
	getItems,
	getCurrentIndex,
	hasNext,
	type QueueItem
} from './unifiedQueue.svelte';
import { getPlayback, getVolume } from './configStore.svelte';
import { onTrackEnd as sleepTimerOnTrackEnd } from './sleepTimerStore.svelte';
import { Capability } from '$lib/backends/types';
import { getBackend, getBackendsWithCapability, resolveEntityBackend } from './backendStore.svelte';
import { addToRecent, startIcyStream, stopIcyStream } from './radioStore.svelte';
import { getEpisodeProgress, setEpisodeProgress, markCompleted } from './podcastStore.svelte';

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

let state = $state<PlaybackState>('stopped');
let positionMs = $state(0);
let durationMs = $state(0);
let error = $state<string | null>(null);

// Visualizer samples outside $state — 22fps updates would thrash Svelte reactivity
let visSamples: Float32Array | null = null;

// Progress save interval for podcasts
let progressInterval: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Engine (lazy init, SSR-safe)
// ---------------------------------------------------------------------------

let engine: WebAudioEngine | null = null;

const callbacks: EngineCallbacks = {
	onPosition(pos, dur) {
		positionMs = pos;
		durationMs = dur;
	},
	onState(s) {
		state = s;
	},
	onTrackStarted(_trackId, dur) {
		const item = getCurrentItem();
		if (!item) return;

		if (dur) durationMs = dur;
		error = null;

		// NowPlaying fan-out to all capable backends
		fireNowPlaying(item);

		if (item.type === 'radio') {
			startIcyStream(item.data.stream_url);
		} else if (item.type === 'track') {
			schedulePreload();
		} else if (item.type === 'podcast') {
			startProgressSave(item);
		}
	},
	onTrackEnded(_trackId) {
		const item = getCurrentItem();
		if (!item) return;

		stopProgressSave();

		// Scrobble fan-out to all capable backends
		fireScrobble(item, positionMs);

		// Radio streams don't auto-advance
		if (item.type === 'radio') return;

		// Mark podcast episode completed
		if (item.type === 'podcast') {
			markCompleted(item.feedUrl, item.data.guid);
		}

		sleepTimerOnTrackEnd();

		const playback = getPlayback();

		if (playback.repeatMode === 'one') {
			void playItemInternal(item);
			return;
		}

		const next = advanceIndex();
		if (next) {
			void playItemInternal(next);
		} else if (playback.repeatMode === 'all') {
			const allItems = getItems();
			if (allItems.length > 0) {
				setCurrentIndex(0);
				void playItemInternal(allItems[0]);
			}
		} else {
			state = 'stopped';
			positionMs = 0;
			durationMs = 0;
		}
	},
	onError(msg) {
		error = msg;
	},
	onVisFrame(samples) {
		visSamples = samples;
	}
};

// ---------------------------------------------------------------------------
// NowPlaying / Scrobble fan-out
// ---------------------------------------------------------------------------

function fireNowPlaying(item: QueueItem) {
	const backends = getBackendsWithCapability(Capability.NowPlaying);
	for (const b of backends) {
		if (b.nowPlayingMediaTypes && !b.nowPlayingMediaTypes.has(item.type)) continue;
		if (b.nowPlayingScope === 'own') {
			const itemBackendId = 'backendId' in item.data ? (item.data as { backendId?: string }).backendId : null;
			if (itemBackendId !== b.id) continue;
		}
		b.updateNowPlaying?.(item).catch(() => {});
	}
}

function fireScrobble(item: QueueItem, durationPlayedMs: number) {
	const backends = getBackendsWithCapability(Capability.Scrobble);
	for (const b of backends) {
		if (b.nowPlayingMediaTypes && !b.nowPlayingMediaTypes.has(item.type)) continue;
		if (b.nowPlayingScope === 'own') {
			const itemBackendId = 'backendId' in item.data ? (item.data as { backendId?: string }).backendId : null;
			if (itemBackendId !== b.id) continue;
		}
		b.scrobble?.(item, durationPlayedMs).catch(() => {});
	}
}

export function getEngine(): WebAudioEngine {
	if (!engine) {
		engine = new WebAudioEngine();
		engine.init(callbacks);
		syncConfigToEngine();
	}
	return engine;
}

// ---------------------------------------------------------------------------
// Config sync
// ---------------------------------------------------------------------------

function syncConfigToEngine() {
	if (!engine) return;
	const pb = getPlayback();
	const vol = pb.volume;
	const eq = pb.eq;

	const gain = vol.muted ? 0 : Math.pow(vol.level / 100, 3);
	engine.setVolume(gain);

	engine.setEqEnabled(eq.enabled);
	engine.setEq(eq.bands);
	engine.setPreampGain(eq.preampDb);
	engine.setEqPostgain(eq.postgainDb);

	engine.setCrossfadeWindow(pb.crossfadeEnabled ? pb.crossfadeDuration * 1000 : 0);
	engine.setSmartCrossfade(pb.smartCrossfade);
	engine.setSameAlbumCrossfade(pb.sameAlbumCrossfade);

	engine.setNormalizationEnabled(pb.normalizeVolume);
	engine.setVisualizerEnabled(pb.visualizerEnabled);
}

export function syncConfig() {
	syncConfigToEngine();
}

// ---------------------------------------------------------------------------
// Build play request from QueueItem
// ---------------------------------------------------------------------------

async function buildPlayRequest(item: QueueItem): Promise<PlayRequest> {
	switch (item.type) {
		case 'track': {
			const backend = resolveEntityBackend(item.data.id) ?? getBackend();
			if (!backend?.getStreamUrl) {
				throw new Error('Backend does not support streaming');
			}
			const url = await backend.getStreamUrl(item.data.id);
			const pb = getPlayback();
			let gainDb: number | null = null;
			if (pb.normalizeVolume && item.data.quality) {
				gainDb = item.data.quality.gain ?? item.data.quality.albumGain ?? null;
			}
			return {
				url,
				trackId: item.data.id,
				durationMs: item.data.duration,
				albumId: item.data.albumId,
				gainDb
			};
		}
		case 'radio': {
			const radioBackends = getBackendsWithCapability(Capability.InternetRadio);
			const rb =
				radioBackends.find((b) => b.id === item.data.backendId) ?? radioBackends[0];
			const radioUrl = rb?.getRadioStreamUrl
				? await rb.getRadioStreamUrl(item.data.stream_url)
				: `/api/radio/stream?url=${encodeURIComponent(item.data.stream_url)}`;
			return {
				url: radioUrl,
				trackId: `radio:${item.data.uuid}`,
				durationMs: 0,
				albumId: '',
				gainDb: null,
				skipCrossfade: true,
				isStream: true
			};
		}
		case 'podcast': {
			const podcastBackends = getBackendsWithCapability(Capability.Podcasts);
			const pb =
				podcastBackends.find((b) => b.id === item.data.backendId) ?? podcastBackends[0];
			const podcastUrl = pb?.getPodcastEpisodeStreamUrl
				? await pb.getPodcastEpisodeStreamUrl(item.data)
				: item.data.audio_url;
			return {
				url: podcastUrl,
				trackId: `podcast:${item.data.guid}`,
				durationMs: item.data.duration_secs * 1000,
				albumId: '',
				gainDb: null,
				skipCrossfade: true
			};
		}
	}
}

// ---------------------------------------------------------------------------
// Internal playback
// ---------------------------------------------------------------------------

async function playItemInternal(item: QueueItem): Promise<void> {
	const eng = getEngine();
	try {
		const req = await buildPlayRequest(item);
		await eng.play(req);

		// Seek to saved position for podcasts
		if (item.type === 'podcast') {
			const savedPosition = getEpisodeProgress(item.feedUrl, item.data.guid);
			if (savedPosition > 0) {
				setTimeout(() => eng.seek(savedPosition * 1000), 200);
			}
		}
	} catch (err) {
		error = err instanceof Error ? err.message : 'Playback failed';
		state = 'stopped';
	}
}

async function preloadNext(): Promise<void> {
	const next = getNextItem();
	if (!next || next.type !== 'track') return;
	const eng = getEngine();
	try {
		const req = await buildPlayRequest(next);
		await eng.preloadNext(req);
		const backend = resolveEntityBackend(next.data.id) ?? getBackend();
		if (backend?.getStreamUrl) {
			const url = await backend.getStreamUrl(next.data.id);
			eng.analyzeTrack(url, next.data.id, next.data.duration);
		}
	} catch {
		// Preload failure is non-fatal
	}
}

function schedulePreload() {
	void preloadNext();
}

// ---------------------------------------------------------------------------
// Podcast progress saving
// ---------------------------------------------------------------------------

function startProgressSave(item: QueueItem & { type: 'podcast' }) {
	stopProgressSave();
	progressInterval = setInterval(() => {
		if (positionMs > 0) {
			setEpisodeProgress(item.feedUrl, item.data.guid, Math.floor(positionMs / 1000));
		}
	}, 5000);
}

function stopProgressSave() {
	if (progressInterval) {
		clearInterval(progressInterval);
		progressInterval = null;
	}
}

// ---------------------------------------------------------------------------
// Public API — exported functions
// ---------------------------------------------------------------------------

// Getters
export function getState(): PlaybackState {
	return state;
}

export function getPosition(): number {
	return positionMs;
}

export function getDuration(): number {
	return durationMs;
}

export function getError(): string | null {
	return error;
}

export function getVisSamples(): Float32Array | null {
	return visSamples;
}

export function isPlaying(): boolean {
	return state === 'playing';
}

export function isPaused(): boolean {
	return state === 'paused';
}

// Transport controls

export async function playCurrentItem() {
	const item = getCurrentItem();
	if (!item) return;

	// Side effects for radio
	if (item.type === 'radio') {
		addToRecent(item.data);
	}

	await playItemInternal(item);
}

export function pausePlayback() {
	getEngine().pause();
}

export function resumePlayback() {
	getEngine().resume();
}

export function togglePlayback() {
	if (state === 'playing') {
		pausePlayback();
	} else if (state === 'paused') {
		resumePlayback();
	}
}

export function stopPlayback() {
	stopProgressSave();
	stopIcyStream();
	getEngine().stop();
	positionMs = 0;
	durationMs = 0;
}

export async function skipNext() {
	const pb = getPlayback();

	if (pb.repeatMode === 'one') {
		const next = advanceIndex();
		if (next) {
			await playItemInternal(next);
			return;
		}
	}

	const next = advanceIndex();
	if (next) {
		await playItemInternal(next);
	} else if (pb.repeatMode === 'all') {
		const allItems = getItems();
		if (allItems.length > 0) {
			setCurrentIndex(0);
			await playItemInternal(allItems[0]);
		}
	}
}

export async function skipPrevious() {
	if (positionMs > 3000) {
		getEngine().seek(0);
		return;
	}

	const prev = retreatIndex();
	if (prev) {
		await playItemInternal(prev);
	} else {
		getEngine().seek(0);
	}
}

export function seekTo(ms: number) {
	getEngine().seek(ms);
}

// Visualizer
export function setVisualizerEnabled(enabled: boolean) {
	getEngine().setVisualizerEnabled(enabled);
}

// EQ direct control
export function setSmartCrossfade(enabled: boolean) {
	getEngine().setSmartCrossfade(enabled);
}

export function setSameAlbumCrossfade(enabled: boolean) {
	getEngine().setSameAlbumCrossfade(enabled);
}

// Audio node accessors (for external consumers like butterchurn)
export function getAudioContext(): AudioContext | null {
	return getEngine().getAudioContext();
}

export function getAnalyserNode(): AnalyserNode | null {
	return getEngine().getAnalyserNode();
}

// Cleanup
export function destroyPlayer() {
	stopProgressSave();
	stopIcyStream();
	engine?.destroy();
	engine = null;
	state = 'stopped';
	positionMs = 0;
	durationMs = 0;
	visSamples = null;
	error = null;
}
