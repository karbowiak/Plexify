<script lang="ts">
	import { stations } from '$lib/data/stations';
	import { Play, Radio } from 'lucide-svelte';
</script>

<section>
	<h1 class="mb-6 text-2xl font-bold">Stations</h1>

	{#each ['artist', 'mood', 'genre', 'decade'] as type}
		{@const items = stations.filter((s) => s.type === type)}
		<section class="mb-8">
			<h2 class="mb-4 text-lg font-bold capitalize">{type} Stations</h2>
			<div class="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
				{#each items as station}
					<div class="group flex items-center gap-3 rounded-lg bg-bg-elevated p-4 transition-colors hover:bg-bg-hover">
						<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-bg-highlight">
							<Radio size={20} class="text-accent" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-text-primary">{station.name}</p>
							<p class="truncate text-xs text-text-secondary">{station.description}</p>
						</div>
						<button
							type="button"
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-bg-base opacity-0 transition-all group-hover:opacity-100 hover:bg-accent-hover hover:scale-105"
						>
							<Play size={14} fill="currentColor" />
						</button>
					</div>
				{/each}
			</div>
		</section>
	{/each}
</section>
