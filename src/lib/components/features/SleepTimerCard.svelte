<script lang="ts">
	import { Timer } from 'lucide-svelte';
	import FloatingCard from '$lib/components/ui/FloatingCard.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';

	import { sleepTimerOptions } from '$lib/data/sleepTimer';
	import {
		getSleepTimer,
		startSleepTimer,
		cancelSleepTimer,
		formatRemaining
	} from '$lib/stores/sleepTimerStore.svelte';

	let open = $state(false);
	let customMinutes = $state('');

	let timer = $derived(getSleepTimer());
	let selected = $derived(timer.selected);
	let remaining = $derived(formatRemaining());

	function select(value: string) {
		if (selected === value) {
			cancelSleepTimer();
		} else {
			startSleepTimer(value);
		}
		customMinutes = '';
	}

	function setCustom() {
		const mins = parseInt(customMinutes);
		if (mins > 0) {
			startSleepTimer(`${mins}m`);
		}
	}

	function handleCustomKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') setCustom();
	}
</script>

<FloatingCard bind:open position="above" align="end">
	{#snippet trigger()}
		<IconButton icon={Timer} size={16} label="Sleep timer" active={selected !== null} />
	{/snippet}
	{#snippet children()}
		<div class="w-64 p-4">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-sm font-bold">Sleep Timer</h3>
				{#if selected}
					<button
						type="button"
						class="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-accent/70 transition-colors hover:bg-overlay hover:text-accent"
						onclick={() => {
							cancelSleepTimer();
							customMinutes = '';
						}}
					>
						Cancel
					</button>
				{/if}
			</div>

			<!-- Countdown display -->
			{#if selected && remaining}
				<div
					class="mb-3 flex items-center justify-center rounded-lg border border-accent/20 py-2 text-lg font-bold tabular-nums text-accent"
					style="background: var(--color-accent-tint-subtle)"
				>
					{remaining}
				</div>
			{/if}

			<div class="grid grid-cols-2 gap-1.5">
				{#each sleepTimerOptions as option}
					<button
						type="button"
						class="rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-all {selected ===
						option.value
							? 'border-accent/50 text-accent shadow-[0_0_8px_var(--color-glow-accent)]'
							: 'border-border text-text-muted hover:border-border hover:bg-accent-tint-hover hover:text-text-secondary'}"
						style={selected === option.value ? `background: var(--color-accent-tint-strong)` : `background: var(--color-accent-tint-subtle)`}
						onclick={() => select(option.value)}
					>
						{option.label}
					</button>
				{/each}
			</div>

			<div class="mt-4 border-t border-border pt-4">
				<p class="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
					Custom
				</p>
				<div class="flex gap-1.5">
					<input
						type="number"
						min="1"
						max="480"
						placeholder="Minutes"
						bind:value={customMinutes}
						onkeydown={handleCustomKeydown}
						class="h-9 w-full rounded-lg border border-border px-3 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent/30 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
						style="background: var(--color-accent-tint-subtle)"
					/>
					<button
						type="button"
						class="shrink-0 rounded-lg border border-border px-4 text-xs font-medium text-text-muted transition-all hover:border-border hover:bg-accent-tint-hover hover:text-text-secondary"
						style="background: var(--color-accent-tint-subtle)"
						onclick={setCustom}
					>
						Set
					</button>
				</div>
			</div>
		</div>
	{/snippet}
</FloatingCard>
