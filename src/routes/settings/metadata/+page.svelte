<script lang="ts">
	import { getMetadata, setMetadata } from '$lib/stores/configStore.svelte';

	let config = $derived(getMetadata());
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-text-primary">Metadata</h1>

	<div class="rounded-xl border border-border bg-bg-elevated">
		<h2 class="px-6 pt-5 pb-3 text-sm font-semibold text-accent">Sources</h2>

		<!-- Preferred Source -->
		<div class="px-6 py-4 pb-5">
			<p class="mb-1 text-sm font-medium text-text-primary">Preferred Source</p>
			<p class="mb-3 text-xs text-text-secondary">
				Primary source for artist bios, album descriptions, and artwork.
			</p>
			<select
				value={config.preferredSource}
				onchange={(e) => setMetadata({ preferredSource: e.currentTarget.value })}
				class="h-9 w-full max-w-xs rounded-md border border-border bg-bg-highlight px-3 text-sm text-text-primary focus:border-accent/30 focus:outline-none focus:ring-1 focus:ring-accent/40"
			>
				<option value="plex">Plex</option>
				<option value="lastfm">Last.fm</option>
				<option value="deezer">Deezer</option>
			</select>
		</div>
	</div>
</div>
