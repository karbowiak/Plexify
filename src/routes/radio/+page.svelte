<script lang="ts">
	import { Globe, Heart, Clock, Map, Tag, ArrowLeft, Trash2 } from 'lucide-svelte';
	import type { RadioStation, RadioCountry, RadioTag } from '$lib/radio/types';
	import { countryFlag } from '$lib/radio/types';
	import { Capability } from '$lib/backends/types';
	import { getFirstBackendWithCapability, hasCapability } from '$lib/stores/backendStore.svelte';
	import StationCard from '$lib/components/radio/StationCard.svelte';
	import HorizontalScroller from '$lib/components/ui/HorizontalScroller.svelte';
	import {
		getFavorites,
		getRecentStations,
		clearRecent
	} from '$lib/stores/radioStore.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	type Tab = 'featured' | 'favorites' | 'recent' | 'country' | 'genre';
	const validTabs: Tab[] = ['featured', 'favorites', 'recent', 'country', 'genre'];

	// Derive state from URL query params
	let activeTab = $derived.by<Tab>(() => {
		const t = page.url.searchParams.get('tab');
		return validTabs.includes(t as Tab) ? (t as Tab) : 'featured';
	});

	// Featured
	let topVoted = $state<RadioStation[]>([]);
	let topClicked = $state<RadioStation[]>([]);
	let trending = $state<RadioStation[]>([]);
	let featuredLoading = $state(true);

	function getRadioBackend() {
		return getFirstBackendWithCapability(Capability.InternetRadio);
	}

	async function loadFeatured() {
		featuredLoading = true;
		try {
			const rb = getRadioBackend();
			if (!rb?.getTopRadioStations) return;
			const [voted, clicked, trend] = await Promise.all([
				rb.getTopRadioStations('topvote', 15),
				rb.getTopRadioStations('topclick', 15),
				rb.getTopRadioStations('lastchange', 15)
			]);
			topVoted = voted;
			topClicked = clicked;
			trending = trend;
		} catch {
			// silent
		}
		featuredLoading = false;
	}

	// Favorites & Recent (from store)
	let favorites = $derived(getFavorites());
	let recentStations = $derived(getRecentStations());

	// Countries
	let countries = $state<RadioCountry[]>([]);
	let countriesLoaded = $state(false);
	let countriesLoading = $state(false);
	let selectedCountry = $state<RadioCountry | null>(null);
	let countryStations = $state<RadioStation[]>([]);
	let countryStationsLoading = $state(false);

	async function loadCountries() {
		if (countriesLoaded) return;
		countriesLoading = true;
		try {
			const rb = getRadioBackend();
			if (!rb?.getRadioCountries) return;
			countries = await rb.getRadioCountries();
			countriesLoaded = true;
		} catch {
			// silent
		}
		countriesLoading = false;
	}

	async function selectCountry(country: RadioCountry) {
		goto(`/radio?tab=country&id=${encodeURIComponent(country.name)}`, { replaceState: false });
		selectedCountry = country;
		countryStationsLoading = true;
		try {
			const rb = getRadioBackend();
			countryStations = rb?.searchRadioStations
				? await rb.searchRadioStations({ country: country.name, limit: 30 })
				: [];
		} catch {
			countryStations = [];
		}
		countryStationsLoading = false;
	}

	// Genre / Tags
	let tags = $state<RadioTag[]>([]);
	let tagsLoaded = $state(false);
	let tagsLoading = $state(false);
	let selectedTag = $state<RadioTag | null>(null);
	let tagStations = $state<RadioStation[]>([]);
	let tagStationsLoading = $state(false);

	async function loadTags() {
		if (tagsLoaded) return;
		tagsLoading = true;
		try {
			const rb = getRadioBackend();
			if (!rb?.getRadioTags) return;
			tags = await rb.getRadioTags(100);
			tagsLoaded = true;
		} catch {
			// silent
		}
		tagsLoading = false;
	}

	async function selectTag(tag: RadioTag) {
		goto(`/radio?tab=genre&id=${encodeURIComponent(tag.name)}`, { replaceState: false });
		selectedTag = tag;
		tagStationsLoading = true;
		try {
			const rb = getRadioBackend();
			tagStations = rb?.searchRadioStations
				? await rb.searchRadioStations({ tag: tag.name, limit: 30 })
				: [];
		} catch {
			tagStations = [];
		}
		tagStationsLoading = false;
	}

	function switchTab(tab: Tab) {
		goto(`/radio?tab=${tab}`, { replaceState: false });
		if (tab === 'featured' && topVoted.length === 0) loadFeatured();
		if (tab === 'country') loadCountries();
		if (tab === 'genre') loadTags();
	}

	// Sync sub-page state from URL on navigation (back/forward)
	$effect(() => {
		const tab = activeTab;
		const id = page.url.searchParams.get('id');

		if (tab === 'featured' && topVoted.length === 0) loadFeatured();
		if (tab === 'country') {
			loadCountries();
			if (id && (!selectedCountry || selectedCountry.name !== id)) {
				// Re-select country from URL
				const found = countries.find((c) => c.name === id);
				if (found) {
					selectedCountry = found;
					countryStationsLoading = true;
					const rb = getRadioBackend();
					if (rb?.searchRadioStations) {
						rb.searchRadioStations({ country: found.name, limit: 30 })
							.then((s) => (countryStations = s))
							.catch(() => (countryStations = []))
							.finally(() => (countryStationsLoading = false));
					} else {
						countryStationsLoading = false;
					}
				}
			} else if (!id) {
				selectedCountry = null;
				countryStations = [];
			}
		}
		if (tab === 'genre') {
			loadTags();
			if (id && (!selectedTag || selectedTag.name !== id)) {
				const found = tags.find((t) => t.name === id);
				if (found) {
					selectedTag = found;
					tagStationsLoading = true;
					const rb = getRadioBackend();
					if (rb?.searchRadioStations) {
						rb.searchRadioStations({ tag: found.name, limit: 30 })
							.then((s) => (tagStations = s))
							.catch(() => (tagStations = []))
							.finally(() => (tagStationsLoading = false));
					} else {
						tagStationsLoading = false;
					}
				}
			} else if (!id) {
				selectedTag = null;
				tagStations = [];
			}
		}
	});

	let radioAvailable = $derived(hasCapability(Capability.InternetRadio));

	// Load featured on mount
	loadFeatured();

	const tabs: { id: Tab; label: string; icon: typeof Globe }[] = [
		{ id: 'featured', label: 'Featured', icon: Globe },
		{ id: 'favorites', label: 'Favorites', icon: Heart },
		{ id: 'recent', label: 'Recent', icon: Clock },
		{ id: 'country', label: 'By Country', icon: Map },
		{ id: 'genre', label: 'By Genre', icon: Tag }
	];
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

