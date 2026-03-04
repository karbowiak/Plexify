<script lang="ts">
	import { page } from '$app/state';
	import Card from '$lib/components/ui/Card.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import { getArtistById, artists } from '$lib/data/artists';
	import { getAlbumsByArtist } from '$lib/data/albums';
	import { getTracksByArtist } from '$lib/data/tracks';
	import { Play, Shuffle } from 'lucide-svelte';

	let id = $derived(page.params.id ?? '');
	let artist = $derived(getArtistById(id));
	let artistAlbums = $derived(getAlbumsByArtist(id));
	let artistTracks = $derived(getTracksByArtist(id).slice(0, 5));
	let similarArtists = $derived(artists.filter((a) => a.id !== id).slice(0, 6));
</script>

{#if artist}
	<section>
		<!-- Hero -->
		<div class="flex items-end gap-6 bg-gradient-to-b from-bg-hover/50 via-bg-surface to-bg-surface -mx-6 -mt-6 px-6 pt-20 pb-6">
			<div class="flex h-48 w-48 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight shadow-xl">
				<span class="text-6xl text-text-muted">&#9835;</span>
			</div>
			<div class="min-w-0">
				<p class="mb-1 text-xs font-bold uppercase tracking-wider text-text-secondary">Artist</p>
				<h1 class="mb-2 text-5xl font-extrabold leading-tight">{artist.name}</h1>
				<p class="text-sm text-text-secondary">{artist.genres.join(' · ')}</p>
			</div>
		</div>

		<!-- Action buttons -->
		<div class="mt-6 mb-8 flex items-center gap-4">
			<button
				type="button"
				class="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-bg-base shadow-lg shadow-glow-accent transition-transform hover:scale-105"
			>
				<Play size={20} fill="currentColor" class="ml-0.5" />
			</button>
			<button
				type="button"
				class="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:text-text-primary hover:border-text-primary"
			>
				<Shuffle size={18} />
			</button>
		</div>

		<!-- Popular Tracks -->
		{#if artistTracks.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Popular</h2>
				{#each artistTracks as track, i}
					<TrackRow
						number={i + 1}
						title={track.title}
						artist={track.artist}
						album={track.album}
						albumId={track.albumId}
						duration={track.duration}
					/>
				{/each}
			</section>
		{/if}

		<!-- Discography -->
		{#if artistAlbums.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Discography</h2>
				<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
					{#each artistAlbums as album}
						<a href="/album/{album.id}" class="contents">
							<Card title={album.title} subtitle="{album.year} · {album.trackCount} tracks" compact />
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Fans Also Like -->
		<section class="mb-8">
			<h2 class="mb-4 text-xl font-bold">Fans Also Like</h2>
			<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
				{#each similarArtists as similar}
					<a href="/artist/{similar.id}" class="contents">
						<Card title={similar.name} subtitle={similar.genres[0]} rounded compact />
					</a>
				{/each}
			</div>
		</section>
	</section>
{:else}
	<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
		<p class="text-lg">Artist not found</p>
	</div>
{/if}
