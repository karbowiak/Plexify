<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import { tracks } from '$lib/data/tracks';

	let slug = $derived(page.params.slug ?? '');

	let name = $derived(
		slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
	);

	// Cycle through demo tracks to fill the playlist
	let playlistTracks = $derived(
		Array.from({ length: 20 }, (_, i) => {
			const t = tracks[i % tracks.length];
			return { ...t, id: `pl-${i}` };
		})
	);
</script>

<section>
	<PageHeader
		title={name}
		type="Playlist"
		subtitle="Auto-generated playlist"
		meta="{playlistTracks.length} songs"
	/>

	<div class="mt-6">
		{#each playlistTracks as track, i}
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
	</div>
</section>
