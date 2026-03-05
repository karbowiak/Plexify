<script lang="ts">
	import { Play, Pause, Check, Podcast as PodcastIcon } from 'lucide-svelte';
	import CachedImage from '$lib/components/ui/CachedImage.svelte';
	import type { PodcastEpisode } from '$lib/podcast/types';

	let {
		episode,
		podcastArtwork,
		isPlaying = false,
		progress = 0,
		isCompleted = false,
		onplay
	}: {
		episode: PodcastEpisode;
		podcastArtwork: string;
		isPlaying?: boolean;
		progress?: number;
		isCompleted?: boolean;
		onplay: () => void;
	} = $props();

	let imgUrl = $derived(episode.artwork_url || podcastArtwork);

	function formatDuration(secs: number): string {
		if (!secs) return '';
		const h = Math.floor(secs / 3600);
		const m = Math.floor((secs % 3600) / 60);
		if (h > 0) return `${h}h ${m}m`;
		return `${m}m`;
	}

	function formatDate(dateStr: string): string {
		try {
			const d = new Date(dateStr);
			return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return dateStr;
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-hover"
	onclick={onplay}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') onplay();
	}}
	role="button"
	tabindex="0"
>
	<!-- Episode artwork -->
	<div class="relative h-10 w-10 shrink-0 overflow-hidden rounded">
		<CachedImage
			src={imgUrl}
			alt=""
			class="h-full w-full object-cover"
		>
			{#snippet fallback()}
				<div class="flex h-full w-full items-center justify-center bg-bg-highlight">
					<PodcastIcon size={16} class="text-text-muted" />
				</div>
			{/snippet}
		</CachedImage>
	</div>

	<!-- Info -->
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium {isPlaying ? 'text-accent' : 'text-text-primary'}">
			{#if episode.episode_number}
				<span class="text-text-muted">E{episode.episode_number}</span>
			{/if}
			{episode.title}
		</p>
		<div class="flex items-center gap-2 text-xs text-text-secondary">
			<span>{formatDate(episode.pub_date)}</span>
			{#if episode.duration_secs}
				<span>·</span>
				<span>{formatDuration(episode.duration_secs)}</span>
			{/if}
		</div>
	</div>

	<!-- Status / Controls -->
	<div class="flex shrink-0 items-center gap-2">
		{#if isCompleted}
			<span class="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent">
				<Check size={12} />
			</span>
		{/if}
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center rounded-full transition-all {isPlaying
				? 'bg-accent text-bg-base'
				: 'bg-accent text-bg-base opacity-0 group-hover:opacity-100'}"
			onclick={(e) => {
				e.stopPropagation();
				onplay();
			}}
		>
			{#if isPlaying}
				<Pause size={14} fill="currentColor" />
			{:else}
				<Play size={14} fill="currentColor" class="ml-0.5" />
			{/if}
		</button>
	</div>

	<!-- Progress bar -->
	{#if progress > 0 && progress < 1}
		<div class="absolute right-3 bottom-0 left-16 h-0.5 rounded-full bg-bg-highlight">
			<div class="h-full rounded-full bg-accent" style:width="{progress * 100}%"></div>
		</div>
	{/if}
</div>
