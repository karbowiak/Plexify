<script lang="ts">
	import {
		Home,
		Search,
		Library,
		Radio,
		Globe,
		Podcast,
		Plus,
		Heart,
		Users,
		Disc3,
		Tags
	} from 'lucide-svelte';
	import NavItem from '$lib/components/ui/NavItem.svelte';
	import PlaylistItem from '$lib/components/ui/PlaylistItem.svelte';
	import { getArtExpanded } from '$lib/stores/uiStore.svelte';
	import { toggleCreatePlaylist, getPlaylistVersion } from '$lib/stores/uiStore.svelte';
	import { getAppearance } from '$lib/stores/configStore.svelte';
	import { hasCapability, getBackend } from '$lib/stores/backendStore.svelte';
	import { Capability } from '$lib/backends/types';
	import type { Playlist } from '$lib/backends/types';
	import { page } from '$app/state';

	let artExpanded = $derived(getArtExpanded());
	let compact = $derived(getAppearance().compactMode);

	let backendPlaylists = $state<Playlist[]>([]);

	$effect(() => {
		const _v = getPlaylistVersion();
		const b = getBackend();
		if (b && b.supports(Capability.Playlists) && b.getPlaylists) {
			b.getPlaylists().then((pls) => {
				backendPlaylists = pls;
			});
		} else {
			backendPlaylists = [];
		}
	});

	function isActive(path: string, exact = false): boolean {
		if (exact) return page.url.pathname === path;
		return page.url.pathname === path || page.url.pathname.startsWith(path + '/');
	}
</script>

<aside class="flex h-full w-(--spacing-sidebar) shrink-0 flex-col bg-bg-base">
	<nav class="flex flex-col {compact ? 'pt-2 pb-1' : 'pt-4 pb-2'}">
		<NavItem icon={Home} label="Home" href="/" active={isActive('/', true)} />
		<NavItem icon={Search} label="Search" href="/search" active={isActive('/search')} />
		<NavItem icon={Library} label="Your Library" href="/library" active={isActive('/library')} />
		{#if hasCapability(Capability.Tags)}
			<NavItem icon={Tags} label="Genres" href="/genres" active={isActive('/genres')} />
		{/if}
		{#if hasCapability(Capability.Radio)}
			<NavItem icon={Radio} label="Stations" href="/stations" active={isActive('/stations')} />
		{/if}
		{#if hasCapability(Capability.InternetRadio)}
			<NavItem icon={Globe} label="Internet Radio" href="/radio" active={isActive('/radio')} />
		{/if}
		{#if hasCapability(Capability.Podcasts)}
			<NavItem icon={Podcast} label="Podcasts" href="/podcasts" active={isActive('/podcasts')} />
		{/if}
	</nav>

	<div class="mx-4 h-px bg-gradient-to-r from-transparent via-overlay-medium to-transparent"></div>

	<nav class="flex flex-col pt-2 pb-2">
		{#if hasCapability(Capability.EditPlaylists)}
			<NavItem icon={Plus} label="Create Playlist" onclick={() => toggleCreatePlaylist()} />
		{/if}
		<NavItem icon={Heart} label="Liked Songs" href="/liked/songs" active={isActive('/liked/songs')} />
		<NavItem icon={Users} label="Liked Artists" href="/liked/artists" active={isActive('/liked/artists')} />
		<NavItem icon={Disc3} label="Liked Albums" href="/liked/albums" active={isActive('/liked/albums')} />
	</nav>

	<div class="mx-4 h-px bg-gradient-to-r from-transparent via-overlay-medium to-transparent"></div>

	<div class="flex min-h-0 flex-1 flex-col transition-[margin] duration-200 {artExpanded ? 'mb-[calc(var(--spacing-sidebar)-var(--spacing-player))]' : ''}">
		<div
			class="flex-1 overflow-y-auto pt-2 pb-2"
		>
			{#each backendPlaylists as pl}
				<PlaylistItem name={pl.title} href="/playlist/{pl.id}" active={page.url.pathname === `/playlist/${pl.id}`} />
			{/each}
		</div>
	</div>

</aside>
