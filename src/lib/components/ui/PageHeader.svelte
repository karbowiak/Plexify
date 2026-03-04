<script lang="ts">
	interface Props {
		title: string;
		subtitle?: string;
		type?: string;
		meta?: string;
		gradient?: string;
	}

	let { title, subtitle, type = '', meta = '', gradient = 'from-accent/20 via-bg-surface to-bg-surface' }: Props = $props();
</script>

<div class="flex items-end gap-6 bg-gradient-to-b {gradient} -mx-6 -mt-6 px-6 pt-16 pb-6">
	<div class="flex h-48 w-48 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight shadow-xl">
		<span class="text-6xl text-text-muted">&#9835;</span>
	</div>
	<div class="min-w-0">
		{#if type}
			<p class="mb-1 text-xs font-bold uppercase tracking-wider text-text-secondary">{type}</p>
		{/if}
		<h1 class="mb-2 text-4xl font-extrabold leading-tight">{title}</h1>
		{#if subtitle}
			<p class="text-sm text-text-secondary">{subtitle}</p>
		{/if}
		{#if meta}
			<p class="mt-1 text-xs text-text-muted">{meta}</p>
		{/if}
	</div>
</div>
