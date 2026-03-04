<script lang="ts">
	import {
		Shuffle,
		SkipBack,
		Play,
		SkipForward,
		Repeat,
		Repeat1,
		ListMusic,
		Mic2,
		Volume,
		Volume1,
		Volume2,
		VolumeX,
		ChevronUp,
		ChevronDown,
		Maximize2,
		X
	} from 'lucide-svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import Slider from '$lib/components/ui/Slider.svelte';
	import StarRating from '$lib/components/ui/StarRating.svelte';
	import EQCard from '$lib/components/features/EQCard.svelte';
	import SleepTimerCard from '$lib/components/features/SleepTimerCard.svelte';
	import {
		toggleQueue,
		toggleLyrics,
		getSidePanel,
		getArtExpanded,
		setArtExpanded,
		getArtFullscreen,
		setArtFullscreen
	} from '$lib/stores/uiStore.svelte';
	import { getVolume, setVolume, getRepeatMode, cycleRepeatMode, getShuffled, setShuffled } from '$lib/stores/configStore.svelte';
	import { shuffleQueue, unshuffleQueue, getQueueCount } from '$lib/stores/queueStore.svelte';
	import { getHasLyrics } from '$lib/stores/lyricsAvailableStore.svelte';
	import { getSleepTimer, formatRemaining } from '$lib/stores/sleepTimerStore.svelte';
	import { getAppearance } from '$lib/stores/configStore.svelte';

	let progress = $state(0);
	let compact = $derived(getAppearance().compactMode);

	let volConfig = $derived(getVolume());
	let volume = $derived(volConfig.level);
	let muted = $derived(volConfig.muted);

	let activePanel = $derived(getSidePanel());
	let artExpanded = $derived(getArtExpanded());
	let fullscreen = $derived(getArtFullscreen());

	let shuffled = $derived(getShuffled());
	let repeatMode = $derived(getRepeatMode());
	let RepeatIcon = $derived(repeatMode === 'one' ? Repeat1 : Repeat);
	let queueCount = $derived(getQueueCount());
	let lyricsAvailable = $derived(getHasLyrics());
	let sleepTimer = $derived(getSleepTimer());
	let sleepRemaining = $derived(formatRemaining());

	function toggleShuffle() {
		if (shuffled) {
			unshuffleQueue();
			setShuffled(false);
		} else {
			shuffleQueue();
			setShuffled(true);
		}
	}

	let VolumeIcon = $derived.by(() => {
		if (muted || volume === 0) return VolumeX;
		if (volume <= 33) return Volume;
		if (volume <= 66) return Volume1;
		return Volume2;
	});

	function onVolumeInput(e: Event) {
		const val = +(e.target as HTMLInputElement).value;
		if (muted && val > 0) {
			setVolume({ level: val, muted: false });
		} else {
			setVolume({ level: val });
		}
	}

	function toggleMute() {
		if (muted) {
			setVolume({ muted: false, level: volConfig.preMuteLevel });
		} else {
			setVolume({ preMuteLevel: volume, muted: true, level: 0 });
		}
	}

	function onVolumeWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY < 0 ? 5 : -5;
		const val = Math.max(0, Math.min(100, volume + delta));
		if (muted && val > 0) {
			setVolume({ level: val, muted: false });
		} else {
			setVolume({ level: val });
		}
	}
</script>

<svelte:window
	onkeydown={fullscreen ? (e) => e.key === 'Escape' && setArtFullscreen(false) : undefined}
/>

<div class="h-px bg-gradient-to-r from-transparent via-overlay-medium to-transparent"></div>
<footer
	class="grid h-(--spacing-player) items-center bg-bg-elevated pr-4 pl-4"
	style="grid-template-columns: 1fr minmax(400px, 2fr) 1fr;"
