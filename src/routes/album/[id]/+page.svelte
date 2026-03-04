<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import { getAlbumById } from '$lib/data/albums';
	import { getTracksByAlbum } from '$lib/data/tracks';
	import { Play, Shuffle } from 'lucide-svelte';

	let id = $derived(page.params.id ?? '');
	let album = $derived(getAlbumById(id));
	let albumTracks = $derived(getTracksByAlbum(id));
</script>

{#if album}
	<section>
		<PageHeader
			title={album.title}
			type="Album"
			subtitle={album.artist}
			meta="{album.year} · {album.trackCount} tracks"
		/>

		<!-- Action buttons -->
		<div class="mt-6 mb-6 flex items-center gap-4">
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

		<!-- Track listing -->
		<div>
			{#each albumTracks as track}
				<TrackRow
					number={track.trackNumber}
					title={track.title}
					artist={track.artist}
					artistId={track.artistId}
					duration={track.duration}
				/>
			{/each}
		</div>
	</section>
{:else}
	<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
		<p class="text-lg">Album not found</p>
	</div>
{/if}
