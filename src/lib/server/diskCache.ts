/**
 * Reusable disk cache with sharded directories, TTL, and LRU eviction.
 * Used by imageCache.ts and mediaCache.ts (and future disk caches).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface CacheMeta {
	contentType: string;
	cachedAt: number;
	ttlSeconds: number;
	size: number;
	originSrc: string;
}

export interface EnvLocks {
	directory: boolean;
	maxSizeMB: boolean;
	ttlDays: boolean;
}

export interface DiskCacheStats {
	totalSizeBytes: number;
	entryCount: number;
	oldestEntry: number | null;
	newestEntry: number | null;
	directory: string;
	maxSizeMB: number;
	ttlDays: number;
	envLocks: EnvLocks;
}

export interface DiskCacheOptions {
	defaultDir: string;
	defaultMaxMB: number;
	defaultTtlDays: number;
	envDirKey?: string;
	envMaxSizeKey?: string;
	envTtlKey?: string;
}

export class DiskCache {
	private configuredDir: string | null = null;
	private configuredMaxBytes: number;
	private configuredTtlSeconds: number;
	private resolvedDir: string | null = null;
	private inMemorySize = -1;

	private readonly defaultDir: string;
	private readonly defaultMaxBytes: number;
	private readonly defaultTtlSeconds: number;
	private readonly envDir: string | undefined;
	private readonly envMaxSize: string | undefined;
	private readonly envTtl: string | undefined;

	constructor(opts: DiskCacheOptions, envVars: Record<string, string | undefined>) {
		this.defaultDir = opts.defaultDir;
		this.defaultMaxBytes = opts.defaultMaxMB * 1024 * 1024;
		this.defaultTtlSeconds = opts.defaultTtlDays * 24 * 60 * 60;

		this.envDir = opts.envDirKey ? envVars[opts.envDirKey] : undefined;
		this.envMaxSize = opts.envMaxSizeKey ? envVars[opts.envMaxSizeKey] : undefined;
		this.envTtl = opts.envTtlKey ? envVars[opts.envTtlKey] : undefined;

		this.configuredMaxBytes = this.envMaxSize
			? parseInt(this.envMaxSize, 10) * 1024 * 1024
			: this.defaultMaxBytes;
		this.configuredTtlSeconds = this.envTtl
			? parseInt(this.envTtl, 10) * 24 * 60 * 60
			: this.defaultTtlSeconds;
	}

	getEnvLocks(): EnvLocks {
		return {
			directory: !!this.envDir,
			maxSizeMB: !!this.envMaxSize,
			ttlDays: !!this.envTtl
		};
	}

	configure(opts: { directory?: string; maxSizeMB?: number; ttlDays?: number }) {
		if (opts.directory !== undefined && !this.envDir) {
			this.configuredDir = opts.directory || null;
			this.resolvedDir = null;
		}
		if (opts.maxSizeMB !== undefined && !this.envMaxSize) {
			this.configuredMaxBytes = opts.maxSizeMB * 1024 * 1024;
		}
		if (opts.ttlDays !== undefined && !this.envTtl) {
			this.configuredTtlSeconds = opts.ttlDays * 24 * 60 * 60;
		}
	}

	getConfig(): { directory: string; maxSizeMB: number; ttlDays: number } {
		return {
			directory: this.getCacheDir(),
			maxSizeMB: Math.round(this.configuredMaxBytes / (1024 * 1024)),
			ttlDays: Math.round(this.configuredTtlSeconds / (24 * 60 * 60))
		};
	}

	getTtlSeconds(): number {
		return this.configuredTtlSeconds;
	}

	private getCacheDir(): string {
		if (!this.resolvedDir) {
			this.resolvedDir = this.configuredDir || this.envDir || this.defaultDir;
			if (!existsSync(this.resolvedDir)) {
				mkdirSync(this.resolvedDir, { recursive: true });
			}
		}
		return this.resolvedDir;
	}

	private hashKey(src: string): string {
		return createHash('sha256').update(src).digest('hex');
	}

	private shardDir(hash: string): string {
		const shard = hash.substring(0, 2);
		const dir = join(this.getCacheDir(), shard);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	private dataPath(hash: string): string {
		return join(this.shardDir(hash), hash);
	}

	private metaPath(hash: string): string {
		return join(this.shardDir(hash), `${hash}.meta`);
	}

	getCached(src: string): { data: Buffer; contentType: string } | null {
		const hash = this.hashKey(src);
		const dp = this.dataPath(hash);
		const mp = this.metaPath(hash);

		if (!existsSync(dp) || !existsSync(mp)) return null;

		try {
			const meta: CacheMeta = JSON.parse(readFileSync(mp, 'utf-8'));
			const age = (Date.now() - meta.cachedAt) / 1000;
			if (age > meta.ttlSeconds) {
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

	writeCached(src: string, data: Buffer, contentType: string, ttlSeconds?: number): void {
		const hash = this.hashKey(src);
		const dp = this.dataPath(hash);
		const mp = this.metaPath(hash);

		const meta: CacheMeta = {
			contentType,
			cachedAt: Date.now(),
			ttlSeconds: ttlSeconds ?? this.configuredTtlSeconds,
			size: data.length,
			originSrc: src
		};

		writeFileSync(dp, data);
		writeFileSync(mp, JSON.stringify(meta));

		if (this.inMemorySize >= 0) {
			this.inMemorySize += data.length;
		}
	}

	getCacheStats(): DiskCacheStats {
		const dir = this.getCacheDir();
		let totalSize = 0;
		let entryCount = 0;
		let oldest: number | null = null;
		let newest: number | null = null;

		const locks = this.getEnvLocks();
		if (!existsSync(dir)) {
			return {
				totalSizeBytes: 0, entryCount: 0, oldestEntry: null, newestEntry: null,
				directory: dir, maxSizeMB: Math.round(this.configuredMaxBytes / (1024 * 1024)),
				ttlDays: Math.round(this.configuredTtlSeconds / (24 * 60 * 60)), envLocks: locks
			};
		}

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

		this.inMemorySize = totalSize;
		return {
			totalSizeBytes: totalSize, entryCount, oldestEntry: oldest, newestEntry: newest,
			directory: dir, maxSizeMB: Math.round(this.configuredMaxBytes / (1024 * 1024)),
			ttlDays: Math.round(this.configuredTtlSeconds / (24 * 60 * 60)), envLocks: locks
		};
	}

	clearCache(): void {
		const dir = this.getCacheDir();
		if (!existsSync(dir)) return;

		try {
			const shards = readdirSync(dir);
			for (const shard of shards) {
				const shardPath = join(dir, shard);
				try {
					if (!statSync(shardPath).isDirectory()) continue;
				} catch { continue; }
				const files = readdirSync(shardPath);
				for (const file of files) {
					try { unlinkSync(join(shardPath, file)); } catch { /* ignore */ }
				}
			}
		} catch { /* ignore */ }

		this.inMemorySize = 0;
	}

	evictIfOverSize(maxBytes?: number): void {
		const limit = maxBytes ?? this.configuredMaxBytes;
		const dir = this.getCacheDir();
		if (!existsSync(dir)) return;

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
			this.inMemorySize = totalSize;
			return;
		}

		entries.sort((a, b) => a.mtime - b.mtime);
		for (const entry of entries) {
			if (totalSize <= limit) break;
			try { unlinkSync(entry.path); } catch { /* ignore */ }
			try { unlinkSync(entry.metaPath); } catch { /* ignore */ }
			totalSize -= entry.size;
		}

		this.inMemorySize = totalSize;
	}
}
