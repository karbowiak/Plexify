import type { CacheProvider, CacheStats } from '../types';
import * as icyStore from '$lib/radio/icyMetadataStore';

/**
 * Cache provider for in-memory metadata caches (ICY stream metadata, etc.).
 * These are ephemeral — cleared on server restart — so disk config doesn't apply.
 */
export class MetadataCacheProvider implements CacheProvider {
	readonly id = 'metadata';
	readonly name = 'Metadata Cache';
	readonly description = 'In-memory cache for radio stream now-playing info and other transient metadata.';
	readonly icon = 'tags';

	getStats(): CacheStats {
		const info = icyStore.getStoreInfo();
		return {
			totalSizeBytes: info.estimatedBytes,
			entryCount: info.count,
			oldestEntry: info.oldestUpdatedAt,
			newestEntry: info.newestUpdatedAt
		};
	}

	clear(): void {
		icyStore.clearAll();
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