>
	<!-- Left: Track info + album art -->
	<div class="flex min-w-0 items-center gap-3">
		{#if artExpanded}
			<div class="shrink-0" style="width: calc(var(--spacing-sidebar) - 16px);"></div>
		{/if}
		{#if !artExpanded}
			<a
				href="/album/1"
				class="group relative block {compact ? 'h-10 w-10' : 'h-14 w-14'} shrink-0 overflow-hidden rounded bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight"
			>
				<!-- Hover overlay buttons -->
				<div
					class="absolute inset-0 flex items-end justify-between bg-black/0 p-1 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100"
				>
					<button
						type="button"
						class="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setArtExpanded(true);
						}}
						aria-label="Expand"
					>
						<ChevronUp size={12} />
					</button>
					<button
						type="button"
						class="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setArtFullscreen(true);
						}}
						aria-label="Fullscreen"
					>
						<Maximize2 size={10} />
					</button>
				</div>
			</a>
		{/if}
		<div class="ml-1 min-w-0">
			<p class="truncate text-sm font-medium text-text-primary">No track playing</p>
			<p class="truncate text-xs text-text-secondary">Unknown artist</p>
		</div>
		<StarRating class="ml-2" />
	</div>

	<!-- Center: Controls + progress (always dead center via grid) -->
	<div class="flex flex-col items-center gap-1">
		<div class="flex items-center {compact ? 'gap-2' : 'gap-3'}">
			<IconButton icon={Shuffle} size={16} label="Shuffle" active={shuffled} onclick={toggleShuffle} />
			<IconButton icon={SkipBack} size={18} label="Previous" />
			<IconButton icon={Play} size={20} label="Play" variant="play" />
			<IconButton icon={SkipForward} size={18} label="Next" />
			<IconButton icon={RepeatIcon} size={16} label="Repeat" active={repeatMode !== 'off'} onclick={cycleRepeatMode} />
		</div>
		<div class="flex w-full items-center {compact ? 'gap-1.5' : 'gap-2'}">
			<span class="w-16 text-right text-xs tabular-nums text-text-muted">0:00</span>
			<Slider bind:value={progress} class="flex-1" />
			<span class="w-16 text-xs tabular-nums text-text-muted">0:00</span>
		</div>
	</div>

	<!-- Right: Volume + controls -->
	<div class="flex items-center justify-end gap-2">
		<div class="relative">
			<IconButton
				icon={ListMusic}
				size={18}
				label="Queue"
				active={activePanel === 'queue'}
				onclick={toggleQueue}
			/>
			{#if queueCount > 0}
				<span class="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-bg-base">
					{queueCount}
				</span>
			{/if}
		</div>
		<IconButton
			icon={Mic2}
			size={18}
			label="Lyrics"
			active={activePanel === 'lyrics' || lyricsAvailable}
			onclick={toggleLyrics}
		/>
		<EQCard />
		<div class="relative">
			<SleepTimerCard />
			{#if sleepTimer.selected && sleepRemaining}
				<span class="pointer-events-none absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums font-medium text-accent">
					{sleepRemaining}
				</span>
			{/if}
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="group relative ml-1 flex items-center gap-1.5" onwheel={onVolumeWheel}>
			<!-- Volume tooltip -->
			<div
				class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded border border-border bg-bg-elevated px-2 py-0.5 text-[10px] tabular-nums text-text-secondary opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
			>
				{volume}%
			</div>
			<button
				type="button"
				class="flex items-center justify-center text-text-secondary transition-colors hover:text-text-primary"
				onclick={toggleMute}
				aria-label="Toggle mute"
			>
				<VolumeIcon size={18} />
			</button>
			<Slider value={volume} oninput={onVolumeInput} class="w-24" />
		</div>
	</div>
</footer>

<!-- Expanded album art — fixed bottom-left corner -->
{#if artExpanded}
	<div class="fixed bottom-0 left-0 z-50 w-(--spacing-sidebar)">
		<a href="/album/1" class="group relative block overflow-hidden">
			<div class="aspect-square w-full bg-bg-highlight"></div>
			<!-- Hover overlay -->
			<div
				class="absolute inset-0 flex items-end justify-between bg-black/0 p-2 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100"
			>
				<button
					type="button"
					class="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
					onclick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setArtExpanded(false);
					}}
					aria-label="Collapse"
				>
					<ChevronDown size={16} />
				</button>
				<button
					type="button"
					class="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
					onclick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setArtFullscreen(true);
					}}
					aria-label="Fullscreen"
				>
					<Maximize2 size={14} />
				</button>
			</div>
		</a>
	</div>
{/if}

<!-- Fullscreen album art modal -->
{#if fullscreen}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
		onclick={() => setArtFullscreen(false)}
		onkeydown={(e) => e.key === 'Escape' && setArtFullscreen(false)}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Album art fullscreen"
	>
		<button
			type="button"
			class="absolute top-6 right-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
			onclick={() => setArtFullscreen(false)}
			aria-label="Close"
		>
			<X size={20} />
		</button>
		<button
			type="button"
			class="h-[80vh] max-h-[80vw] w-[80vw] max-w-[80vh] cursor-default rounded-2xl bg-bg-highlight shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			aria-label="Album artwork"
		></button>
	</div>
{/if}
