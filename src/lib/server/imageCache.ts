import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';

interface CacheMeta {
	contentType: string;
	cachedAt: number;
	ttlSeconds: number;
	size: number;
	originSrc: string;
}

const DEFAULT_CACHE_DIR = '.cache/img';
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024; // 500MB
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

let configuredDir: string | null = null;
let configuredMaxBytes: number = env.IMAGE_CACHE_MAX_SIZE_MB
	? parseInt(env.IMAGE_CACHE_MAX_SIZE_MB, 10) * 1024 * 1024
	: DEFAULT_MAX_BYTES;
let configuredTtlSeconds: number = env.IMAGE_CACHE_TTL_DAYS
	? parseInt(env.IMAGE_CACHE_TTL_DAYS, 10) * 24 * 60 * 60
	: DEFAULT_TTL_SECONDS;
let resolvedDir: string | null = null;
let inMemorySize = -1; // -1 = not computed yet

export interface EnvLocks {
	directory: boolean;
	maxSizeMB: boolean;
	ttlDays: boolean;
}

/**
 * Returns which settings are locked by environment variables.
 */
export function getEnvLocks(): EnvLocks {
	return {
		directory: !!env.IMAGE_CACHE_DIR,
		maxSizeMB: !!env.IMAGE_CACHE_MAX_SIZE_MB,
		ttlDays: !!env.IMAGE_CACHE_TTL_DAYS
	};
}

/**
 * Update cache configuration at runtime.
 * Settings locked by env vars are ignored.
 */
export function configure(opts: { directory?: string; maxSizeMB?: number; ttlDays?: number }) {
	if (opts.directory !== undefined && !env.IMAGE_CACHE_DIR) {
		configuredDir = opts.directory || null;
		resolvedDir = null; // force re-resolve
	}
	if (opts.maxSizeMB !== undefined && !env.IMAGE_CACHE_MAX_SIZE_MB) {
		configuredMaxBytes = opts.maxSizeMB * 1024 * 1024;
	}
	if (opts.ttlDays !== undefined && !env.IMAGE_CACHE_TTL_DAYS) {
		configuredTtlSeconds = opts.ttlDays * 24 * 60 * 60;
	}
}

export function getConfig(): { directory: string; maxSizeMB: number; ttlDays: number } {
	return {
		directory: getCacheDir(),
		maxSizeMB: Math.round(configuredMaxBytes / (1024 * 1024)),
		ttlDays: Math.round(configuredTtlSeconds / (24 * 60 * 60))
	};
}

export function getTtlSeconds(): number {
	return configuredTtlSeconds;
}

function getCacheDir(): string {
	if (!resolvedDir) {
		resolvedDir = configuredDir || env.IMAGE_CACHE_DIR || DEFAULT_CACHE_DIR;
		if (!existsSync(resolvedDir)) {
			mkdirSync(resolvedDir, { recursive: true });
		}
	}
	return resolvedDir;
}

function hashKey(src: string): string {
	return createHash('sha256').update(src).digest('hex');
}

function shardDir(hash: string): string {
	const shard = hash.substring(0, 2);
	const dir = join(getCacheDir(), shard);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	return dir;
}

function dataPath(hash: string): string {
	return join(shardDir(hash), hash);
}

function metaPath(hash: string): string {
	return join(shardDir(hash), `${hash}.meta`);
}

export function getCached(src: string): { data: Buffer; contentType: string } | null {
	const hash = hashKey(src);
	const dp = dataPath(hash);
	const mp = metaPath(hash);

	if (!existsSync(dp) || !existsSync(mp)) return null;

	try {
		const meta: CacheMeta = JSON.parse(readFileSync(mp, 'utf-8'));

		// TTL check
		const age = (Date.now() - meta.cachedAt) / 1000;
		if (age > meta.ttlSeconds) {
			// Expired — remove
			try { unlinkSync(dp); } catch { /* ignore */ }
			try { unlinkSync(mp); } catch { /* ignore */ }
			return null;
		}

		const data = readFileSync(dp);
		return { data, contentType: meta.contentType };
	} catch {
		return null;
	}
}

