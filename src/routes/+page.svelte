<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import { quickAccess, recentlyPlayed, madeForYou } from '$lib/data/home';
</script>

<section>
	<div class="relative mb-6">
		<div class="pointer-events-none absolute -top-6 -left-6 h-32 w-96 rounded-full bg-accent/[0.04] blur-3xl"></div>
		<h1 class="relative text-3xl font-bold">Good evening</h1>
	</div>

	<!-- Quick access grid -->
	<div class="mb-8 grid grid-cols-3 gap-3">
		{#each quickAccess as item}
			<button
				type="button"
				class="group flex items-center overflow-hidden rounded-md bg-bg-highlight/40 text-left transition-colors hover:bg-bg-hover"
			>
				<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-l-md bg-gradient-to-br from-accent/30 via-accent/10 to-bg-highlight">
					<span class="text-lg">&#9835;</span>
				</div>
				<span class="truncate px-4 text-sm font-semibold">{item.title}</span>
			</button>
		{/each}
	</div>

	<!-- Recently played -->
	<section class="mb-8">
		<h2 class="mb-4 text-xl font-bold">Recently played</h2>
		<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
			{#each recentlyPlayed as album}
				<Card title={album.title} subtitle={album.artist} compact />
			{/each}
		</div>
	</section>

	<!-- Made for you -->
	<section>
		<h2 class="mb-4 text-xl font-bold">Made for you</h2>
		<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(calc(160px * var(--card-scale, 1)), 1fr))">
			{#each madeForYou as mix}
				<Card title={mix.title} subtitle={mix.desc} compact />
			{/each}
		</div>
	</section>
</section>
