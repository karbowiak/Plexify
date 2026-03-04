<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import { tracks } from '$lib/data/tracks';
</script>

<section>
	<PageHeader
		title="Liked Songs"
		type="Playlist"
		subtitle="Your favorite tracks"
		meta="{tracks.length} songs"
		gradient="from-purple-900/30 via-bg-surface to-bg-surface"
	/>

	<div class="mt-6">
		{#each tracks as track, i}
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
