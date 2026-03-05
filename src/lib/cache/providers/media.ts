import type { CacheProvider, CacheStats } from '../types';
import {
	getCacheStats as getMediaCacheStats,
	clearCache as clearMediaCache,
	configure as configureMediaCache,
	getConfig as getMediaConfig,
	getEnvLocks as getMediaEnvLocks,
	evictIfOverSize
} from '$lib/server/mediaCache';

/**
 * Cache provider for audio media files (mp3, flac, ogg, etc.).
 * Disk-based, stores fetched audio so repeated plays don't hit the backend.
 * Especially valuable for Electron builds where network round-trips are costly.
 */
export class MediaCacheProvider implements CacheProvider {
	readonly id = 'media';
	readonly name = 'Media Cache';
	readonly description = 'Caches audio files (songs, podcasts, radio segments) on disk for offline playback and faster loading.';
	readonly icon = 'music';

	getStats(): CacheStats {
		const raw = getMediaCacheStats();
		return {
			totalSizeBytes: raw.totalSizeBytes,
			entryCount: raw.entryCount,
			oldestEntry: raw.oldestEntry,
			newestEntry: raw.newestEntry
		};
	}

	clear(): void {
		clearMediaCache();
	}

	configure(opts: Record<string, unknown>): void {
		configureMediaCache({
			directory: opts.directory as string | undefined,
			maxSizeMB: opts.maxSizeMB as number | undefined,
			ttlDays: opts.ttlDays as number | undefined
		});
		evictIfOverSize();
	}

	getConfig(): { directory: string; maxSizeMB: number; ttlDays: number } {
		return getMediaConfig();
	}

	getEnvLocks(): Record<string, boolean> {
		return { ...getMediaEnvLocks() };
	}
}
