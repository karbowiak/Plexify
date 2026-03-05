<script lang="ts">
	import { Radio, Play, Square, Podcast, Music } from 'lucide-svelte';
	import CachedImage from '$lib/components/ui/CachedImage.svelte';
	import { countryFlag } from '$lib/radio/types';
	import type { RadioStation } from '$lib/radio/types';
	import type { Podcast as PodcastType } from '$lib/podcast/types';
	import type { Track as BackendTrack, Album as BackendAlbum, Artist as BackendArtist } from '$lib/backends/types';
	import { Capability } from '$lib/backends/types';
	import { getFirstBackendWithCapability, getBackendsWithCapability } from '$lib/stores/backendStore.svelte';
	import { playRadioNow, getCurrentItem, getActiveMediaType } from '$lib/stores/unifiedQueue.svelte';
	import { getState, playCurrentItem, stopPlayback } from '$lib/stores/playerStore.svelte';
	import { formatDuration } from '$lib/utils/format';
	import { goto } from '$app/navigation';

	interface Props {
		query: string;
	}

	let { query }: Props = $props();

	// Music search (async via backend)
	let matchedArtists = $state<BackendArtist[]>([]);
	let matchedAlbums = $state<BackendAlbum[]>([]);
	let matchedTracks = $state<BackendTrack[]>([]);
	let musicLoading = $state(false);

	$effect(() => {
		const searchQ = query.trim();
		if (!searchQ) {
			matchedArtists = []; matchedAlbums = []; matchedTracks = [];
			musicLoading = false;
			return;
		}
		musicLoading = true;
		const timeout = setTimeout(async () => {
			try {
				const mb = getFirstBackendWithCapability(Capability.Search);
				if (mb?.search) {
					const res = await mb.search(searchQ);
					matchedArtists = res.artists.slice(0, 4);
					matchedAlbums = res.albums.slice(0, 4);
					matchedTracks = res.tracks.slice(0, 4);
				} else {
					matchedArtists = []; matchedAlbums = []; matchedTracks = [];
				}
			} catch {
				matchedArtists = []; matchedAlbums = []; matchedTracks = [];
			}
			musicLoading = false;
		}, 300);
		return () => clearTimeout(timeout);
	});

	// Radio station search (async)
	let radioResults = $state<RadioStation[]>([]);
	let radioLoading = $state(false);

	$effect(() => {
		const searchQ = query.trim();
		if (!searchQ) {
			radioResults = [];
			radioLoading = false;
			return;
		}
		radioLoading = true;
		const timeout = setTimeout(async () => {
			try {
				const rb = getFirstBackendWithCapability(Capability.InternetRadio);
				radioResults = rb?.searchRadioStations
					? await rb.searchRadioStations({ name: searchQ, limit: 4 })
					: [];
			} catch {
				radioResults = [];
			}
			radioLoading = false;
		}, 400);
		return () => clearTimeout(timeout);
	});

	// Podcast search (async)
	let podcastResults = $state<PodcastType[]>([]);
	let podcastLoading = $state(false);

	$effect(() => {
		const searchQ = query.trim();
		if (!searchQ) {
			podcastResults = [];
			podcastLoading = false;
			return;
		}
		podcastLoading = true;
		const timeout = setTimeout(async () => {
			try {
				const pb = getFirstBackendWithCapability(Capability.Podcasts);
				podcastResults = pb?.searchPodcasts
					? await pb.searchPodcasts(searchQ, 4)
					: [];
			} catch {
				podcastResults = [];
			}
			podcastLoading = false;
		}, 400);
		return () => clearTimeout(timeout);
	});

	let currentItem = $derived(getCurrentItem());
	let mediaType = $derived(getActiveMediaType());
	let playState = $derived(getState());

	function isStationPlaying(station: RadioStation): boolean {
		return mediaType === 'radio' && currentItem?.type === 'radio' && currentItem.data.uuid === station.uuid && playState === 'playing';
	}

	function isStationActive(station: RadioStation): boolean {
		return mediaType === 'radio' && currentItem?.type === 'radio' && currentItem.data.uuid === station.uuid;
	}

	function handleStationClick(station: RadioStation) {
		if (isStationPlaying(station)) {
			stopPlayback();
		} else {
			playRadioNow(station);
			playCurrentItem();
			const backends = getBackendsWithCapability(Capability.InternetRadio);
			const rb = backends.find((b) => b.id === station.backendId) ?? backends[0];
			rb?.registerRadioClick?.(station.uuid);
		}
	}

	function handlePodcastClick(podcast: PodcastType) {
		goto(`/podcasts/${btoa(podcast.feed_url)}`);
	}

	function handleTrackClick(track: BackendTrack) {
		//@TODO: hook up track playback once audio engine is built
		goto(`/album/${track.albumId}`);
	}

	let hasResults = $derived(matchedArtists.length > 0 || matchedAlbums.length > 0 || matchedTracks.length > 0 || radioResults.length > 0 || podcastResults.length > 0);
	let isOnlyLoading = $derived(!hasResults && (musicLoading || radioLoading || podcastLoading));
</script>

