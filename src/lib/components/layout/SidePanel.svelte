<script lang="ts">
	import { X, GripVertical } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { getSidePanel, setSidePanel, closeSidePanel } from '$lib/stores/uiStore.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import Slider from '$lib/components/ui/Slider.svelte';
	import { getQueueTracks, getNowPlaying, reorderQueue } from '$lib/stores/queueStore.svelte';
	import { lyricsData } from '$lib/data/lyrics';
	import { getLyricsState, loadTrackOffset, updateOffset } from '$lib/stores/lyricsOffsetStore.svelte';
	import { getAppearance } from '$lib/stores/configStore.svelte';

	import type { SidePanel } from '$lib/stores/uiStore.svelte';

	let compact = $derived(getAppearance().compactMode);

	let activePanel = $derived(getSidePanel());
	let activeLine = $state(9);

	// Load offset for demo track on mount
	// TODO: replace 'demo-track' with actual track ID from player state
	$effect(() => {
		loadTrackOffset('demo-track');
	});

	const tabs: { id: Exclude<SidePanel, null>; label: string }[] = [
		{ id: 'queue', label: 'Queue' },
		{ id: 'lyrics', label: 'Lyrics' }
	];

	// --- Queue drag-to-reorder state ---
	let queue = $derived(getQueueTracks());
	let nowPlaying = $derived(getNowPlaying());
	let dragIndex = $state(-1);
	let overIndex = $state(-1);
	let dragY = $state(0);
	let dragOffsetY = $state(0);
	let listEl = $state<HTMLDivElement | undefined>(undefined);
	let scrollContainerEl = $state<HTMLDivElement | undefined>(undefined);

	let draggedTrack = $derived(dragIndex >= 0 ? queue[dragIndex] : null);
	let listRect = $derived.by(() => {
		if (dragIndex >= 0 && scrollContainerEl) {
			return scrollContainerEl.getBoundingClientRect();
		}
		return null;
	});

	function onDragStart(e: PointerEvent, index: number) {
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
		dragIndex = index;
		overIndex = index;
		dragOffsetY = e.clientY - target.getBoundingClientRect().top;
		dragY = e.clientY;
	}

	function onDragMove(e: PointerEvent) {
		if (dragIndex < 0 || !listEl || !scrollContainerEl) return;
		dragY = e.clientY;

		const y = e.clientY;
		const rows = listEl.children;
		let closest = dragIndex;
		let closestDist = Infinity;
		for (let i = 0; i < rows.length; i++) {
			const rect = rows[i].getBoundingClientRect();
			const mid = rect.top + rect.height / 2;
			const dist = Math.abs(y - mid);
			if (dist < closestDist) {
				closestDist = dist;
				closest = i;
			}
		}
		overIndex = closest;

		// Auto-scroll when near edges
		const containerRect = scrollContainerEl.getBoundingClientRect();
		const edgeZone = 40;
		if (y < containerRect.top + edgeZone) {
			scrollContainerEl.scrollTop -= 5;
		} else if (y > containerRect.bottom - edgeZone) {
			scrollContainerEl.scrollTop += 5;
		}
	}

	function onDragEnd() {
		if (dragIndex < 0) return;
		if (dragIndex !== overIndex) {
			reorderQueue(dragIndex, overIndex);
		}
		dragIndex = -1;
		overIndex = -1;
	}

	// --- Lyrics timing offset (IndexedDB-backed) ---
	let lyricsState = $derived(getLyricsState());
	let lyricsOffset = $derived(lyricsState.offset);
	let offsetDisplay = $derived(() => {
		const sec = lyricsOffset / 1000;
		const sign = sec >= 0 ? '+' : '';
		return `${sign}${sec.toFixed(1)}s`;
	});

	function onTimingWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = e.deltaY < 0 ? 100 : -100;
		updateOffset(Math.max(-5000, Math.min(5000, lyricsOffset + delta)));
	}

	function onTimingInput(e: Event) {
		updateOffset(+(e.target as HTMLInputElement).value);
	}

	function resetTiming() {
		updateOffset(0);
	}
</script>

<aside
	class="flex w-[350px] shrink-0 flex-col border-l border-border bg-bg-surface shadow-[inset_2px_0_8px_rgba(0,0,0,0.3)]"
	transition:fly={{ x: 350, duration: 200 }}
