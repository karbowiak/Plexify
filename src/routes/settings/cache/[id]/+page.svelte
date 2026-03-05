<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Trash2, HardDrive, FolderOpen, Clock, Database, RefreshCw, Lock, ArrowLeft } from 'lucide-svelte';
	import { getCache, setCache } from '$lib/stores/configStore.svelte';

	let cacheId = $derived(page.params.id ?? 'image');
	let config = $derived(getCache(cacheId));

	interface EnvLocks {
		directory: boolean;
		maxSizeMB: boolean;
		ttlDays: boolean;
	}

	interface Stats {
		totalSizeBytes: number;
		entryCount: number;
		oldestEntry: number | null;
		newestEntry: number | null;
		directory: string;
		maxSizeMB: number;
		ttlDays: number;
		envLocks: EnvLocks;
	}

	let stats = $state<Stats | null>(null);
	let clearing = $state(false);
	let syncing = $state(false);

	let locks = $derived(stats?.envLocks ?? { directory: false, maxSizeMB: false, ttlDays: false });

	// In-memory caches have all locks set to true and maxSizeMB=0
	let isInMemory = $derived(locks.directory && locks.maxSizeMB && locks.ttlDays);
	let isConfigurable = $derived(!isInMemory);

	const maxSizeOptions = [
		{ label: '100 MB', value: 100 },
		{ label: '250 MB', value: 250 },
		{ label: '500 MB', value: 500 },
		{ label: '1 GB', value: 1024 },
		{ label: '2 GB', value: 2048 },
		{ label: '5 GB', value: 5120 }
	];

	const ttlOptions = [
		{ label: '1 day', value: 1 },
		{ label: '3 days', value: 3 },
		{ label: '7 days', value: 7 },
		{ label: '14 days', value: 14 },
		{ label: '30 days', value: 30 },
		{ label: '90 days', value: 90 }
	];

	interface CacheInfo {
		name: string;
		description: string;
		howItWorks: string[];
	}

	const cacheInfoMap: Record<string, CacheInfo> = {
		media: {
			name: 'Media Cache',
			description: 'Disk-based cache for audio files (songs, podcasts, radio segments).',
			howItWorks: [
				'Audio files are cached on disk after first playback, so repeated listens don\'t re-fetch from the backend. This dramatically reduces bandwidth and improves response time.',
				'The cache uses the same sharded SHA-256 directory structure as the image cache. Files are stored with their original content type (audio/mpeg, audio/flac, audio/ogg, etc.).',
				'Default limit is 2 GB with a 30-day TTL. Oldest files are evicted first when the cache is full.',
				'All three settings can be overridden via environment variables: MEDIA_CACHE_DIR, MEDIA_CACHE_MAX_SIZE_MB, MEDIA_CACHE_TTL_DAYS. When set, the corresponding UI field is locked.',
				'This cache is especially useful for Electron builds where offline playback and reduced network usage are important.'
			]
		},
		image: {
			name: 'Image Cache',
			description: 'Disk-based cache for album art, radio favicons, and podcast artwork.',
			howItWorks: [
				'All images (album art, radio favicons, podcast artwork) are fetched through a server-side cache proxy. On first load, images are downloaded from the origin and stored on disk. Subsequent requests serve from cache.',
				'Cached files are organized in sharded subdirectories using SHA-256 hashes. When the cache exceeds the maximum size, the oldest entries are evicted first.',
				'Each backend uses a compound protocol prefix (e.g. demo-image://, radiobrowser-image://) so the cache can route requests to the correct origin with appropriate authentication headers when needed.',
				'All three settings can be overridden via environment variables: IMAGE_CACHE_DIR, IMAGE_CACHE_MAX_SIZE_MB, IMAGE_CACHE_TTL_DAYS. When set, the corresponding UI field is locked.'
			]
		},
		metadata: {
			name: 'Metadata Cache',
			description: 'In-memory cache for radio stream now-playing info and other transient metadata.',
			howItWorks: [
				'When listening to internet radio, ICY metadata (artist and track name) is extracted from the audio stream headers and cached in memory.',
				'Entries automatically expire after 5 minutes. The cache is cleared when the server restarts.',
				'This cache cannot be configured as it is managed automatically with fixed limits.'
			]
		},
		'audio-analysis': {
			name: 'Audio Analysis',
			description: 'Client-side cache for track BPM, beat detection, and frequency analysis.',
			howItWorks: [
				'When tracks play, the audio engine analyzes them in a Web Worker to detect BPM, beat positions, and frequency characteristics. Results are cached in browser memory.',
				'The cache holds up to 200 tracks using LRU (least recently used) eviction. When the limit is reached, the oldest analysis is discarded.',
				'Since this cache lives in the browser, it is cleared when the page is refreshed. Server-side stats are not available.'
			]
		},
		api: {
			name: 'API Cache',
			description: 'In-memory cache for podcast feed responses and other API data.',
			howItWorks: [
				'Podcast RSS feeds are fetched and parsed on first request, then cached in memory for 30 minutes. Duplicate requests for the same feed within the TTL window are deduplicated.',
				'The cache is cleared when the server restarts or when the podcast backend disconnects.',
				'This cache cannot be configured as it is managed automatically with fixed limits.'
			]
		}
	};

	let info = $derived(cacheInfoMap[cacheId] ?? {
		name: cacheId.charAt(0).toUpperCase() + cacheId.slice(1) + ' Cache',
		description: '',
		howItWorks: []
	});

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
	}

	function formatDate(ms: number | null): string {
		if (!ms) return 'N/A';
		const d = new Date(ms);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	let effectiveMaxSizeMB = $derived(locks.maxSizeMB && stats ? stats.maxSizeMB : config.maxSizeMB);
	let effectiveDirectory = $derived(locks.directory && stats ? stats.directory : config.directory);
	let effectiveTtlDays = $derived(locks.ttlDays && stats ? stats.ttlDays : config.ttlDays);

	function usagePercent(): number {
		if (!stats || effectiveMaxSizeMB === 0) return 0;
		return Math.min(100, (stats.totalSizeBytes / (effectiveMaxSizeMB * 1024 * 1024)) * 100);
	}

	async function syncToServer(patch: Partial<{ directory: string; maxSizeMB: number; ttlDays: number }>) {
		syncing = true;
		try {
			const res = await fetch(`/api/cache/${cacheId}/stats`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (res.ok) stats = await res.json();
		} catch { /* ignore */ }
		syncing = false;
	}

	async function fetchStats() {
		try {
			const res = await fetch(`/api/cache/${cacheId}/stats`);
			if (res.ok) stats = await res.json();
		} catch { /* ignore */ }
	}

	async function clearCacheAction() {
		clearing = true;
		try {
			await fetch(`/api/cache/${cacheId}/stats`, { method: 'DELETE' });
			await fetchStats();
		} catch { /* ignore */ }
		clearing = false;
	}

	function updateDirectory(value: string) {
		if (locks.directory) return;
		setCache(cacheId, { directory: value });
		syncToServer({ directory: value });
	}

	function updateMaxSize(value: number) {
		if (locks.maxSizeMB) return;
		setCache(cacheId, { maxSizeMB: value });
		syncToServer({ maxSizeMB: value });
	}

	function updateTtl(value: number) {
		if (locks.ttlDays) return;
		setCache(cacheId, { ttlDays: value });
		syncToServer({ ttlDays: value });
	}

	onMount(async () => {
		// Always fetch stats first to determine if cache is configurable
		await fetchStats();
		// If configurable (disk-based), sync local config to server
		if (stats && !(stats.envLocks.directory && stats.envLocks.maxSizeMB && stats.envLocks.ttlDays)) {
			const c = getCache(cacheId);
			syncToServer({
				directory: c.directory,
				maxSizeMB: c.maxSizeMB,
				ttlDays: c.ttlDays
			});
		}
	});
</script>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a href="/settings/cache" class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-overlay-subtle hover:text-text-primary">
			<ArrowLeft size={18} />
		</a>
		<div>
			<h1 class="text-2xl font-bold text-text-primary">{info.name}</h1>
			{#if info.description}
				<p class="mt-0.5 text-xs text-text-secondary">{info.description}</p>
			{/if}
		</div>
	</div>

	<!-- Overview -->
	<div class="rounded-xl border border-border bg-bg-elevated">
		<h2 class="px-6 pt-5 pb-3 text-sm font-semibold text-accent">Overview</h2>

		<div class="px-6 py-4">
			<div class="flex items-center gap-4">
				<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
					<Database size={22} class="text-accent" />
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex items-baseline gap-2">
						<p class="text-lg font-semibold text-text-primary">
							{#if stats}
								{formatBytes(stats.totalSizeBytes)}
							{:else}
								...
							{/if}
						</p>
						{#if isConfigurable && effectiveMaxSizeMB > 0}
							<p class="text-xs text-text-muted">
								/ {effectiveMaxSizeMB >= 1024
									? `${(effectiveMaxSizeMB / 1024).toFixed(effectiveMaxSizeMB % 1024 === 0 ? 0 : 1)} GB`
									: `${effectiveMaxSizeMB} MB`}
							</p>
						{:else if isInMemory}
							<span class="rounded-full bg-overlay-subtle px-2 py-0.5 text-[10px] font-medium text-text-muted">in-memory</span>
						{/if}
					</div>
					{#if isConfigurable && effectiveMaxSizeMB > 0}
						<!-- Usage bar -->
						<div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-overlay-medium">
							<div
								class="h-full rounded-full transition-all duration-500 {usagePercent() > 90
									? 'bg-red-500'
									: usagePercent() > 70
										? 'bg-amber-500'
										: 'bg-accent'}"
								style:width="{usagePercent()}%"
							></div>
						</div>
					{/if}
				</div>
			</div>

			{#if stats}
				<div class="mt-4 flex flex-wrap gap-3">
					<div class="rounded-lg bg-overlay-subtle px-3 py-2">
						<p class="text-[10px] font-medium uppercase tracking-wider text-text-muted">Entries</p>
						<p class="text-sm font-semibold text-text-primary">{stats.entryCount.toLocaleString()}</p>
					</div>
					{#if stats.oldestEntry}
						<div class="rounded-lg bg-overlay-subtle px-3 py-2">
							<p class="text-[10px] font-medium uppercase tracking-wider text-text-muted">Oldest</p>
							<p class="text-sm font-semibold text-text-primary">{formatDate(stats.oldestEntry)}</p>
						</div>
					{/if}
					{#if stats.newestEntry}
						<div class="rounded-lg bg-overlay-subtle px-3 py-2">
							<p class="text-[10px] font-medium uppercase tracking-wider text-text-muted">Newest</p>
							<p class="text-sm font-semibold text-text-primary">{formatDate(stats.newestEntry)}</p>
						</div>
					{/if}
					{#if isInMemory}
						<div class="rounded-lg bg-overlay-subtle px-3 py-2">
							<p class="text-[10px] font-medium uppercase tracking-wider text-text-muted">Storage</p>
							<p class="text-sm font-semibold text-text-primary">{stats.directory}</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="mx-6 h-px bg-border"></div>

		<!-- Actions -->
		<div class="flex items-center gap-2 px-6 py-4 pb-5">
			<button
				type="button"
				class="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
				onclick={clearCacheAction}
				disabled={clearing}
			>
				<Trash2 size={14} />
				{clearing ? 'Clearing...' : 'Clear Cache'}
			</button>
			<button
				type="button"
				class="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent/30 hover:bg-accent/10 hover:text-accent disabled:opacity-50"
				onclick={fetchStats}
				disabled={syncing}
			>
				<RefreshCw size={14} class={syncing ? 'animate-spin' : ''} />
				Refresh
			</button>
		</div>
	</div>

	<!-- Settings (only for configurable/disk caches) -->
	{#if isConfigurable}
		<div class="rounded-xl border border-border bg-bg-elevated">
			<h2 class="px-6 pt-5 pb-3 text-sm font-semibold text-accent">Settings</h2>

			<!-- Cache directory -->
			<div class="flex items-center justify-between px-6 py-4">
				<div>
					<div class="flex items-center gap-2">
						<p class="text-sm font-medium text-text-primary">Cache Directory</p>
						{#if locks.directory}
							<span class="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
								<Lock size={10} />
								ENV
							</span>
						{/if}
					</div>
					<p class="text-xs text-text-secondary">
						{#if locks.directory}
							Set by environment variable.
						{:else}
							Where cached files are stored on disk.
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<FolderOpen size={14} class="text-text-muted" />
					<input
						type="text"
						value={effectiveDirectory}
						onchange={(e) => updateDirectory((e.target as HTMLInputElement).value)}
						disabled={locks.directory}
						class="w-48 rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
						placeholder=".cache/img"
					/>
				</div>
			</div>

			<div class="mx-6 h-px bg-border"></div>

			<!-- Max cache size -->
			<div class="flex items-center justify-between px-6 py-4">
				<div>
					<div class="flex items-center gap-2">
						<p class="text-sm font-medium text-text-primary">Maximum Size</p>
						{#if locks.maxSizeMB}
							<span class="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
								<Lock size={10} />
								ENV
							</span>
						{/if}
					</div>
					<p class="text-xs text-text-secondary">
						{#if locks.maxSizeMB}
							Set by environment variable.
						{:else}
							Oldest entries are evicted when the cache exceeds this limit.
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<HardDrive size={14} class="text-text-muted" />
					<select
						value={effectiveMaxSizeMB}
						onchange={(e) => updateMaxSize(Number((e.target as HTMLSelectElement).value))}
						disabled={locks.maxSizeMB}
						class="rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#each maxSizeOptions as opt}
							<option value={opt.value} selected={opt.value === effectiveMaxSizeMB}>{opt.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="mx-6 h-px bg-border"></div>

			<!-- TTL -->
			<div class="flex items-center justify-between px-6 py-4 pb-5">
				<div>
					<div class="flex items-center gap-2">
						<p class="text-sm font-medium text-text-primary">Cache Duration (TTL)</p>
						{#if locks.ttlDays}
							<span class="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
								<Lock size={10} />
								ENV
							</span>
						{/if}
					</div>
					<p class="text-xs text-text-secondary">
						{#if locks.ttlDays}
							Set by environment variable.
						{:else}
							How long cached entries are kept before they expire and are re-fetched.
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Clock size={14} class="text-text-muted" />
					<select
						value={effectiveTtlDays}
						onchange={(e) => updateTtl(Number((e.target as HTMLSelectElement).value))}
						disabled={locks.ttlDays}
						class="rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#each ttlOptions as opt}
							<option value={opt.value} selected={opt.value === effectiveTtlDays}>{opt.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
	{/if}

	<!-- How it Works -->
	{#if info.howItWorks.length > 0}
		<div class="rounded-xl border border-border/60 bg-bg-elevated/60 p-6">
			<h2 class="mb-3 text-sm font-semibold text-text-primary">How it works</h2>
			<div class="space-y-2 text-xs text-text-secondary">
				{#each info.howItWorks as paragraph}
					<p>{paragraph}</p>
				{/each}
			</div>
		</div>
	{/if}
</div>