<div class="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-bg-elevated shadow-xl overflow-hidden z-50 max-h-96 overflow-y-auto">
	{#if !hasResults && !isOnlyLoading}
		<p class="px-4 py-3 text-sm text-text-muted">No results for "{query}"</p>
	{:else}
		{#if matchedArtists.length > 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Artists</p>
			</div>
			{#each matchedArtists as artist (artist.id)}
				<a href="/artist/{artist.id}" class="flex items-center gap-3 px-3 py-2 text-sm hover:bg-bg-hover transition-colors">
					<div class="h-8 w-8 shrink-0 overflow-hidden rounded-full">
						<CachedImage src={artist.thumb} alt="" class="h-full w-full object-cover">
							{#snippet fallback()}
								<div class="h-full w-full rounded-full bg-gradient-to-br from-bg-highlight to-bg-hover"></div>
							{/snippet}
						</CachedImage>
					</div>
					<span class="truncate text-text-primary">{artist.title}</span>
					<span class="ml-auto text-xs text-text-muted">Artist</span>
				</a>
			{/each}
		{/if}

		{#if matchedAlbums.length > 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Albums</p>
			</div>
			{#each matchedAlbums as album (album.id)}
				<a href="/album/{album.id}" class="flex items-center gap-3 px-3 py-2 text-sm hover:bg-bg-hover transition-colors">
					<div class="h-8 w-8 shrink-0 overflow-hidden rounded">
						<CachedImage src={album.thumb} alt="" class="h-full w-full object-cover">
							{#snippet fallback()}
								<div class="h-full w-full rounded bg-gradient-to-br from-bg-highlight to-bg-hover"></div>
							{/snippet}
						</CachedImage>
					</div>
					<div class="min-w-0">
						<p class="truncate text-text-primary">{album.title}</p>
						<p class="truncate text-xs text-text-muted">{album.artistName}</p>
					</div>
					<span class="ml-auto text-xs text-text-muted">Album</span>
				</a>
			{/each}
		{/if}

		{#if matchedTracks.length > 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Songs</p>
			</div>
			{#each matchedTracks as track (track.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-bg-hover"
					onclick={() => handleTrackClick(track)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTrackClick(track); }}
					role="button"
					tabindex="0"
				>
					<div class="h-8 w-8 shrink-0 overflow-hidden rounded">
						<CachedImage src={track.thumb} alt="" class="h-full w-full object-cover">
							{#snippet fallback()}
								<div class="h-full w-full rounded bg-gradient-to-br from-bg-highlight to-bg-hover"></div>
							{/snippet}
						</CachedImage>
					</div>
					<div class="min-w-0">
						<p class="truncate text-text-primary">{track.title}</p>
						<p class="truncate text-xs text-text-muted">{track.artistName} · {track.albumName}</p>
					</div>
					<span class="ml-auto text-xs text-text-muted">{formatDuration(track.duration)}</span>
				</div>
			{/each}
		{/if}

		{#if musicLoading && matchedArtists.length === 0 && matchedAlbums.length === 0 && matchedTracks.length === 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Music</p>
			</div>
			<div class="px-4 py-2">
				<div class="h-3 w-24 animate-pulse rounded bg-bg-highlight"></div>
			</div>
		{/if}

		{#if radioResults.length > 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Radio Stations</p>
			</div>
			{#each radioResults as station (station.uuid)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-bg-hover"
					onclick={() => handleStationClick(station)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStationClick(station); }}
					role="button"
					tabindex="0"
				>
					<div class="h-8 w-8 shrink-0 overflow-hidden rounded">
						<CachedImage
							src={station.favicon}
							alt=""
							class="h-full w-full object-cover"
						>
							{#snippet fallback()}
								<div class="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-accent/20 to-bg-hover">
									<Radio size={14} class="text-accent" />
								</div>
							{/snippet}
						</CachedImage>
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate {isStationActive(station) ? 'text-accent' : 'text-text-primary'}">{station.name}</p>
						<p class="truncate text-xs text-text-muted">
							{#if station.country_code}{countryFlag(station.country_code)} {/if}{station.tags.slice(0, 2).join(', ')}
						</p>
					</div>
					<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {isStationPlaying(station) ? 'bg-accent text-bg-base' : 'text-text-muted'}">
						{#if isStationPlaying(station)}
							<Square size={10} fill="currentColor" />
						{:else}
							<Play size={12} fill="currentColor" class="ml-0.5" />
						{/if}
					</div>
				</div>
			{/each}
		{:else if radioLoading}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Radio Stations</p>
			</div>
			<div class="px-4 py-2">
				<div class="h-3 w-24 animate-pulse rounded bg-bg-highlight"></div>
			</div>
		{/if}

		{#if podcastResults.length > 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Podcasts</p>
			</div>
			{#each podcastResults as podcast (podcast.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-bg-hover"
					onclick={() => handlePodcastClick(podcast)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePodcastClick(podcast); }}
					role="button"
					tabindex="0"
				>
					<div class="h-8 w-8 shrink-0 overflow-hidden rounded">
						<CachedImage
							src={podcast.artwork_url}
							alt=""
							class="h-full w-full object-cover"
						>
							{#snippet fallback()}
								<div class="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-accent/20 to-bg-hover">
									<Podcast size={14} class="text-accent" />
								</div>
							{/snippet}
						</CachedImage>
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-text-primary">{podcast.title}</p>
						<p class="truncate text-xs text-text-muted">{podcast.author}</p>
					</div>
					<span class="ml-auto text-xs text-text-muted">Podcast</span>
				</div>
			{/each}
		{:else if podcastLoading}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Podcasts</p>
			</div>
			<div class="px-4 py-2">
				<div class="h-3 w-24 animate-pulse rounded bg-bg-highlight"></div>
			</div>
		{/if}
	{/if}
</div>
