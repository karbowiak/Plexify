<script lang="ts">
	import { Image, Database, ChevronRight, Tags, Cloud, AudioWaveform, Music } from 'lucide-svelte';
	import { onMount } from 'svelte';

	interface CacheProviderInfo {
		id: string;
		name: string;
		description: string;
		icon: string;
		totalSizeBytes?: number;
		entryCount?: number;
	}

	const iconMap: Record<string, any> = {
		image: Image,
		database: Database,
		tags: Tags,
		cloud: Cloud,
		'audio-waveform': AudioWaveform,
		music: Music
	};

	let providers = $state<CacheProviderInfo[]>([
		{
			id: 'image',
			name: 'Image Cache',
			description: 'Album art, radio favicons, and podcast artwork cached on disk.',
			icon: 'image'
		},
		{
			id: 'media',
			name: 'Media Cache',
			description: 'Audio files (songs, podcasts) cached on disk for offline playback.',
			icon: 'music'
		},
		{
			id: 'metadata',
			name: 'Metadata Cache',
			description: 'Radio stream now-playing info and other transient metadata.',
			icon: 'tags'
		},
		{
			id: 'audio-analysis',
			name: 'Audio Analysis',
			description: 'Track BPM, beat detection, and frequency analysis data.',
			icon: 'audio-waveform'
		},
		{
			id: 'api',
			name: 'API Cache',
			description: 'Podcast feed responses and other API data.',
			icon: 'cloud'
		}
	]);

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
	}

	onMount(async () => {
		// Fetch stats for each known provider
		for (const provider of providers) {
			try {
				const res = await fetch(`/api/cache/${provider.id}/stats`);
				if (res.ok) {
					const data = await res.json();
					provider.totalSizeBytes = data.totalSizeBytes;
					provider.entryCount = data.entryCount;
				}
			} catch { /* ignore */ }
		}
	});
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-text-primary">Cache</h1>
	<p class="text-sm text-text-secondary">Manage disk caches used by the application. Click a cache type for detailed settings.</p>

	<div class="space-y-3">
		{#each providers as provider}
			{@const IconComponent = iconMap[provider.icon] ?? Database}
			<a
				href="/settings/cache/{provider.id}"
				class="group flex items-center gap-4 rounded-xl border border-border bg-bg-elevated p-5 transition-colors hover:border-accent/30 hover:bg-bg-elevated/80"
			>
				<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10">
					<IconComponent size={20} class="text-accent" />
				</div>

				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<p class="text-sm font-semibold text-text-primary">{provider.name}</p>
						{#if provider.totalSizeBytes !== undefined}
							<span class="rounded-full bg-overlay-subtle px-2 py-0.5 text-[10px] font-medium text-text-muted">
								{formatBytes(provider.totalSizeBytes)}
							</span>
						{/if}
						{#if provider.entryCount !== undefined}
							<span class="rounded-full bg-overlay-subtle px-2 py-0.5 text-[10px] font-medium text-text-muted">
								{provider.entryCount.toLocaleString()} entries
							</span>
						{/if}
					</div>
					<p class="mt-0.5 text-xs text-text-secondary">{provider.description}</p>
				</div>

				<ChevronRight size={16} class="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
			</a>
		{/each}
	</div>
</div>
