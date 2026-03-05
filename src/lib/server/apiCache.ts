interface CacheEntry<T> {
	data: T;
	cachedAt: number;
	ttlMs: number;
}

class ApiResponseCache {
	private cache = new Map<string, CacheEntry<unknown>>();

	get<T>(key: string): T | null {
		const entry = this.cache.get(key);
		if (!entry) return null;
		if (Date.now() - entry.cachedAt > entry.ttlMs) {
			this.cache.delete(key);
			return null;
		}
		return entry.data as T;
	}

	set<T>(key: string, data: T, ttlMs: number): void {
		this.cache.set(key, { data, cachedAt: Date.now(), ttlMs });
	}

	delete(key: string): void {
		this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	getInfo(): {
		count: number;
		estimatedBytes: number;
		oldestCachedAt: number | null;
		newestCachedAt: number | null;
	} {
		let oldest: number | null = null;
		let newest: number | null = null;
		let estimatedBytes = 0;

		for (const entry of this.cache.values()) {
			// Evict expired entries during stats collection
			if (Date.now() - entry.cachedAt > entry.ttlMs) continue;

			if (oldest === null || entry.cachedAt < oldest) oldest = entry.cachedAt;
			if (newest === null || entry.cachedAt > newest) newest = entry.cachedAt;
			estimatedBytes += JSON.stringify(entry.data).length * 2;
		}

		return { count: this.cache.size, estimatedBytes, oldestCachedAt: oldest, newestCachedAt: newest };
	}
}

export const apiCache = new ApiResponseCache();
