<script lang="ts">
	import { getPlayback, setPlayback } from '$lib/stores/configStore.svelte';

	let config = $derived(getPlayback());
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-text-primary">Playback</h1>

	<div class="rounded-xl border border-border bg-bg-elevated">
		<h2 class="px-6 pt-5 pb-3 text-sm font-semibold text-accent">Audio</h2>

		<!-- Crossfade -->
		<div class="flex items-center justify-between px-6 py-4">
			<div>
				<p class="text-sm font-medium text-text-primary">Crossfade</p>
				<p class="text-xs text-text-secondary">Smoothly blend between tracks.</p>
			</div>
			<button
				aria-label="Toggle crossfade"
				onclick={() => setPlayback({ crossfadeEnabled: !config.crossfadeEnabled })}
				class="relative h-6 w-11 shrink-0 rounded-full transition-colors {config.crossfadeEnabled
					? 'bg-accent'
					: 'bg-overlay-medium'}"
			>
				<span
					class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {config.crossfadeEnabled
						? 'translate-x-5'
						: ''}"
				></span>
			</button>
		</div>

		{#if config.crossfadeEnabled}
			<div class="px-6 pb-4">
				<label for="crossfadeDuration" class="block text-xs text-text-secondary">
					Duration: {config.crossfadeDuration}s
				</label>
				<input
					id="crossfadeDuration"
					type="range"
					min="1"
					max="12"
					step="1"
					value={config.crossfadeDuration}
					oninput={(e) =>
						setPlayback({ crossfadeDuration: Number(e.currentTarget.value) })}
					class="mt-1 w-full max-w-xs"
				/>
			</div>
		{/if}

		<div class="mx-6 h-px bg-border"></div>

		<!-- Gapless Playback -->
		<div class="flex items-center justify-between px-6 py-4">
			<div>
				<p class="text-sm font-medium text-text-primary">Gapless Playback</p>
				<p class="text-xs text-text-secondary">
					Eliminate silence between tracks on the same album.
				</p>
			</div>
			<button
				aria-label="Toggle gapless playback"
				onclick={() => setPlayback({ gaplessPlayback: !config.gaplessPlayback })}
				class="relative h-6 w-11 shrink-0 rounded-full transition-colors {config.gaplessPlayback
					? 'bg-accent'
					: 'bg-overlay-medium'}"
			>
				<span
					class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {config.gaplessPlayback
						? 'translate-x-5'
						: ''}"
				></span>
			</button>
		</div>

		<div class="mx-6 h-px bg-border"></div>

		<!-- Volume Normalization -->
		<div class="flex items-center justify-between px-6 py-4 pb-5">
			<div>
				<p class="text-sm font-medium text-text-primary">Volume Normalization</p>
				<p class="text-xs text-text-secondary">
					Adjust volume levels so all tracks play at a similar loudness.
				</p>
			</div>
			<button
				aria-label="Toggle volume normalization"
				onclick={() => setPlayback({ normalizeVolume: !config.normalizeVolume })}
				class="relative h-6 w-11 shrink-0 rounded-full transition-colors {config.normalizeVolume
					? 'bg-accent'
					: 'bg-overlay-medium'}"
			>
				<span
					class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {config.normalizeVolume
						? 'translate-x-5'
						: ''}"
				></span>
			</button>
		</div>
	</div>
</div>
