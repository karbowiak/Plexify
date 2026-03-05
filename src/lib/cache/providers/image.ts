import type { CacheProvider, CacheStats } from '../types';
import {
	getCacheStats as getImageCacheStats,
	clearCache,
	configure as configureImageCache,
	getConfig as getImageConfig,
	getEnvLocks as getImageEnvLocks,
	evictIfOverSize
} from '$lib/server/imageCache';

export class ImageCacheProvider implements CacheProvider {
	readonly id = 'image';
	readonly name = 'Image Cache';
	readonly description = 'Caches album art, radio favicons, and podcast artwork on disk for fast loading.';
	readonly icon = 'image';

	getStats(): CacheStats {
		const raw = getImageCacheStats();
		return {
			totalSizeBytes: raw.totalSizeBytes,
			entryCount: raw.entryCount,
			oldestEntry: raw.oldestEntry,
			newestEntry: raw.newestEntry
		};
	}

	clear(): void {
		clearCache();
	}

	configure(opts: Record<string, unknown>): void {
		configureImageCache({
			directory: opts.directory as string | undefined,
			maxSizeMB: opts.maxSizeMB as number | undefined,
			ttlDays: opts.ttlDays as number | undefined
		});
		evictIfOverSize();
	}

	getConfig(): { directory: string; maxSizeMB: number; ttlDays: number } {
		return getImageConfig();
	}

	getEnvLocks(): Record<string, boolean> {
		return { ...getImageEnvLocks() };
	}
}
