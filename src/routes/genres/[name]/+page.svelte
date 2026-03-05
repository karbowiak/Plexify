<script lang="ts">
	import { page } from '$app/state';
	import { getFirstBackendWithCapability } from '$lib/stores/backendStore.svelte';
	import { Capability } from '$lib/backends/types';
	import type { Artist, Album } from '$lib/backends/types';
	import Card from '$lib/components/ui/Card.svelte';
	import { Loader2 } from 'lucide-svelte';
	import { playTracksNow } from '$lib/stores/unifiedQueue.svelte';
	import { playCurrentItem } from '$lib/stores/playerStore.svelte';
	import { resolveEntityBackend } from '$lib/stores/backendStore.svelte';

	let name = $derived(decodeURIComponent(page.params.name ?? ''));

	let artists = $state<Artist[]>([]);
	let albums = $state<Album[]>([]);
	let loading = $state(true);

	$effect(() => {
		const tag = name;
		if (!tag) {
			loading = false;
			return;
		}

		const b = getFirstBackendWithCapability(Capability.Tags);
		if (!b?.getTagItems) {
			loading = false;
			return;
		}

		loading = true;
		artists = [];
		albums = [];

		b.getTagItems(tag).then((res) => {
			artists = res.artists;
			albums = res.albums;
			loading = false;
		}).catch(() => {
			loading = false;
		});
	});

	async function playArtist(artistId: string) {
		const b = resolveEntityBackend(artistId);
		if (!b?.getArtistTopTracks) return;
		const tracks = await b.getArtistTopTracks(artistId);
		if (tracks.length === 0) return;
		playTracksNow(tracks, 0);
		playCurrentItem();
	}

	async function playAlbum(albumId: string) {
		const b = resolveEntityBackend(albumId);
		if (!b?.getAlbumTracks) return;
		const tracks = await b.getAlbumTracks(albumId);
		if (tracks.length === 0) return;
		playTracksNow(tracks, 0);
		playCurrentItem();
	}
</script>

<section>
	<h1 class="mb-6 text-3xl font-extrabold">{name}</h1>

	{#if loading}
		<div class="flex items-center justify-center py-24">
			<Loader2 size={32} class="animate-spin text-text-muted" />
		</div>
	{:else}
		{#if artists.length > 0}
			<h2 class="mb-4 text-xl font-bold">Artists</h2>
			<div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
				{#each artists as a}
					<a href="/artist/{a.id}" class="contents">
						<Card
							title={a.title}
							subtitle={a.genres[0] ?? ''}
							imageUrl={a.thumb ?? undefined}
							rounded
							compact
							onplay={() => playArtist(a.id)}
						/>
					</a>
				{/each}
			</div>
		{/if}

		{#if albums.length > 0}
			<h2 class="mb-4 text-xl font-bold">Albums</h2>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
				{#each albums as alb}
					<a href="/album/{alb.id}" class="contents">
						<Card
							title={alb.title}
							subtitle="{alb.year ?? ''} · {alb.artistName}"
							imageUrl={alb.thumb ?? undefined}
							compact
							onplay={() => playAlbum(alb.id)}
						/>
					</a>
				{/each}
			</div>
		{/if}

		{#if artists.length === 0 && albums.length === 0}
			<p class="py-12 text-center text-text-muted">No items found for this genre</p>
		{/if}
	{/if}
</section>
