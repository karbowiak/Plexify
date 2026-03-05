<script lang="ts">
	import { page } from '$app/state';
	import Card from '$lib/components/ui/Card.svelte';
	import CachedImage from '$lib/components/ui/CachedImage.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import { Search, Loader2 } from 'lucide-svelte';
	import type { Track as BackendTrack, Album as BackendAlbum, Artist as BackendArtist } from '$lib/backends/types';
	import { Capability } from '$lib/backends/types';
	import { getFirstBackendWithCapability } from '$lib/stores/backendStore.svelte';
	import { formatDuration } from '$lib/utils/format';

	let query = $derived(page.url.searchParams.get('q') ?? '');

	let matchedArtists = $state<BackendArtist[]>([]);
	let matchedAlbums = $state<BackendAlbum[]>([]);
	let matchedTracks = $state<BackendTrack[]>([]);
	let loading = $state(false);

	$effect(() => {
		const q = query.trim();
		if (!q) {
			matchedArtists = [];
			matchedAlbums = [];
			matchedTracks = [];
			loading = false;
			return;
		}
		loading = true;
		const mb = getFirstBackendWithCapability(Capability.Search);
		if (!mb?.search) {
			loading = false;
			return;
		}
		mb.search(q).then((res) => {
			matchedArtists = res.artists;
			matchedAlbums = res.albums;
			matchedTracks = res.tracks;
		}).catch(() => {
			matchedArtists = [];
			matchedAlbums = [];
			matchedTracks = [];
		}).finally(() => {
			loading = false;
		});
	});
</script>

<section>
	{#if !query}
		<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
			<Search size={48} strokeWidth={1} />
			<p class="text-lg">Search for artists, albums, or songs</p>
		</div>
	{:else if loading}
		<h1 class="mb-6 text-2xl font-bold">Results for "{query}"</h1>
		<div class="flex items-center justify-center py-24">
			<Loader2 size={32} class="animate-spin text-text-muted" />
		</div>
	{:else}
		<h1 class="mb-6 text-2xl font-bold">Results for "{query}"</h1>

		{#if matchedArtists.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Artists</h2>
				<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
					{#each matchedArtists as artist (artist.id)}
						<a href="/artist/{artist.id}" class="contents">
							<Card title={artist.title} subtitle={artist.genres.join(', ')} imageUrl={artist.thumb ?? undefined} rounded compact />
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if matchedAlbums.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Albums</h2>
				<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
					{#each matchedAlbums as album (album.id)}
						<a href="/album/{album.id}" class="contents">
							<Card title={album.title} subtitle="{album.artistName} · {album.year ?? ''}" imageUrl={album.thumb ?? undefined} compact />
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if matchedTracks.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Songs</h2>
				{#each matchedTracks as track, i (track.id)}
					<!-- @TODO: hook up track playback once audio engine is built -->
					<TrackRow
						number={i + 1}
						title={track.title}
						artist={track.artistName}
						artistId={track.artistId}
						album={track.albumName}
						albumId={track.albumId}
						duration={formatDuration(track.duration)}
					/>
				{/each}
			</section>
		{/if}

		{#if matchedArtists.length === 0 && matchedAlbums.length === 0 && matchedTracks.length === 0}
			<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
				<Search size={48} strokeWidth={1} />
				<p class="text-lg">No results found for "{query}"</p>
			</div>
		{/if}
	{/if}
</section>
