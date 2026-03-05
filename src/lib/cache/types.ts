export interface CacheStats {
	totalSizeBytes: number;
	entryCount: number;
	oldestEntry: number | null;
	newestEntry: number | null;
}

export interface CacheProvider {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly icon: string;

	getStats(): CacheStats;
	clear(): void;
	configure(opts: Record<string, unknown>): void;
	getConfig(): { directory: string; maxSizeMB: number; ttlDays: number; [k: string]: unknown };
	getEnvLocks(): Record<string, boolean>;
}