{#if !radioAvailable}
	<section class="flex flex-col items-center justify-center py-24 text-text-muted">
		<Globe size={64} class="mb-6 opacity-20" />
		<h2 class="mb-2 text-lg font-semibold text-text-primary">Internet Radio is not available</h2>
		<p class="mb-4 text-sm">Enable the Radio Browser backend in Settings to listen to internet radio stations.</p>
		<a href="/settings" class="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg-base transition-colors hover:bg-accent/90">
			Go to Settings
		</a>
	</section>
{:else}
<section class="min-w-0 overflow-x-hidden">
	<!-- Header -->
	<div class="relative mb-6 flex items-center gap-4">
		<div class="pointer-events-none absolute -top-6 -left-6 h-32 w-96 rounded-full bg-accent/[0.04] blur-3xl"></div>
		<div
			class="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-bg-highlight"
		>
			<Globe size={24} class="text-accent" />
		</div>
		<div class="relative">
			<h1 class="text-2xl font-bold text-text-primary">Internet Radio</h1>
			<p class="text-sm text-text-secondary">45,000+ stations worldwide</p>
		</div>
	</div>

	<!-- Tabs -->
		<div class="mb-5 flex gap-2">
			{#each tabs as tab}
				<button
					type="button"
					onclick={() => switchTab(tab.id)}
					class="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors {activeTab ===
					tab.id
						? 'bg-accent text-bg-base'
						: 'bg-bg-highlight text-text-secondary hover:text-text-primary'}"
				>
					<tab.icon size={14} />
					{tab.label}
				</button>
			{/each}
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'featured'}
			<HorizontalScroller title="Top Voted" loading={featuredLoading}>
				{#snippet skeleton()}
					{@render cardSkeleton()}
				{/snippet}
				{#each topVoted as station (station.uuid)}
					<div class="shrink-0" style:width="var(--scroller-item-width)">
						<StationCard {station} variant="card" />
					</div>
				{/each}
			</HorizontalScroller>
			<HorizontalScroller title="Most Popular" loading={featuredLoading}>
				{#snippet skeleton()}
					{@render cardSkeleton()}
				{/snippet}
				{#each topClicked as station (station.uuid)}
					<div class="shrink-0" style:width="var(--scroller-item-width)">
						<StationCard {station} variant="card" />
					</div>
				{/each}
			</HorizontalScroller>
			<HorizontalScroller title="Recently Changed" loading={featuredLoading}>
				{#snippet skeleton()}
					{@render cardSkeleton()}
				{/snippet}
				{#each trending as station (station.uuid)}
					<div class="shrink-0" style:width="var(--scroller-item-width)">
						<StationCard {station} variant="card" />
					</div>
				{/each}
			</HorizontalScroller>
		{:else if activeTab === 'favorites'}
			{#if favorites.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-text-muted">
					<Heart size={48} class="mb-4 opacity-30" />
					<p class="text-sm">No favorite stations yet</p>
					<p class="text-xs">Click the heart icon on any station to save it here</p>
				</div>
			{:else}
				<div class="grid gap-3" style:grid-template-columns="repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
					{#each favorites as station (station.uuid)}
						<StationCard {station} variant="card" />
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'recent'}
			{#if recentStations.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-text-muted">
					<Clock size={48} class="mb-4 opacity-30" />
					<p class="text-sm">No recently played stations</p>
					<p class="text-xs">Stations you play will appear here</p>
				</div>
			{:else}
				<div class="mb-3 flex justify-end">
					<button
						type="button"
						onclick={() => clearRecent()}
						class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
					>
						<Trash2 size={12} />
						Clear history
					</button>
				</div>
				<div class="grid gap-3" style:grid-template-columns="repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
					{#each recentStations as station (station.uuid)}
						<StationCard {station} variant="card" />
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'country'}
			{#if selectedCountry}
				<div class="mb-4">
					<button
						type="button"
						onclick={() => goto('/radio?tab=country')}
						class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
					>
						<ArrowLeft size={14} />
						Back to countries
					</button>
					<h2 class="mt-2 text-lg font-semibold text-text-primary">
						{countryFlag(selectedCountry.code)}
						{selectedCountry.name}
					</h2>
				</div>
				{#if countryStationsLoading}
					<div class="grid gap-3" style:grid-template-columns="repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
						{#each Array(6) as _}
							{@render cardSkeleton()}
						{/each}
					</div>
				{:else}
					<div class="grid gap-3" style:grid-template-columns="repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
						{#each countryStations as station (station.uuid)}
							<StationCard {station} variant="card" />
						{/each}
					</div>
				{/if}
			{:else if countriesLoading}
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each Array(20) as _}
						<div class="h-14 animate-pulse rounded-lg bg-bg-elevated"></div>
					{/each}
				</div>
			{:else}
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{#each countries as country}
						<button
							type="button"
							onclick={() => selectCountry(country)}
							class="flex items-center gap-3 rounded-lg bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-hover"
						>
							<span class="text-2xl">{countryFlag(country.code)}</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm text-text-primary">{country.name}</p>
								<p class="text-xs text-text-muted">
									{country.station_count.toLocaleString()} stations
								</p>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'genre'}
			{#if selectedTag}
				<div class="mb-4">
					<button
						type="button"
						onclick={() => goto('/radio?tab=genre')}
						class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
					>
						<ArrowLeft size={14} />
						Back to genres
					</button>
					<h2 class="mt-2 text-lg font-semibold text-text-primary capitalize">
						{selectedTag.name}
					</h2>
				</div>
				{#if tagStationsLoading}
					<div class="grid gap-3" style:grid-template-columns="repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
						{#each Array(6) as _}
							{@render cardSkeleton()}
						{/each}
					</div>
				{:else}
					<div class="grid gap-3" style:grid-template-columns="repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
						{#each tagStations as station (station.uuid)}
							<StationCard {station} variant="card" />
						{/each}
					</div>
				{/if}
			{:else if tagsLoading}
				<div class="flex flex-wrap gap-2">
					{#each Array(30) as _}
						<div class="h-8 w-24 animate-pulse rounded-full bg-bg-elevated"></div>
					{/each}
				</div>
			{:else}
				<div class="flex flex-wrap gap-2">
					{#each tags as tag}
						<button
							type="button"
							onclick={() => selectTag(tag)}
							class="rounded-full bg-bg-elevated px-3 py-1.5 text-sm transition-colors hover:bg-bg-hover"
						>
							<span class="capitalize text-text-primary">{tag.name}</span>
							<span class="ml-1 text-xs text-text-muted">
								{tag.station_count.toLocaleString()}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
</section>
{/if}