export function writeCached(
	src: string,
	data: Buffer,
	contentType: string,
	ttlSeconds: number = DEFAULT_TTL_SECONDS
): void {
	const hash = hashKey(src);
	const dp = dataPath(hash);
	const mp = metaPath(hash);

	const meta: CacheMeta = {
		contentType,
		cachedAt: Date.now(),
		ttlSeconds,
		size: data.length,
		originSrc: src
	};

	writeFileSync(dp, data);
	writeFileSync(mp, JSON.stringify(meta));

	// Update in-memory size tracker
	if (inMemorySize >= 0) {
		inMemorySize += data.length;
	}
}

export interface CacheStats {
	totalSizeBytes: number;
	entryCount: number;
	oldestEntry: number | null;
	newestEntry: number | null;
	directory: string;
	maxSizeMB: number;
	ttlDays: number;
	envLocks: EnvLocks;
}

export function getCacheStats(): CacheStats {
	const dir = getCacheDir();
	let totalSize = 0;
	let entryCount = 0;
	let oldest: number | null = null;
	let newest: number | null = null;

	const locks = getEnvLocks();
	if (!existsSync(dir)) return { totalSizeBytes: 0, entryCount: 0, oldestEntry: null, newestEntry: null, directory: dir, maxSizeMB: Math.round(configuredMaxBytes / (1024 * 1024)), ttlDays: Math.round(configuredTtlSeconds / (24 * 60 * 60)), envLocks: locks };

	try {
		const shards = readdirSync(dir);
		for (const shard of shards) {
			const shardPath = join(dir, shard);
			try {
				const st = statSync(shardPath);
				if (!st.isDirectory()) continue;
			} catch { continue; }

			const files = readdirSync(shardPath);
			for (const file of files) {
				if (file.endsWith('.meta')) continue;
				const fp = join(shardPath, file);
				try {
					const st = statSync(fp);
					totalSize += st.size;
					entryCount++;
					const mtime = st.mtimeMs;
					if (oldest === null || mtime < oldest) oldest = mtime;
					if (newest === null || mtime > newest) newest = mtime;
				} catch { /* skip */ }
			}
		}
	} catch { /* empty cache */ }

	inMemorySize = totalSize;
	return { totalSizeBytes: totalSize, entryCount, oldestEntry: oldest, newestEntry: newest, directory: dir, maxSizeMB: Math.round(configuredMaxBytes / (1024 * 1024)), ttlDays: Math.round(configuredTtlSeconds / (24 * 60 * 60)), envLocks: locks };
}

export function clearCache(): void {
	const dir = getCacheDir();
	if (!existsSync(dir)) return;

	try {
		const shards = readdirSync(dir);
		for (const shard of shards) {
			const shardPath = join(dir, shard);
			try {
				const st = statSync(shardPath);
				if (!st.isDirectory()) continue;
			} catch { continue; }

			const files = readdirSync(shardPath);
			for (const file of files) {
				try { unlinkSync(join(shardPath, file)); } catch { /* ignore */ }
			}
		}
	} catch { /* ignore */ }

	inMemorySize = 0;
}

export function evictIfOverSize(maxBytes?: number): void {
	const limit = maxBytes ?? configuredMaxBytes;
	const dir = getCacheDir();
	if (!existsSync(dir)) return;

	// Collect all entries with timestamps
	const entries: { path: string; metaPath: string; size: number; mtime: number }[] = [];
	let totalSize = 0;

	try {
		const shards = readdirSync(dir);
		for (const shard of shards) {
			const shardPath = join(dir, shard);
			try {
				if (!statSync(shardPath).isDirectory()) continue;
			} catch { continue; }

			const files = readdirSync(shardPath);
			for (const file of files) {
				if (file.endsWith('.meta')) continue;
				const fp = join(shardPath, file);
				const mp = join(shardPath, `${file}.meta`);
				try {
					const st = statSync(fp);
					entries.push({ path: fp, metaPath: mp, size: st.size, mtime: st.mtimeMs });
					totalSize += st.size;
				} catch { /* skip */ }
			}
		}
	} catch { return; }

	if (totalSize <= limit) {
		inMemorySize = totalSize;
		return;
	}

	// Sort oldest first
	entries.sort((a, b) => a.mtime - b.mtime);

	for (const entry of entries) {
		if (totalSize <= limit) break;
		try { unlinkSync(entry.path); } catch { /* ignore */ }
		try { unlinkSync(entry.metaPath); } catch { /* ignore */ }
		totalSize -= entry.size;
	}

	inMemorySize = totalSize;
}
