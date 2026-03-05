<script lang="ts">
	import { Podcast as PodcastIcon } from 'lucide-svelte';
	import type { Podcast, PodcastCategory } from '$lib/podcast/types';
	import { Capability } from '$lib/backends/types';
	import { getFirstBackendWithCapability, hasCapability } from '$lib/stores/backendStore.svelte';
	import PodcastCard from '$lib/components/podcast/PodcastCard.svelte';
	import HorizontalScroller from '$lib/components/ui/HorizontalScroller.svelte';
	import { getSubscriptions } from '$lib/stores/podcastStore.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	// Subscriptions from store
	let subs = $derived(getSubscriptions());

	// Trending
	let trending = $state<Podcast[]>([]);
	let trendingLoading = $state(true);

	// Categories
	let categories = $state<PodcastCategory[]>([]);
	let categoriesLoading = $state(true);

	// Category results
	let selectedCategory = $derived(page.url.searchParams.get('cat'));
	let categoryResults = $state<Podcast[]>([]);
	let categoryResultsLoading = $state(false);

	function getPodcastBackend() {
		return getFirstBackendWithCapability(Capability.Podcasts);
	}

	async function loadTrending() {
		trendingLoading = true;
		try {
			const pb = getPodcastBackend();
			trending = pb?.getTrendingPodcasts ? await pb.getTrendingPodcasts(15) : [];
		} catch {
			// silent
		}
		trendingLoading = false;
	}

	async function loadCategories() {
		categoriesLoading = true;
		try {
			const pb = getPodcastBackend();
			categories = pb?.getPodcastCategories ? await pb.getPodcastCategories() : [];
		} catch {
			// silent
		}
		categoriesLoading = false;
	}

	async function loadCategoryResults(cat: string) {
		categoryResultsLoading = true;
		try {
			const pb = getPodcastBackend();
			categoryResults = pb?.getTrendingPodcasts ? await pb.getTrendingPodcasts(30, cat) : [];
		} catch {
			categoryResults = [];
		}
		categoryResultsLoading = false;
	}

	function selectCategory(cat: PodcastCategory) {
		goto(`/podcasts?cat=${encodeURIComponent(cat.name)}`, { replaceState: false });
	}

	function clearCategory() {
		goto('/podcasts', { replaceState: false });
	}

	// Load data on mount
	loadTrending();
	loadCategories();

	// React to category changes from URL
	$effect(() => {
		const cat = selectedCategory;
		if (cat) {
			loadCategoryResults(cat);
		} else {
			categoryResults = [];
		}
	});

	let podcastsAvailable = $derived(hasCapability(Capability.Podcasts));

	function navigateToPodcast(feedUrl: string) {
		goto(`/podcasts/${btoa(feedUrl)}`);
	}
</script>

{#snippet cardSkeleton()}
	<div class="animate-pulse rounded-md bg-bg-elevated p-2">
		<div class="aspect-square w-full rounded bg-bg-highlight"></div>
		<div class="mt-2 space-y-1.5">
			<div class="h-3 w-3/4 rounded bg-bg-highlight"></div>
			<div class="h-2.5 w-1/2 rounded bg-bg-highlight"></div>
		</div>
	</div>
{/snippet}

{#if !podcastsAvailable}
	<section class="flex flex-col items-center justify-center py-24 text-text-muted">
		<PodcastIcon size={64} class="mb-6 opacity-20" />
		<h2 class="mb-2 text-lg font-semibold text-text-primary">Podcasts are not available</h2>
		<p class="mb-4 text-sm">Enable the Podcast Index backend in Settings to browse and listen to podcasts.</p>
		<a href="/settings" class="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg-base transition-colors hover:bg-accent/90">
			Go to Settings
		</a>
	</section>
{:else}
<section class="min-w-0 overflow-x-hidden">
	<!-- Header -->
	<div class="relative mb-6 flex items-center gap-4">
		<div
			class="pointer-events-none absolute -top-6 -left-6 h-32 w-96 rounded-full bg-accent/[0.04] blur-3xl"
		></div>
		<div
			class="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-bg-highlight"
		>
			<PodcastIcon size={24} class="text-accent" />
		</div>
		<div class="relative">
			<h1 class="text-2xl font-bold text-text-primary">Podcasts</h1>
			<p class="text-sm text-text-secondary">Discover and subscribe to podcasts</p>
		</div>
	</div>

	<!-- Subscriptions -->
	{#if subs.length > 0}
		<HorizontalScroller title="Your Subscriptions" loading={false}>
			{#snippet skeleton()}
				{@render cardSkeleton()}
			{/snippet}
			{#each subs as sub (sub.feedUrl)}
				<div class="shrink-0" style:width="var(--scroller-item-width)">
					<PodcastCard podcast={sub} onclick={() => navigateToPodcast(sub.feedUrl)} />
				</div>
			{/each}
		</HorizontalScroller>
	{/if}

	<!-- Trending -->
	<HorizontalScroller title="Trending" loading={trendingLoading}>
		{#snippet skeleton()}
			{@render cardSkeleton()}
		{/snippet}
		{#each trending as podcast (podcast.id)}
			<div class="shrink-0" style:width="var(--scroller-item-width)">
				<PodcastCard {podcast} onclick={() => navigateToPodcast(podcast.feed_url)} />
			</div>
		{/each}
	</HorizontalScroller>

	<!-- Categories -->
	<div class="mb-2 mt-6">
		<h2 class="text-sm font-semibold text-text-primary">Categories</h2>
	</div>

	{#if categoriesLoading}
		<div class="flex flex-wrap gap-2">
			{#each Array(20) as _}
				<div class="h-8 w-24 animate-pulse rounded-full bg-bg-elevated"></div>
			{/each}
		</div>
	{:else}
		<div class="flex flex-wrap gap-2">
			{#each categories as cat (cat.id)}
				<button
					type="button"
					onclick={() => (selectedCategory === cat.name ? clearCategory() : selectCategory(cat))}
					class="rounded-full px-3 py-1.5 text-sm transition-colors {selectedCategory === cat.name
						? 'bg-accent text-bg-base'
						: 'bg-bg-elevated text-text-secondary hover:text-text-primary hover:bg-bg-hover'}"
				>
					{cat.name}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Category Results -->
	{#if selectedCategory}
		<div class="mt-4 mb-2">
			<h2 class="text-sm font-semibold text-text-primary">
				Trending in {selectedCategory}
			</h2>
		</div>
		{#if categoryResultsLoading}
			<div
				class="grid gap-3"
				style:grid-template-columns="repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))"
			>
				{#each Array(6) as _}
					{@render cardSkeleton()}
				{/each}
			</div>
		{:else if categoryResults.length === 0}
			<div class="flex flex-col items-center justify-center py-12 text-text-muted">
				<PodcastIcon size={48} class="mb-4 opacity-30" />
				<p class="text-sm">No podcasts found in this category</p>
			</div>
		{:else}
			<div
				class="grid gap-3"
				style:grid-template-columns="repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))"
			>
				{#each categoryResults as podcast (podcast.id)}
					<PodcastCard {podcast} onclick={() => navigateToPodcast(podcast.feed_url)} />
				{/each}
			</div>
		{/if}
	{/if}
</section>
{/if}
