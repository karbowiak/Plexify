<script lang="ts">
	import { getAll } from '$lib/backends/registry';
	import { getBackendConfig } from '$lib/stores/configStore.svelte';
	import { Server, Music, Radio, Database, Cloud, HardDrive } from 'lucide-svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const iconMap: Record<string, any> = {
		server: Server,
		music: Music,
		radio: Radio,
		database: Database,
		cloud: Cloud,
		'hard-drive': HardDrive
	};

	const backends = $derived(getAll());

	function getIcon(name: string) {
		return iconMap[name] ?? Server;
	}
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-text-primary">Backends</h1>

	<div class="rounded-xl border border-border bg-bg-elevated">
		<h2 class="px-6 pt-5 pb-3 text-sm font-semibold text-accent">Connected Services</h2>

		{#each backends as backend}
			{@const config = getBackendConfig(backend.id)}
			{@const Icon = getIcon(backend.metadata.icon)}
			<a
				href="/settings/backends/{backend.id}"
				class="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-accent-tint-hover"
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent"
				>
					<Icon size={20} />
				</div>
				<div class="flex-1">
					<p class="text-sm font-medium text-text-primary">{backend.metadata.name}</p>
					<p class="text-xs text-text-secondary">{backend.metadata.description}</p>
				</div>
				<span
					class="rounded-full px-2 py-0.5 text-xs font-medium {config.enabled
						? 'bg-accent/10 text-accent'
						: 'bg-overlay-light text-text-muted'}"
				>
					{config.enabled ? 'Active' : 'Inactive'}
				</span>
				<span class="rounded-full bg-overlay-light px-2 py-0.5 text-xs text-text-secondary">
					{backend.capabilities.size} capabilities
				</span>
			</a>
		{/each}
	</div>
</div>