>
	<!-- Tab header -->
	<div class="flex items-center border-b border-border px-4">
		<div class="flex flex-1 gap-4">
			{#each tabs as tab}
				<button
					type="button"
					class="py-3 text-sm font-semibold transition-colors {activePanel === tab.id
						? 'border-b-2 border-accent text-text-primary'
						: 'text-text-muted hover:text-text-secondary'}"
					onclick={() => setSidePanel(tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>
		<IconButton icon={X} size={16} label="Close panel" onclick={closeSidePanel} />
	</div>

	<!-- Queue content -->
	{#if activePanel === 'queue'}
		<div class="px-4 py-3">
			<p class="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
				Now Playing
			</p>
			<div class="flex items-center gap-3 rounded-lg border border-accent/10 p-3" style="background: var(--color-accent-tint-subtle)">
				<div class="{compact ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 rounded bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight"></div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-accent">{nowPlaying.title}</p>
					<p class="truncate text-xs text-text-secondary">{nowPlaying.artist}</p>
				</div>
				<span class="text-xs tabular-nums text-text-muted">{nowPlaying.duration}</span>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto px-4 pb-3" bind:this={scrollContainerEl}>
			<p class="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
				Next Up
			</p>
			<div class="flex flex-col gap-0.5" bind:this={listEl}>
				{#each queue as track, i}
					{@const isDragging = dragIndex === i}
					{@const isOver = dragIndex >= 0 && overIndex === i && dragIndex !== i}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="group relative flex cursor-grab items-center gap-3 rounded-lg border px-2 {compact ? 'py-1' : 'py-1.5'} transition-all select-none active:cursor-grabbing
							{isDragging
							? 'border-accent/20 bg-accent/5 opacity-30'
							: 'border-transparent hover:border-border hover:bg-accent-tint-hover'}"
						style="touch-action: none"
						onpointerdown={(e) => onDragStart(e, i)}
						onpointermove={onDragMove}
						onpointerup={onDragEnd}
						onpointercancel={onDragEnd}
					>
						{#if isOver && overIndex < dragIndex}
							<div
								class="absolute -top-[1px] right-2 left-2 h-0.5 rounded-full bg-accent"
							></div>
						{/if}
						<div
							class="flex shrink-0 items-center text-text-muted/40 transition-colors group-hover:text-text-muted"
						>
							<GripVertical size={14} />
						</div>
						<div class="{compact ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 rounded bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight"></div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm text-text-primary">{track.title}</p>
							<p class="truncate text-xs text-text-secondary">{track.artist}</p>
						</div>
						<span class="text-xs tabular-nums text-text-muted">{track.duration}</span>
						{#if isOver && overIndex >= dragIndex}
							<div
								class="absolute -bottom-[1px] right-2 left-2 h-0.5 rounded-full bg-accent"
							></div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Floating ghost card -->
		{#if draggedTrack && listRect}
			<div
				class="pointer-events-none fixed z-50 flex items-center gap-3 rounded-lg border border-accent/40 bg-bg-elevated px-2 py-1.5 shadow-xl shadow-black/50"
				style="top: {dragY - dragOffsetY}px; left: {listRect.left}px; width: {listRect.width}px; transform: scale(1.02);"
			>
				<div class="flex shrink-0 items-center text-accent">
					<GripVertical size={14} />
				</div>
				<div class="h-10 w-10 shrink-0 rounded bg-bg-highlight"></div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-text-primary">{draggedTrack.title}</p>
					<p class="truncate text-xs text-text-secondary">{draggedTrack.artist}</p>
				</div>
				<span class="text-xs tabular-nums text-text-muted">{draggedTrack.duration}</span>
			</div>
		{/if}
	{/if}

	<!-- Lyrics content -->
	{#if activePanel === 'lyrics'}
		<div class="mx-4 mt-3 rounded-lg border border-accent/10 p-3" style="background: var(--color-accent-tint-subtle)">
			<p class="truncate text-sm font-bold text-text-primary">{lyricsData.title}</p>
			<p class="truncate text-xs text-text-secondary">{lyricsData.artist}</p>
		</div>

		<div class="flex-1 overflow-y-auto px-6 py-4">
			<div class="flex flex-col gap-2">
				{#each lyricsData.lines as line, i}
					{#if line === ''}
						<div class="h-4"></div>
					{:else}
						<button
							type="button"
							class="cursor-pointer rounded-lg px-2 -mx-2 text-left text-2xl font-bold transition-all duration-300 {i ===
							activeLine
								? 'text-accent drop-shadow-[0_0_8px_var(--color-glow-accent)]'
								: 'text-text-muted/40 hover:text-text-muted/60 hover:bg-accent-tint-hover'}"
							onclick={() => (activeLine = i)}
						>
							{line}
						</button>
					{/if}
				{/each}
			</div>
		</div>

		<!-- Timing offset bar -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flex items-center gap-3 border-t border-border bg-bg-surface px-4 py-3" onwheel={onTimingWheel}>
			<span class="shrink-0 text-[10px] font-medium uppercase tracking-wider text-text-muted">
				Timing
			</span>
			<Slider value={lyricsOffset} oninput={onTimingInput} min={-5000} max={5000} step={100} class="flex-1" />
			<button
				type="button"
				class="shrink-0 text-xs tabular-nums text-text-muted transition-colors hover:text-text-secondary"
				ondblclick={resetTiming}
				title="Double-click to reset"
			>
				{offsetDisplay()}
			</button>
		</div>
	{/if}
</aside>
