<script lang="ts">
	import { Music } from 'lucide-svelte';
</script>

<div class="space-y-8">
	<div class="flex items-center gap-4">
		<div
			class="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent"
		>
			<Music size={28} />
		</div>
		<div>
			<h1 class="text-2xl font-bold text-text-primary">Plex Music Client</h1>
			<p class="text-sm text-text-secondary">Version 0.1.0</p>
		</div>
	</div>

	<div class="space-y-4 text-sm text-text-secondary">
		<p>
			A modern music player built for Plex Media Server.
		</p>

		<div class="rounded-lg border border-border bg-bg-elevated p-4">
			<h3 class="mb-2 font-medium text-text-primary">Built with</h3>
			<ul class="space-y-1 text-text-secondary">
				<li>SvelteKit + Svelte 5</li>
				<li>TypeScript</li>
				<li>Tailwind CSS v4</li>
				<li>Lucide Icons</li>
			</ul>
		</div>
	</div>
</div>
