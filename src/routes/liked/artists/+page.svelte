<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import { artists } from '$lib/data/artists';
</script>

<section>
	<h1 class="mb-6 text-2xl font-bold">Liked Artists</h1>

	<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
		{#each artists as artist}
			<a href="/artist/{artist.id}" class="contents">
				<Card title={artist.name} subtitle={artist.genres.join(', ')} rounded compact />
			</a>
		{/each}
	</div>
</section>
