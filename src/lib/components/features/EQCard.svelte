<script lang="ts">
	import { SlidersHorizontal } from 'lucide-svelte';
	import FloatingCard from '$lib/components/ui/FloatingCard.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';

	import { bandLabels, presetNames, presets } from '$lib/data/eq';
	import { getEQ, setEQ } from '$lib/stores/configStore.svelte';

	let open = $state(false);
	let eqConfig = $derived(getEQ());
	let enabled = $derived(eqConfig.enabled);
	let preset = $derived(eqConfig.preset);
	let bands = $state([...getEQ().bands]);

	// Sync bands from store when preset changes externally
	$effect(() => {
		const storeBands = eqConfig.bands;
		// Only sync if different (avoid loop)
		if (JSON.stringify(bands) !== JSON.stringify(storeBands)) {
			bands = [...storeBands];
		}
	});

	const BAR_HEIGHT = 200;
	const MIN_DB = -12;
	const MAX_DB = 12;
	const DB_RANGE = MAX_DB - MIN_DB;

	function selectPreset(name: string) {
		const newBands = [...presets[name]];
		bands = newBands;
		setEQ({ preset: name, bands: newBands });
	}

	function dbToY(db: number): number {
		return ((MAX_DB - db) / DB_RANGE) * BAR_HEIGHT;
	}

	function yToDb(y: number, rect: DOMRect): number {
		const relY = Math.max(0, Math.min(BAR_HEIGHT, y - rect.top));
		const db = MAX_DB - (relY / BAR_HEIGHT) * DB_RANGE;
		return Math.round(db);
	}

	function formatDb(db: number): string {
		if (db > 0) return `+${db}`;
		return `${db}`;
	}

	function persistBands() {
		setEQ({ preset: 'custom', bands: [...bands] });
	}

	function handlePointerDown(e: PointerEvent, index: number) {
		if (!enabled) return;
		e.preventDefault();
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		bands[index] = yToDb(e.clientY, rect);

		el.setPointerCapture(e.pointerId);

		const onMove = (ev: PointerEvent) => {
			bands[index] = yToDb(ev.clientY, rect);
		};
		const onUp = () => {
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			el.removeEventListener('lostpointercapture', onUp);
			persistBands();
		};
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		el.addEventListener('lostpointercapture', onUp);
	}

	function handleDblClick(index: number) {
		if (!enabled) return;
		bands[index] = 0;
		persistBands();
	}
</script>

<FloatingCard bind:open position="above" align="end">
	{#snippet trigger()}
		<IconButton icon={SlidersHorizontal} size={16} label="Equalizer" active={open || enabled} />
	{/snippet}
	{#snippet children()}
		<div class="w-[480px] p-4">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-sm font-bold">Equalizer</h3>
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-medium transition-colors {enabled
						? 'bg-accent text-bg-base'
						: 'bg-bg-highlight text-text-muted'}"
					onclick={() => setEQ({ enabled: !enabled })}
				>
					{enabled ? 'On' : 'Off'}
				</button>
			</div>

			<div class="mb-4 grid grid-cols-3 gap-1.5">
				{#each Object.entries(presetNames) as [key, label]}
					<button
						type="button"
						class="rounded-lg border px-2 py-1.5 text-xs font-medium transition-all {preset ===
						key
							? 'border-accent/50 text-accent shadow-[0_0_8px_var(--color-glow-accent)]'
							: 'border-border text-text-muted hover:border-border hover:bg-accent-tint-hover hover:text-text-secondary'}"
						style={preset === key ? `background: var(--color-accent-tint-strong)` : `background: var(--color-accent-tint-subtle)`}
						onclick={() => selectPreset(key)}
					>
						{label}
					</button>
				{/each}
			</div>

			<div
				class="relative flex items-start justify-between gap-1 transition-opacity {enabled
					? ''
					: 'pointer-events-none opacity-40'}"
			>
				<!-- 0dB reference line -->
				<div
					class="pointer-events-none absolute left-0 right-0 border-t border-border"
					style="top: calc(24px + {BAR_HEIGHT / 2}px)"
				></div>

				{#each bandLabels as label, i}
					{@const db = bands[i]}
					{@const centerY = BAR_HEIGHT / 2}
					{@const currentY = dbToY(db)}
					{@const fillTop = db >= 0 ? currentY : centerY}
					{@const fillHeight = db >= 0 ? centerY - currentY : currentY - centerY}
					<div class="flex flex-col items-center gap-1">
						<!-- dB value -->
						<span
							class="h-4 text-[10px] tabular-nums leading-4 {db === 0
								? 'text-text-muted'
								: 'text-text-primary'}"
						>
							{formatDb(db)}
						</span>

						<!-- Bar -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							data-bar
							class="relative cursor-pointer overflow-hidden rounded-md bg-bg-highlight"
							style="width: 32px; height: {BAR_HEIGHT}px"
							onpointerdown={(e) => handlePointerDown(e, i)}
							ondblclick={() => handleDblClick(i)}
						>
							<!-- Fill from center -->
							{#if fillHeight > 0}
								<div
									class="absolute left-1 right-1 rounded-sm bg-accent/30"
									style="top: {fillTop}px; height: {fillHeight}px"
								></div>
							{/if}

							<!-- Thumb line -->
							<div
								class="absolute left-0.5 right-0.5 h-[3px] rounded-full bg-accent shadow-[0_0_6px_var(--color-glow-accent)]"
								style="top: {currentY - 1.5}px"
							></div>
						</div>

						<!-- Frequency label -->
						<span class="text-[9px] tabular-nums text-text-muted">{label}</span>
					</div>
				{/each}
			</div>
		</div>
	{/snippet}
</FloatingCard>
