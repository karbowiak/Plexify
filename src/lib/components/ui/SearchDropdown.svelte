<script lang="ts">
	import { artists } from '$lib/data/artists';
	import { albums } from '$lib/data/albums';
	import { tracks } from '$lib/data/tracks';

	interface Props {
		query: string;
	}

	let { query }: Props = $props();

	let q = $derived(query.toLowerCase());

	let matchedArtists = $derived(artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 4));
	let matchedAlbums = $derived(albums.filter((a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)).slice(0, 4));
	let matchedTracks = $derived(tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)).slice(0, 4));

	let hasResults = $derived(matchedArtists.length > 0 || matchedAlbums.length > 0 || matchedTracks.length > 0);
</script>

<div class="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-bg-elevated shadow-xl overflow-hidden z-50 max-h-80 overflow-y-auto">
	{#if !hasResults}
		<p class="px-4 py-3 text-sm text-text-muted">No results for "{query}"</p>
	{:else}
		{#if matchedArtists.length > 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Artists</p>
			</div>
			{#each matchedArtists as artist}
				<a href="/artist/{artist.id}" class="flex items-center gap-3 px-3 py-2 text-sm hover:bg-bg-hover transition-colors">
					<div class="h-8 w-8 rounded-full bg-gradient-to-br from-bg-highlight to-bg-hover shrink-0"></div>
					<span class="truncate text-text-primary">{artist.name}</span>
					<span class="ml-auto text-xs text-text-muted">Artist</span>
				</a>
			{/each}
		{/if}

		{#if matchedAlbums.length > 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Albums</p>
			</div>
			{#each matchedAlbums as album}
				<a href="/album/{album.id}" class="flex items-center gap-3 px-3 py-2 text-sm hover:bg-bg-hover transition-colors">
					<div class="h-8 w-8 rounded bg-gradient-to-br from-bg-highlight to-bg-hover shrink-0"></div>
					<div class="min-w-0">
						<p class="truncate text-text-primary">{album.title}</p>
						<p class="truncate text-xs text-text-muted">{album.artist}</p>
					</div>
					<span class="ml-auto text-xs text-text-muted">Album</span>
				</a>
			{/each}
		{/if}

		{#if matchedTracks.length > 0}
			<div class="px-3 pt-3 pb-1">
				<p class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Songs</p>
			</div>
			{#each matchedTracks as track}
				<a href="/album/{track.albumId}" class="flex items-center gap-3 px-3 py-2 text-sm hover:bg-bg-hover transition-colors">
					<div class="h-8 w-8 rounded bg-gradient-to-br from-bg-highlight to-bg-hover shrink-0"></div>
					<div class="min-w-0">
						<p class="truncate text-text-primary">{track.title}</p>
						<p class="truncate text-xs text-text-muted">{track.artist} · {track.album}</p>
					</div>
					<span class="ml-auto text-xs text-text-muted">{track.duration}</span>
				</a>
			{/each}
		{/if}
	{/if}
</div>
