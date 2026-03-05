import type { CacheProvider, CacheStats } from '../types';

/**
 * Cache provider for the audio analysis cache (BPM, beat detection, frequency data).
 * Runs client-side in the Web Audio engine — this provider is a placeholder for
 * the settings UI. Actual cache lives in the AudioEngine class (src/lib/audio/engine.ts).
 *
 * Since the audio engine runs in the browser, server-side stats are not available.
 * The detail page shows basic info about what this cache does.
 */
export class AudioAnalysisCacheProvider implements CacheProvider {
	readonly id = 'audio-analysis';
	readonly name = 'Audio Analysis';
	readonly description = 'Client-side cache for track BPM, beat detection, and frequency analysis (max 200 tracks).';
	readonly icon = 'audio-waveform';

	getStats(): CacheStats {
		// Client-side only — server has no visibility
		return {
			totalSizeBytes: 0,
			entryCount: 0,
			oldestEntry: null,
			newestEntry: null
		};
	}

	clear(): void {
		// Cannot clear from server — client-side cache
	}

	configure(): void {
		// Fixed LRU cache, not configurable
	}

	getConfig(): { directory: string; maxSizeMB: number; ttlDays: number } {
		return {
			directory: '(browser memory)',
			maxSizeMB: 0,
			ttlDays: 0
		};
	}

	getEnvLocks(): Record<string, boolean> {
		return { directory: true, maxSizeMB: true, ttlDays: true };
	}
}
