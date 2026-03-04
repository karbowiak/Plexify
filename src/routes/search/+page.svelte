<script lang="ts">
	import { page } from '$app/state';
	import Card from '$lib/components/ui/Card.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import { artists } from '$lib/data/artists';
	import { albums } from '$lib/data/albums';
	import { tracks } from '$lib/data/tracks';
	import { Search } from 'lucide-svelte';

	let query = $derived(page.url.searchParams.get('q') ?? '');
	let q = $derived(query.toLowerCase());

	let matchedArtists = $derived(q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : []);
	let matchedAlbums = $derived(q ? albums.filter((a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)) : []);
	let matchedTracks = $derived(q ? tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)) : []);
</script>

<section>
	{#if !query}
		<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
			<Search size={48} strokeWidth={1} />
			<p class="text-lg">Search for artists, albums, or songs</p>
		</div>
	{:else}
		<h1 class="mb-6 text-2xl font-bold">Results for "{query}"</h1>

		{#if matchedArtists.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Artists</h2>
				<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
					{#each matchedArtists as artist}
						<a href="/artist/{artist.id}" class="contents">
							<Card title={artist.name} subtitle={artist.genres.join(', ')} rounded compact />
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if matchedAlbums.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Albums</h2>
				<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
					{#each matchedAlbums as album}
						<a href="/album/{album.id}" class="contents">
							<Card title={album.title} subtitle="{album.artist} · {album.year}" compact />
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if matchedTracks.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Songs</h2>
				{#each matchedTracks as track, i}
					<TrackRow
						number={i + 1}
						title={track.title}
						artist={track.artist}
						artistId={track.artistId}
						album={track.album}
						albumId={track.albumId}
						duration={track.duration}
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
