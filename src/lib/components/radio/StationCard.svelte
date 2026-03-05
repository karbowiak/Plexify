<script lang="ts">
	import { Play, Square, Heart, Radio } from 'lucide-svelte';
	import CachedImage from '$lib/components/ui/CachedImage.svelte';
	import type { RadioStation } from '$lib/radio/types';
	import { countryFlag } from '$lib/radio/types';
	import { Capability } from '$lib/backends/types';
	import { getBackendsWithCapability } from '$lib/stores/backendStore.svelte';
	import {
		toggleFavorite,
		isFavorite
	} from '$lib/stores/radioStore.svelte';
	import { playRadioNow, getCurrentItem, getActiveMediaType } from '$lib/stores/unifiedQueue.svelte';
	import { getState, playCurrentItem, stopPlayback } from '$lib/stores/playerStore.svelte';

	let { station, variant = 'row' }: { station: RadioStation; variant?: 'row' | 'card' } = $props();

	let currentItem = $derived(getCurrentItem());
	let mediaType = $derived(getActiveMediaType());
	let playState = $derived(getState());
	let isActive = $derived(mediaType === 'radio' && currentItem?.type === 'radio' && currentItem.data.uuid === station.uuid);
	let playing = $derived(isActive && playState === 'playing');
	let favorited = $derived(isFavorite(station.uuid));

	function handlePlay() {
		if (playing) {
			stopPlayback();
		} else {
			playRadioNow(station);
			playCurrentItem();
			const backends = getBackendsWithCapability(Capability.InternetRadio);
			const rb = backends.find((b) => b.id === station.backendId) ?? backends[0];
			rb?.registerRadioClick?.(station.uuid);
		}
	}

	function handleFavorite(e: MouseEvent) {
		e.stopPropagation();
		toggleFavorite(station);
	}
</script>

{#if variant === 'card'}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group relative cursor-pointer rounded-md bg-bg-elevated p-2 transition-all hover:bg-bg-hover hover:shadow-lg hover:shadow-black/20"
		onclick={handlePlay}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePlay(); }}
		role="button"
		tabindex="0"
	>
		<!-- Image area -->
		<div class="relative mb-2">
			<CachedImage
				src={station.favicon}
				alt=""
				class="aspect-square w-full rounded object-cover"
			>
				{#snippet fallback()}
					<div class="flex aspect-square w-full items-center justify-center rounded bg-gradient-to-br from-accent/20 via-bg-highlight to-bg-elevated">
						<Radio size={32} class={isActive ? 'text-accent' : 'text-text-muted'} />
					</div>
				{/snippet}
			</CachedImage>

			<!-- Play button overlay -->
			<button
				type="button"
				aria-label="Play {station.name}"
				class="absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-bg-base shadow-lg shadow-glow-accent transition-all duration-200 hover:scale-105 hover:bg-accent-hover {playing
					? 'translate-y-0 opacity-100'
					: 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'}"
				onclick={(e) => { e.stopPropagation(); handlePlay(); }}
			>
				{#if playing}
					<Square size={12} fill="currentColor" />
				{:else}
					<Play size={14} fill="currentColor" class="ml-0.5" />
				{/if}
			</button>

			<!-- Heart button -->
			<button
				type="button"
				aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
				class="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 transition-all {favorited
					? 'text-accent opacity-100'
					: 'text-white opacity-0 group-hover:opacity-100'} hover:text-accent"
				onclick={handleFavorite}
			>
				<Heart size={12} fill={favorited ? 'currentColor' : 'none'} />
			</button>

			<!-- LIVE badge -->
			{#if playing}
				<span class="absolute top-1.5 left-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-bg-base">
					LIVE
				</span>
			{/if}
		</div>

		<!-- Text -->
		<p class="truncate text-xs font-medium {isActive ? 'text-accent' : 'text-text-primary'}">
			{station.name}
		</p>
		<p class="truncate text-[10px] text-text-secondary">
			{#if station.country_code}{countryFlag(station.country_code)} {/if}{station.tags.slice(0, 2).join(', ')}
		</p>
	</div>
{:else}
	<!-- Row variant -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors {isActive
			? 'bg-accent/10 ring-1 ring-accent/30'
			: 'hover:bg-bg-hover'}"
		onclick={handlePlay}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePlay(); }}
		role="button"
		tabindex="0"
	>
		<!-- Favicon -->
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg {isActive
				? 'bg-accent/20'
				: 'bg-bg-highlight'}"
		>
			<CachedImage
				src={station.favicon}
				alt=""
				class="h-full w-full object-cover"
			>
				{#snippet fallback()}
					<Radio size={18} class={isActive ? 'text-accent' : 'text-text-muted'} />
				{/snippet}
			</CachedImage>
		</div>

		<!-- Info -->
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<p class="truncate text-sm font-medium {isActive ? 'text-accent' : 'text-text-primary'}">
					{station.name}
				</p>
				{#if playing}
					<span
						class="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-bg-base"
					>
						LIVE
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-1.5 text-xs text-text-secondary">
				{#if station.country_code}
					<span>{countryFlag(station.country_code)}</span>
				{/if}
				{#if station.codec}
					<span class="rounded bg-bg-highlight px-1 py-0.5 text-[10px] text-text-muted">
						{station.codec}{station.bitrate ? `/${station.bitrate}k` : ''}
					</span>
				{/if}
				{#if station.tags.length > 0}
					<span class="truncate">{station.tags.slice(0, 3).join(', ')}</span>
				{/if}
			</div>
		</div>

		<!-- Actions -->
		<div class="flex shrink-0 items-center gap-1">
			<button
				type="button"
				class="flex h-7 w-7 items-center justify-center rounded-full transition-colors {favorited
					? 'text-accent'
					: 'text-text-muted opacity-0 group-hover:opacity-100'} hover:text-accent"
				onclick={handleFavorite}
			>
				<Heart size={14} fill={favorited ? 'currentColor' : 'none'} />
			</button>
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full transition-all {playing
					? 'bg-accent text-bg-base'
					: 'bg-accent text-bg-base opacity-0 group-hover:opacity-100'}"
			>
				{#if playing}
					<Square size={12} fill="currentColor" />
				{:else}
					<Play size={14} fill="currentColor" class="ml-0.5" />
				{/if}
			</div>
		</div>
	</div>
{/if}
