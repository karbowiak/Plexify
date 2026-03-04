<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import { artists } from '$lib/data/artists';
	import { albums } from '$lib/data/albums';

	let tab = $state<'albums' | 'artists'>('albums');
</script>

<section>
	<h1 class="mb-4 text-2xl font-bold">Your Library</h1>

	<div class="mb-6 flex gap-2">
		<button
			type="button"
			onclick={() => tab = 'albums'}
			class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors {tab === 'albums' ? 'bg-accent text-bg-base' : 'bg-bg-highlight text-text-secondary hover:text-text-primary'}"
		>Albums</button>
		<button
			type="button"
			onclick={() => tab = 'artists'}
			class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors {tab === 'artists' ? 'bg-accent text-bg-base' : 'bg-bg-highlight text-text-secondary hover:text-text-primary'}"
		>Artists</button>
	</div>

	{#if tab === 'albums'}
		<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
			{#each albums as album}
				<a href="/album/{album.id}" class="contents">
					<Card title={album.title} subtitle="{album.artist} · {album.year}" compact />
				</a>
			{/each}
		</div>
	{:else}
		<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
			{#each artists as artist}
				<a href="/artist/{artist.id}" class="contents">
					<Card title={artist.name} subtitle={artist.genres.join(', ')} rounded compact />
				</a>
			{/each}
		</div>
	{/if}
</section>
