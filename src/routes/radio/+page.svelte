<script lang="ts">
	import { internetRadio } from '$lib/data/stations';
	import { Play, Globe } from 'lucide-svelte';
</script>

<section>
	<h1 class="mb-6 text-2xl font-bold">Internet Radio</h1>

	<div class="flex flex-col gap-1">
		{#each internetRadio as station}
			<div class="group flex items-center gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-bg-hover">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent/20 to-bg-highlight">
					<Globe size={18} class="text-accent" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium text-text-primary">{station.name}</p>
					<p class="text-xs text-text-secondary">{station.description}</p>
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
