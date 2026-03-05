<script lang="ts">
	import { getFirstBackendWithCapability } from '$lib/stores/backendStore.svelte';
	import { Capability } from '$lib/backends/types';
	import { Loader2 } from 'lucide-svelte';

	let genres = $state<{ tag: string; count: number | null }[]>([]);
	let loading = $state(true);

	$effect(() => {
		const b = getFirstBackendWithCapability(Capability.Tags);
		if (!b?.getTags) {
			loading = false;
			return;
		}

		b.getTags('genre').then((tags) => {
			genres = tags;
			loading = false;
		}).catch(() => {
			loading = false;
		});
	});
</script>

<section>
	<h1 class="mb-6 text-3xl font-extrabold">Genres</h1>

	{#if loading}
		<div class="flex items-center justify-center py-24">
			<Loader2 size={32} class="animate-spin text-text-muted" />
		</div>
	{:else if genres.length === 0}
		<p class="py-12 text-center text-text-muted">No genres available</p>
	{:else}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each genres as g}
				<a
					href="/genres/{encodeURIComponent(g.tag)}"
					class="group flex items-center justify-center rounded-lg bg-bg-elevated p-6 text-center font-semibold transition-all hover:bg-bg-hover hover:shadow-lg hover:shadow-black/20"
				>
					<span class="text-sm">{g.tag}</span>
				</a>
			{/each}
		</div>
	{/if}
</section>
