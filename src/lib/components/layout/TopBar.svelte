<script lang="ts">
	import { ChevronLeft, ChevronRight, Search, RefreshCw, Settings } from 'lucide-svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import ActivityDropdown from '$lib/components/features/ActivityDropdown.svelte';
	import SearchDropdown from '$lib/components/ui/SearchDropdown.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getAppearance } from '$lib/stores/configStore.svelte';

	let compact = $derived(getAppearance().compactMode);
	let isSettings = $derived(page.url.pathname.startsWith('/settings'));

	let preSettingsPath = '/';
	let lastSettingsPath = '/settings';

	let query = $state('');
	let focused = $state(false);
	let showDropdown = $derived(query.trim().length > 0 && focused);
	let searchInput = $state<HTMLInputElement | undefined>();

	function onGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
			e.preventDefault();
			searchInput?.focus();
			searchInput?.select();
		}
	}

	function onSettingsClick() {
		if (isSettings) {
			lastSettingsPath = page.url.pathname;
			goto(preSettingsPath);
		} else {
			preSettingsPath = page.url.pathname;
			goto(lastSettingsPath);
		}
	}

	function onSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && query.trim()) {
			focused = false;
			goto(`/search?q=${encodeURIComponent(query.trim())}`);
		} else if (e.key === 'Escape') {
			focused = false;
			(e.target as HTMLInputElement)?.blur();
		}
	}
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<header
	class="relative z-30 flex h-(--spacing-topbar) items-center gap-4 bg-transparent px-4"
>
	<!-- Left: Navigation -->
	<div class="flex items-center gap-1">
		<IconButton icon={ChevronLeft} label="Go back" onclick={() => history.back()} />
		<IconButton icon={ChevronRight} label="Go forward" onclick={() => history.forward()} />
	</div>

	<!-- Center: Search -->
	<div class="relative mx-auto w-full max-w-md">
		<Search size={16} class="absolute top-1/2 left-3 -translate-y-1/2 text-text-muted" />
		<input
			type="text"
			placeholder="Search..."
			bind:value={query}
			bind:this={searchInput}
			onfocus={() => focused = true}
			onblur={() => setTimeout(() => focused = false, 200)}
			onkeydown={onSearchKeydown}
			class="{compact ? 'h-8' : 'h-9'} w-full rounded-full border border-border bg-bg-highlight pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/30"
		/>
		{#if showDropdown}
			<SearchDropdown {query} />
		{/if}
	</div>

	<!-- Right: Actions -->
	<div class="flex items-center gap-1">
		<ActivityDropdown />
		<IconButton icon={RefreshCw} label="Refresh" />
		<IconButton icon={Settings} label="Settings" active={isSettings} onclick={onSettingsClick} />
	</div>
</header>
