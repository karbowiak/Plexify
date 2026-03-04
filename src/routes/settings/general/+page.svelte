<script lang="ts">
	import { getGeneral, setGeneral } from '$lib/stores/configStore.svelte';

	let config = $derived(getGeneral());
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-text-primary">General</h1>

	<!-- Preferences Card -->
	<div class="rounded-xl border border-border bg-bg-elevated">
		<h2 class="px-6 pt-5 pb-3 text-sm font-semibold text-accent">Preferences</h2>

		<!-- Track Notifications -->
		<div class="flex items-center justify-between px-6 py-4">
			<div>
				<p class="text-sm font-medium text-text-primary">Track Notifications</p>
				<p class="text-xs text-text-secondary">
					Show an OS notification when a new track starts playing.
				</p>
			</div>
			<button
				aria-label="Toggle track notifications"
				onclick={() => setGeneral({ animationsEnabled: !config.animationsEnabled })}
				class="relative h-6 w-11 shrink-0 rounded-full transition-colors {config.animationsEnabled
					? 'bg-accent'
					: 'bg-overlay-medium'}"
			>
				<span
					class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {config.animationsEnabled
						? 'translate-x-5'
						: ''}"
				></span>
			</button>
		</div>

		<div class="mx-6 h-px bg-border"></div>

		<!-- Album Deduplication -->
		<div class="flex items-center justify-between px-6 py-4">
			<div>
				<p class="text-sm font-medium text-text-primary">Album Deduplication</p>
				<p class="text-xs text-text-secondary">
					Merge duplicate albums on artist pages and pick the best quality version for playback.
				</p>
			</div>
			<button
				aria-label="Toggle album deduplication"
				class="relative h-6 w-11 shrink-0 rounded-full bg-accent transition-colors"
			>
				<span
					class="absolute top-0.5 left-0.5 h-5 w-5 translate-x-5 rounded-full bg-white transition-transform"
				></span>
			</button>
		</div>

		<div class="mx-6 h-px bg-border"></div>

		<!-- Debug Mode -->
		<div class="flex items-center justify-between px-6 py-4 pb-5">
			<div>
				<p class="text-sm font-medium text-text-primary">Debug Mode</p>
				<p class="text-xs text-text-secondary">
					Shows raw Plex IDs, file paths, and stream data in track info and right-click menus.
				</p>
			</div>
			<button
				aria-label="Toggle debug mode"
				class="relative h-6 w-11 shrink-0 rounded-full bg-accent transition-colors"
			>
				<span
					class="absolute top-0.5 left-0.5 h-5 w-5 translate-x-5 rounded-full bg-white transition-transform"
				></span>
			</button>
		</div>
	</div>

	<!-- Downloads - Coming Soon -->
	<div class="rounded-xl border border-border/60 bg-bg-elevated/60 p-6 opacity-50">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold text-text-primary">Downloads</h2>
			<span class="text-xs text-text-muted">Coming soon</span>
		</div>
		<p class="mt-2 text-sm text-text-muted">
			Offline caching and download quality settings will appear here.
		</p>
	</div>

	<!-- AI - Coming Soon -->
	<div class="rounded-xl border border-border/60 bg-bg-elevated/60 p-6 opacity-50">
		<div class="flex items-center gap-3">
			<h2 class="text-sm font-semibold text-text-primary">AI</h2>
			<span class="text-xs text-text-muted">Coming soon</span>
		</div>
		<p class="mt-2 text-sm text-text-muted">
			Sonic recommendations, radio tuning and smart mix settings will appear here.
		</p>
	</div>
</div>
