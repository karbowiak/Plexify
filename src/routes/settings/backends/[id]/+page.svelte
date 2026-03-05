<script lang="ts">
	import { page } from '$app/state';
	import { get } from '$lib/backends/registry';
	import { getBackendConfig, setBackend } from '$lib/stores/configStore.svelte';
	import { connectBackend, disconnectBackend } from '$lib/stores/backendStore.svelte';
	import { Capability } from '$lib/backends/types';
	import { Check, X } from 'lucide-svelte';

	const backendId = $derived(page.params.id!);
	const backend = $derived(get(backendId));
	const config = $derived(getBackendConfig(backendId));

	const allCapabilities = Object.values(Capability);

	function formatCapability(cap: string): string {
		return cap
			.split('_')
			.map((w) => w[0].toUpperCase() + w.slice(1))
			.join(' ');
	}

	async function toggleEnabled() {
		const newEnabled = !config.enabled;
		setBackend(backendId, { enabled: newEnabled });
		if (newEnabled) {
			await connectBackend(backendId, config.config);
		} else {
			await disconnectBackend(backendId);
		}
	}

	function setConfigValue(key: string, value: unknown) {
		setBackend(backendId, { config: { [key]: value } });
	}
</script>

{#if backend}
	<div class="space-y-6">
		<!-- Header -->
		<div>
			<h1 class="text-2xl font-bold text-text-primary">{backend.metadata.name}</h1>
			<p class="mt-1 text-sm text-text-secondary">
				v{backend.metadata.version} by {backend.metadata.author}
			</p>
		</div>

		<!-- Enable toggle -->
		<div class="rounded-xl border border-border bg-bg-elevated">
			<div class="flex items-center justify-between px-6 py-4">
				<div>
					<p class="text-sm font-medium text-text-primary">Enabled</p>
					<p class="text-xs text-text-secondary">Enable or disable this backend.</p>
				</div>
				<button
					aria-label="Toggle backend"
					onclick={toggleEnabled}
					class="relative h-6 w-11 shrink-0 rounded-full transition-colors {config.enabled
						? 'bg-accent'
						: 'bg-overlay-medium'}"
				>
					<span
						class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {config.enabled
							? 'translate-x-5'
							: ''}"
					></span>
				</button>
			</div>
		</div>

		<!-- Config fields -->
		{#if backend.metadata.configFields.length > 0}
			<div class="rounded-xl border border-border bg-bg-elevated">
				<h2 class="px-6 pt-5 pb-3 text-sm font-semibold text-accent">Configuration</h2>

				<div class="space-y-1 px-6 pb-5">
					{#each backend.metadata.configFields as field}
						<div class="flex items-center justify-between py-3">
							<div class="mr-4">
								<p class="text-sm font-medium text-text-primary">{field.label}</p>
								{#if field.placeholder}
									<p class="text-xs text-text-muted">{field.placeholder}</p>
								{/if}
							</div>

							{#if field.type === 'toggle'}
								<button
									aria-label="Toggle {field.label}"
									onclick={() =>
										setConfigValue(field.key, !config.config[field.key])}
									class="relative h-6 w-11 shrink-0 rounded-full transition-colors {config
										.config[field.key]
										? 'bg-accent'
										: 'bg-overlay-medium'}"
								>
									<span
										class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {config
											.config[field.key]
											? 'translate-x-5'
											: ''}"
									></span>
								</button>
							{:else if field.type === 'select'}
								<select
									class="rounded-lg border border-border bg-bg-base px-3 py-1.5 text-sm text-text-primary"
									value={config.config[field.key] ?? ''}
									onchange={(e) =>
										setConfigValue(field.key, e.currentTarget.value)}
								>
									{#each field.options ?? [] as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							{:else}
								<input
									type={field.type === 'url' ? 'url' : field.type}
									class="w-64 rounded-lg border border-border bg-bg-base px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted"
									placeholder={field.placeholder}
									value={config.config[field.key] ?? ''}
									onchange={(e) =>
										setConfigValue(field.key, e.currentTarget.value)}
								/>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Capabilities grid -->
		<div class="rounded-xl border border-border bg-bg-elevated">
			<h2 class="px-6 pt-5 pb-3 text-sm font-semibold text-accent">Capabilities</h2>

			<div class="grid grid-cols-4 gap-2 px-6 pb-5">
				{#each allCapabilities as cap}
					{@const supported = backend.supports(cap)}
					<div
						class="flex items-center gap-2 rounded-lg px-3 py-2 {supported
							? 'text-accent'
							: 'text-text-muted'}"
					>
						{#if supported}
							<Check size={14} strokeWidth={2.5} />
						{:else}
							<X size={14} />
						{/if}
						<span class="text-xs font-medium">{formatCapability(cap)}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<h1 class="text-2xl font-bold text-text-primary">Backend not found</h1>
		<p class="text-sm text-text-secondary">No backend registered with id "{page.params.id}".</p>
	</div>
{/if}
