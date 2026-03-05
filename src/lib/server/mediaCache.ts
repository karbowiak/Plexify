/**
 * Disk cache for audio media files (songs, podcasts, radio segments).
 * Uses the shared DiskCache class with media-appropriate defaults.
 *
 * Defaults:
 *   - Directory: .cache/media
 *   - Max size: 2 GB (audio files are much larger than images)
 *   - TTL: 30 days (songs don't change)
 *
 * Env overrides: MEDIA_CACHE_DIR, MEDIA_CACHE_MAX_SIZE_MB, MEDIA_CACHE_TTL_DAYS
 */

import { env } from '$env/dynamic/private';
import { DiskCache } from './diskCache';

const cache = new DiskCache(
	{
		defaultDir: '.cache/media',
		defaultMaxMB: 2048,
		defaultTtlDays: 30,
		envDirKey: 'MEDIA_CACHE_DIR',
		envMaxSizeKey: 'MEDIA_CACHE_MAX_SIZE_MB',
		envTtlKey: 'MEDIA_CACHE_TTL_DAYS'
	},
	env as Record<string, string | undefined>
);

export const getCached = cache.getCached.bind(cache);
export const writeCached = cache.writeCached.bind(cache);
export const getCacheStats = cache.getCacheStats.bind(cache);
export const clearCache = cache.clearCache.bind(cache);
export const evictIfOverSize = cache.evictIfOverSize.bind(cache);
export const configure = cache.configure.bind(cache);
export const getConfig = cache.getConfig.bind(cache);
export const getEnvLocks = cache.getEnvLocks.bind(cache);
export const getTtlSeconds = cache.getTtlSeconds.bind(cache);
