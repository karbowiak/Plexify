<script lang="ts">
	import { closeCreatePlaylist } from '$lib/stores/uiStore.svelte';

	let name = $state('');

	function handleCreate() {
		if (name.trim()) {
			closeCreatePlaylist();
			name = '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeCreatePlaylist();
			name = '';
		} else if (e.key === 'Enter') {
			handleCreate();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
	onkeydown={handleKeydown}
	onclick={(e: MouseEvent) => { if (e.target === e.currentTarget) { closeCreatePlaylist(); name = ''; } }}
>
	<div class="w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-6 shadow-2xl">
		<h2 class="mb-4 text-lg font-bold text-text-primary">Create Playlist</h2>
		<input
			type="text"
			placeholder="Playlist name..."
			bind:value={name}
			class="mb-4 h-10 w-full rounded-lg border border-border bg-bg-highlight px-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/30 focus:outline-none focus:ring-1 focus:ring-accent/40"
		/>
		<div class="flex justify-end gap-3">
			<button
				type="button"
				onclick={() => { closeCreatePlaylist(); name = ''; }}
				class="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={handleCreate}
				disabled={!name.trim()}
				class="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-bg-base transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
			>
				Create
			</button>
		</div>
	</div>
</div>
