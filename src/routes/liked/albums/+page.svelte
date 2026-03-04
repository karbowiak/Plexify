<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import { albums } from '$lib/data/albums';
</script>

<section>
	<h1 class="mb-6 text-2xl font-bold">Liked Albums</h1>

	<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
		{#each albums as album}
			<a href="/album/{album.id}" class="contents">
				<Card title={album.title} subtitle="{album.artist} · {album.year}" compact />
			</a>
		{/each}
	</div>
</section>
