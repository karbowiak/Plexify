<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolveEntityBackend } from '$lib/stores/backendStore.svelte';
	import { bumpPlaylistVersion } from '$lib/stores/uiStore.svelte';
	import type { Playlist, Track } from '$lib/backends/types';
	import { Capability } from '$lib/backends/types';
	import { formatDuration } from '$lib/utils/format';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import { Play, Shuffle, Trash2, Loader2 } from 'lucide-svelte';
	import { playTracksNow, shuffleQueue } from '$lib/stores/unifiedQueue.svelte';
	import { playCurrentItem } from '$lib/stores/playerStore.svelte';

	let id = $derived(page.params.id ?? '');

	let playlist = $state<Playlist | null>(null);
	let tracks = $state<Track[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	$effect(() => {
		const entityId = id;
		if (!entityId) {
			loading = false;
			return;
		}

		const b = resolveEntityBackend(entityId);
		if (!b) {
			error = 'No backend found for this playlist';
			loading = false;
			return;
		}

		loading = true;
		error = null;
		playlist = null;
		tracks = [];

		Promise.all([
			b.getPlaylists?.() ?? Promise.resolve([]),
			b.getPlaylistTracks?.(entityId) ?? Promise.resolve({ items: [], total: 0 })
		])
			.then(([pls, result]) => {
				playlist = pls.find((p) => p.id === entityId) ?? null;
				tracks = result.items;
			})
			.catch((e: any) => {
				error = e.message ?? 'Failed to load playlist';
			})
			.finally(() => {
				loading = false;
			});
	});

	function playAll() {
		if (tracks.length === 0) return;
		playTracksNow(tracks, 0);
		playCurrentItem();
	}

	function shuffleAll() {
		if (tracks.length === 0) return;
		playTracksNow(tracks, 0);
		shuffleQueue();
		playCurrentItem();
	}

	function playFromIndex(i: number) {
		playTracksNow(tracks, i);
		playCurrentItem();
	}

	async function handleDelete() {
		const b = resolveEntityBackend(id);
		if (!b?.deletePlaylist) return;
		await b.deletePlaylist(id);
		bumpPlaylistVersion();
		goto('/');
	}
</script>

{#if loading}
	<div class="flex items-center justify-center py-24">
		<Loader2 size={32} class="animate-spin text-text-muted" />
	</div>
{:else if error}
	<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
		<p class="text-lg">{error}</p>
		<a href="/settings/backends" class="text-sm text-accent hover:underline">Manage backends</a>
	</div>
{:else if playlist}
	<section>
		<PageHeader
			title={playlist.title}
			type="Playlist"
			subtitle={playlist.description ?? ''}
			meta="{tracks.length} songs"
		/>

		<div class="mt-6 mb-6 flex items-center gap-4">
			<button
				type="button"
				onclick={playAll}
				class="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-bg-base shadow-lg shadow-glow-accent transition-transform hover:scale-105"
			>
				<Play size={20} fill="currentColor" class="ml-0.5" />
			</button>
			<button
				type="button"
				onclick={shuffleAll}
				class="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:text-text-primary hover:border-text-primary"
			>
				<Shuffle size={18} />
			</button>
			{#if resolveEntityBackend(id)?.supports(Capability.EditPlaylists)}
				<button
					type="button"
					onclick={handleDelete}
					class="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:text-red-400 hover:border-red-400"
				>
					<Trash2 size={18} />
				</button>
			{/if}
		</div>

		<div>
			{#each tracks as track, i}
				<TrackRow
					number={i + 1}
					title={track.title}
					artist={track.artistName}
					artistId={track.artistId}
					album={track.albumName}
					albumId={track.albumId}
					duration={formatDuration(track.duration)}
					onclick={() => playFromIndex(i)}
				/>
			{/each}
		</div>
	</section>
{:else}
	<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
		<p class="text-lg">Playlist not found</p>
	</div>
{/if}
