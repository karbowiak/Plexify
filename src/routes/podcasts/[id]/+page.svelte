<script lang="ts">
	import {
		ArrowLeft,
		Podcast as PodcastIcon,
		Plus,
		Check,
		ChevronDown,
		ChevronUp
	} from 'lucide-svelte';
	import CachedImage from '$lib/components/ui/CachedImage.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { PodcastDetail, PodcastEpisode } from '$lib/podcast/types';
	import EpisodeRow from '$lib/components/podcast/EpisodeRow.svelte';
	import { Capability } from '$lib/backends/types';
	import { getFirstBackendWithCapability } from '$lib/stores/backendStore.svelte';
	import {
		subscribe,
		unsubscribe,
		isSubscribed,
		getEpisodeProgress,
		isCompleted
	} from '$lib/stores/podcastStore.svelte';
	import { playPodcastNow, getCurrentItem, getActiveMediaType } from '$lib/stores/unifiedQueue.svelte';
	import { getState, playCurrentItem, stopPlayback } from '$lib/stores/playerStore.svelte';

	let feedUrl = $derived.by(() => {
		try {
			return atob(page.params.id ?? '');
		} catch {
			return '';
		}
	});

	let detail = $state<PodcastDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let descExpanded = $state(false);

	let subscribed = $derived(feedUrl ? isSubscribed(feedUrl) : false);
	let currentItem = $derived(getCurrentItem());
	let mediaType = $derived(getActiveMediaType());
	let playState = $derived(getState());

	$effect(() => {
		const url = feedUrl;
		if (!url) return;
		loading = true;
		error = null;
		const pb = getFirstBackendWithCapability(Capability.Podcasts);
		if (!pb?.getPodcastFeed) {
			error = 'No podcast backend available';
			loading = false;
			return;
		}
		pb.getPodcastFeed(url)
			.then((d) => {
				detail = d;
			})
			.catch((e) => {
				error = e instanceof Error ? e.message : 'Failed to load podcast';
			})
			.finally(() => {
				loading = false;
			});
	});

	function toggleSubscribe() {
		if (!detail || !feedUrl) return;
		if (subscribed) {
			unsubscribe(feedUrl);
		} else {
			subscribe({
				feedUrl,
				podcastId: 0,
				title: detail.title,
				author: detail.author,
				artworkUrl: detail.artwork_url,
				addedAt: Date.now()
			});
		}
	}

	function isEpisodePlaying(episode: PodcastEpisode): boolean {
		return mediaType === 'podcast' && currentItem?.type === 'podcast' && currentItem.data.guid === episode.guid && playState === 'playing';
	}

	function handlePlay(episode: PodcastEpisode) {
		if (!detail || !feedUrl) return;
		if (isEpisodePlaying(episode)) {
			stopPlayback();
		} else {
			playPodcastNow(episode, feedUrl, detail.title, detail.artwork_url, detail.episodes);
			playCurrentItem();
		}
	}

	function episodeProgress(episode: PodcastEpisode): number {
		if (!feedUrl || !episode.duration_secs) return 0;
		const secs = getEpisodeProgress(feedUrl, episode.guid);
		return secs / episode.duration_secs;
	}

	function episodeCompleted(episode: PodcastEpisode): boolean {
		if (!feedUrl) return false;
		return isCompleted(feedUrl, episode.guid);
	}
</script>

