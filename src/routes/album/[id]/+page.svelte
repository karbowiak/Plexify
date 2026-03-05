<script lang="ts">
	import { page } from '$app/state';
	import { resolveEntityBackend } from '$lib/stores/backendStore.svelte';
	import type { Album, Track } from '$lib/backends/types';
	import { formatDuration, formatNumber } from '$lib/utils/format';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import { Play, Shuffle, Loader2 } from 'lucide-svelte';
	import { playTracksNow, shuffleQueue } from '$lib/stores/unifiedQueue.svelte';
	import { playCurrentItem } from '$lib/stores/playerStore.svelte';

	let id = $derived(page.params.id ?? '');

	let album = $state<Album | null>(null);
	let tracks = $state<Track[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

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

	$effect(() => {
		const entityId = id;
		if (!entityId) {
			loading = false;
			return;
		}

		const b = resolveEntityBackend(entityId);
		if (!b) {
			error = 'No backend found for this album';
			loading = false;
			return;
		}

		loading = true;
		error = null;
		album = null;
		tracks = [];

		Promise.all([b.getAlbum?.(entityId), b.getAlbumTracks?.(entityId)])
			.then(([alb, trks]) => {
				album = alb ?? null;
				tracks = trks ?? [];
			})
			.catch((e: any) => {
				error = e.message ?? 'Failed to load album';
			})
			.finally(() => {
				loading = false;
			});
	});
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
{:else if album}
	<section>
		<PageHeader
			title={album.title}
			type="Album"
			subtitle={album.artistName}
			subtitleHref="/artist/{album.artistId}"
			meta="{album.year ?? 'Unknown year'} · {album.trackCount} tracks{album.extra.fans && typeof album.extra.fans === 'number' && album.extra.fans > 0 ? ` · ${formatNumber(album.extra.fans)} fans` : ''}"
			imageUrl={album.thumb ?? undefined}
		/>

		<!-- Action buttons -->
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
		</div>

		<!-- Track listing -->
		<div>
			{#each tracks as track, i}
				<TrackRow
					number={track.trackNumber ?? i + 1}
					title={track.title}
					artist={track.artistName}
					artistId={track.artistId}
					duration={formatDuration(track.duration)}
					onclick={() => playFromIndex(i)}
				/>
			{/each}
		</div>
	</section>
{:else}
	<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
		<p class="text-lg">No backend connected</p>
		<a href="/settings/backends" class="text-sm text-accent hover:underline">Connect a backend</a>
	</div>
{/if}
