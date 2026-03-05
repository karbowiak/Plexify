import type { CacheProvider, CacheStats } from '../types';
import { apiCache } from '$lib/server/apiCache';

/**
 * Cache provider for the shared API response cache.
 * Any backend's API routes can use apiCache.set/get — this provider
 * exposes aggregate stats and clear for the settings UI.
 */
export class ApiCacheProvider implements CacheProvider {
	readonly id = 'api';
	readonly name = 'API Cache';
	readonly description = 'Shared in-memory cache for backend API responses.';
	readonly icon = 'cloud';

	getStats(): CacheStats {
		const info = apiCache.getInfo();
		return {
			totalSizeBytes: info.estimatedBytes,
			entryCount: info.count,
			oldestEntry: info.oldestCachedAt,
			newestEntry: info.newestCachedAt
		};
	}

	clear(): void {
		apiCache.clear();
	}

	configure(): void {
		// In-memory cache — no persistent config
	}

	getConfig(): { directory: string; maxSizeMB: number; ttlDays: number } {
		return {
			directory: '(in-memory)',
			maxSizeMB: 0,
			ttlDays: 0
		};
	}

	getEnvLocks(): Record<string, boolean> {
		return { directory: true, maxSizeMB: true, ttlDays: true };
	}
}
