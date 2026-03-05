<script lang="ts">
	import { page } from '$app/state';
	import { resolveEntityBackend, getBackendsWithCapability } from '$lib/stores/backendStore.svelte';
	import { Capability } from '$lib/backends/types';
	import type { Backend, Artist, Album, Track } from '$lib/backends/types';
	import { formatDuration, formatNumber } from '$lib/utils/format';
	import Card from '$lib/components/ui/Card.svelte';
	import HorizontalScroller from '$lib/components/ui/HorizontalScroller.svelte';
	import TrackRow from '$lib/components/ui/TrackRow.svelte';
	import CachedImage from '$lib/components/ui/CachedImage.svelte';
	import { Play, Shuffle, Loader2 } from 'lucide-svelte';
	import { playTracksNow, shuffleQueue } from '$lib/stores/unifiedQueue.svelte';
	import { playCurrentItem } from '$lib/stores/playerStore.svelte';

	let id = $derived(page.params.id ?? '');

	let artist = $state<Artist | null>(null);
	let albums = $state<Album[]>([]);
	let topTracks = $state<Track[]>([]);
	let related = $state<Artist[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	$effect(() => {
		const entityId = id;
		if (!entityId) {
			loading = false;
			return;
		}

		loading = true;
		error = null;
		artist = null;
		albums = [];
		topTracks = [];
		related = [];

		const directBackend = resolveEntityBackend(entityId);

		if (directBackend) {
			loadFromBackend(directBackend, entityId);
		} else {
			resolveByName(decodeURIComponent(entityId));
		}
	});

	async function loadFromBackend(b: Backend, artistId: string) {
		try {
			const [a, albs, tracks, rel] = await Promise.all([
				b.getArtist?.(artistId),
				b.getArtistAlbums?.(artistId),
				b.getArtistTopTracks?.(artistId, 10),
				b.getArtistRelated?.(artistId)
			]);
			artist = a ?? null;
			albums = albs ?? [];
			topTracks = tracks ?? [];
			related = rel ?? [];
		} catch (e: any) {
			error = e.message ?? 'Failed to load artist';
		}
		loading = false;
	}

	function playAll() {
		if (topTracks.length === 0) return;
		playTracksNow(topTracks, 0);
		playCurrentItem();
	}

	function shuffleAll() {
		if (topTracks.length === 0) return;
		playTracksNow(topTracks, 0);
		shuffleQueue();
		playCurrentItem();
	}

	function playFromIndex(i: number) {
		playTracksNow(topTracks, i);
		playCurrentItem();
	}

	async function playAlbum(albumId: string) {
		const b = resolveEntityBackend(albumId);
		if (!b?.getAlbumTracks) return;
		const albumTracks = await b.getAlbumTracks(albumId);
		if (albumTracks.length === 0) return;
		playTracksNow(albumTracks, 0);
		playCurrentItem();
	}

	async function playArtist(artistId: string) {
		const b = resolveEntityBackend(artistId);
		if (!b?.getArtistTopTracks) return;
		const tracks = await b.getArtistTopTracks(artistId);
		if (tracks.length === 0) return;
		playTracksNow(tracks, 0);
		playCurrentItem();
	}

	async function resolveByName(name: string) {
		const backends = getBackendsWithCapability(Capability.Search);
		for (const b of backends) {
			try {
				const res = await b.search!(name);
				const match = res.artists.find(
					(a) => a.title.toLowerCase() === name.toLowerCase()
				);
				if (match) {
					await loadFromBackend(b, match.id);
					return;
				}
			} catch {
				/* try next */
			}
		}
		error = 'Artist not found';
		loading = false;
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
{:else if artist}
	<section>
		<!-- Hero -->
		<div
			class="flex items-end gap-6 bg-gradient-to-b from-bg-hover/50 via-bg-surface to-bg-surface -mx-6 -mt-6 px-6 pt-20 pb-6"
		>
			<CachedImage
				src={artist.thumb}
				alt={artist.title}
				class="h-48 w-48 shrink-0 rounded-full object-cover shadow-xl"
			>
				{#snippet fallback()}
					<div
						class="flex h-48 w-48 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight shadow-xl"
					>
						<span class="text-6xl text-text-muted">&#9835;</span>
					</div>
				{/snippet}
			</CachedImage>
			<div class="min-w-0">
				<p class="mb-1 text-xs font-bold uppercase tracking-wider text-text-secondary">
					Artist
				</p>
				<h1 class="mb-2 text-5xl font-extrabold leading-tight">{artist.title}</h1>
				{#if artist.genres.length > 0}
					<p class="text-sm text-text-secondary">{artist.genres.join(' · ')}</p>
				{/if}
				{#if artist.extra.fanCount && typeof artist.extra.fanCount === 'number' && artist.extra.fanCount > 0}
					<p class="mt-1 text-xs text-text-muted">{formatNumber(artist.extra.fanCount)} fans</p>
				{/if}
			</div>
		</div>

		<!-- Action buttons -->
		<div class="mt-6 mb-8 flex items-center gap-4">
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

		<!-- Popular Tracks -->
		{#if topTracks.length > 0}
			<section class="mb-8">
				<h2 class="mb-4 text-xl font-bold">Popular</h2>
				{#each topTracks as track, i}
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
			</section>
		{/if}

		<!-- Discography -->
		{#if albums.length > 0}
			<HorizontalScroller title="Discography">
				{#each albums as alb}
					<div class="shrink-0" style:width="var(--scroller-item-width)">
						<a href="/album/{alb.id}" class="contents">
							<Card
								title={alb.title}
								subtitle="{alb.year ?? ''} · {alb.trackCount} tracks"
								imageUrl={alb.thumb ?? undefined}
								compact
								onplay={() => playAlbum(alb.id)}
							/>
						</a>
					</div>
				{/each}
			</HorizontalScroller>
		{/if}

		<!-- Fans Also Like -->
		{#if related.length > 0}
			<HorizontalScroller title="Fans Also Like">
				{#each related as similar}
					<div class="shrink-0" style:width="var(--scroller-item-width)">
						<a href="/artist/{similar.id}" class="contents">
							<Card
								title={similar.title}
								subtitle={similar.genres[0] ?? ''}
								imageUrl={similar.thumb ?? undefined}
								rounded
								compact
								onplay={() => playArtist(similar.id)}
							/>
						</a>
					</div>
				{/each}
			</HorizontalScroller>
		{/if}
	</section>
{:else}
	<div class="flex flex-col items-center justify-center gap-4 py-24 text-text-muted">
		<p class="text-lg">No backend connected</p>
		<a href="/settings/backends" class="text-sm text-accent hover:underline">Connect a backend</a>
	</div>
{/if}