<section class="min-w-0 overflow-x-hidden">
	<!-- Back button -->
	<button
		type="button"
		onclick={() => goto('/podcasts')}
		class="mb-4 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
	>
		<ArrowLeft size={14} />
		Back to Podcasts
	</button>

	{#if loading}
		<!-- Loading skeleton -->
		<div class="animate-pulse">
			<div class="flex gap-6">
				<div class="h-56 w-56 shrink-0 rounded-lg bg-bg-highlight"></div>
				<div class="flex-1 space-y-3 pt-4">
					<div class="h-6 w-2/3 rounded bg-bg-highlight"></div>
					<div class="h-4 w-1/3 rounded bg-bg-highlight"></div>
					<div class="h-3 w-full rounded bg-bg-highlight"></div>
					<div class="h-3 w-3/4 rounded bg-bg-highlight"></div>
				</div>
			</div>
			<div class="mt-8 space-y-3">
				{#each Array(5) as _}
					<div class="h-14 rounded-lg bg-bg-highlight"></div>
				{/each}
			</div>
		</div>
	{:else if error}
		<div class="flex flex-col items-center justify-center py-16 text-text-muted">
			<PodcastIcon size={48} class="mb-4 opacity-30" />
			<p class="text-sm">{error}</p>
		</div>
	{:else if detail}
		<!-- Hero -->
		<div class="relative mb-8">
			<!-- Blur background -->
			{#if detail.artwork_url}
				<div class="absolute inset-0 -top-16 -right-8 -left-8 overflow-hidden">
					<CachedImage
						src={detail.artwork_url}
						alt=""
						class="h-full w-full scale-110 object-cover opacity-15 blur-3xl"
					/>
				</div>
			{/if}

			<div class="relative flex gap-6">
				<!-- Artwork -->
				<div class="h-56 w-56 shrink-0 overflow-hidden rounded-lg shadow-lg">
					{#if detail.artwork_url}
						<CachedImage src={detail.artwork_url} alt="" class="h-full w-full object-cover" />
					{:else}
						<div
							class="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/20 to-bg-highlight"
						>
							<PodcastIcon size={64} class="text-text-muted" />
						</div>
					{/if}
				</div>

				<!-- Info -->
				<div class="flex min-w-0 flex-1 flex-col justify-center">
					<p class="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
						Podcast
					</p>
					<h1 class="mb-1 text-2xl font-bold text-text-primary">{detail.title}</h1>
					<p class="mb-3 text-sm text-text-secondary">{detail.author}</p>

					<!-- Description -->
					{#if detail.description}
						<div class="mb-3">
							<p
								class="text-xs leading-relaxed text-text-secondary {descExpanded
									? ''
									: 'line-clamp-3'}"
							>
								{detail.description}
							</p>
							{#if detail.description.length > 200}
								<button
									type="button"
									onclick={() => (descExpanded = !descExpanded)}
									class="mt-1 flex items-center gap-0.5 text-xs text-accent hover:underline"
								>
									{descExpanded ? 'Show less' : 'Show more'}
									{#if descExpanded}
										<ChevronUp size={12} />
									{:else}
										<ChevronDown size={12} />
									{/if}
								</button>
							{/if}
						</div>
					{/if}

					<!-- Category tags -->
					{#if detail.categories.length > 0}
						<div class="mb-3 flex flex-wrap gap-1.5">
							{#each detail.categories as cat}
								<span
									class="rounded-full bg-bg-highlight px-2 py-0.5 text-[10px] text-text-muted"
								>
									{cat}
								</span>
							{/each}
						</div>
					{/if}

					<!-- Actions -->
					<div class="flex items-center gap-3">
						<button
							type="button"
							onclick={toggleSubscribe}
							class="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors {subscribed
								? 'bg-accent/20 text-accent hover:bg-accent/30'
								: 'bg-accent text-bg-base hover:bg-accent-hover'}"
						>
							{#if subscribed}
								<Check size={16} />
								Subscribed
							{:else}
								<Plus size={16} />
								Subscribe
							{/if}
						</button>
						<span class="text-xs text-text-muted">
							{detail.episodes.length} episodes
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Episode list -->
		<div class="mb-2">
			<h2 class="text-sm font-semibold text-text-primary">Episodes</h2>
		</div>
		<div class="space-y-0.5">
			{#each detail.episodes as episode (episode.guid)}
				<EpisodeRow
					{episode}
					podcastArtwork={detail.artwork_url}
					isPlaying={isEpisodePlaying(episode)}
					progress={episodeProgress(episode)}
					isCompleted={episodeCompleted(episode)}
					onplay={() => handlePlay(episode)}
				/>
			{/each}
		</div>
	{/if}
</section>
