<script lang="ts">
	import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		baseWidth?: number;
		gap?: number;
		loading?: boolean;
		skeletonCount?: number;
		showUnfold?: boolean;
		children: Snippet;
		skeleton?: Snippet;
	}

	let {
		title,
		baseWidth = 160,
		gap = 12,
		loading = false,
		skeletonCount = 5,
		showUnfold = true,
		children,
		skeleton
	}: Props = $props();

	let unfolded = $state(false);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	let scrollContainer: HTMLDivElement | undefined = $state();

	function updateScrollState() {
		if (!scrollContainer) return;
		const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
		canScrollLeft = scrollLeft > 1;
		canScrollRight = scrollLeft + clientWidth < scrollWidth - 1;
	}

	function scroll(direction: 'left' | 'right') {
		if (!scrollContainer) return;
		const amount = scrollContainer.clientWidth * 0.85;
		scrollContainer.scrollBy({
			left: direction === 'left' ? -amount : amount,
			behavior: 'smooth'
		});
	}

	$effect(() => {
		if (!scrollContainer || unfolded) return;

		updateScrollState();

		const observer = new ResizeObserver(() => updateScrollState());
		observer.observe(scrollContainer);

		const onScroll = () => updateScrollState();
		scrollContainer.addEventListener('scroll', onScroll, { passive: true });

		return () => {
			observer.disconnect();
			scrollContainer?.removeEventListener('scroll', onScroll);
		};
	});
</script>

<div class="mb-6">
	{#if title}
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-text-primary">{title}</h2>
			{#if showUnfold && !loading}
				<button
					type="button"
					onclick={() => (unfolded = !unfolded)}
					class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
					aria-label={unfolded ? 'Collapse to row' : 'Expand to grid'}
				>
					{#if unfolded}
						<List size={14} />
					{:else}
						<LayoutGrid size={14} />
					{/if}
				</button>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="flex" style:gap="{gap}px">
			{#each Array(skeletonCount) as _}
				{#if skeleton}
					<div class="shrink-0" style:width="calc({baseWidth}px * var(--card-scale, 1))">
						{@render skeleton()}
					</div>
				{:else}
					<div
						class="shrink-0 animate-pulse rounded-md bg-bg-elevated"
						style:width="calc({baseWidth}px * var(--card-scale, 1))"
					>
						<div class="aspect-square w-full rounded-t-md bg-bg-highlight"></div>
						<div class="space-y-2 p-2">
							<div class="h-3 w-3/4 rounded bg-bg-highlight"></div>
							<div class="h-2.5 w-1/2 rounded bg-bg-highlight"></div>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{:else if unfolded}
		<div
			class="grid"
			style:gap="{gap}px"
			style:grid-template-columns="repeat(auto-fill, minmax(calc({baseWidth}px * var(--card-scale, 1)), 1fr))"
		>
			{@render children()}
		</div>
	{:else}
		<!-- Scrollable row -->
		<div class="group/scroller relative">
			<!-- Left arrow -->
			{#if canScrollLeft}
				<button
					type="button"
					onclick={() => scroll('left')}
					class="absolute top-0 left-0 z-10 flex h-full w-10 items-center justify-center bg-gradient-to-r from-bg-surface/90 to-transparent opacity-0 transition-opacity group-hover/scroller:opacity-100"
					aria-label="Scroll left"
				>
					<ChevronLeft size={20} class="text-text-primary" />
				</button>
			{/if}

			<div
				bind:this={scrollContainer}
				class="flex overflow-x-auto"
				style:gap="{gap}px"
				style:scrollbar-width="none"
				style:--scroller-item-width="calc({baseWidth}px * var(--card-scale, 1))"
			>
				{@render children()}
			</div>

			<!-- Right arrow -->
			{#if canScrollRight}
				<button
					type="button"
					onclick={() => scroll('right')}
					class="absolute top-0 right-0 z-10 flex h-full w-10 items-center justify-center bg-gradient-to-l from-bg-surface/90 to-transparent opacity-0 transition-opacity group-hover/scroller:opacity-100"
					aria-label="Scroll right"
				>
					<ChevronRight size={20} class="text-text-primary" />
				</button>
			{/if}
		</div>
	{/if}
</div>
