<script lang="ts">
	import CachedImage from './CachedImage.svelte';

	interface Props {
		title: string;
		subtitle?: string;
		subtitleHref?: string;
		type?: string;
		meta?: string;
		gradient?: string;
		imageUrl?: string;
		rounded?: boolean;
	}

	let {
		title,
		subtitle,
		subtitleHref,
		type = '',
		meta = '',
		gradient = 'from-accent/20 via-bg-surface to-bg-surface',
		imageUrl,
		rounded = false
	}: Props = $props();
</script>

<div class="flex items-end gap-6 bg-gradient-to-b {gradient} -mx-6 -mt-6 px-6 pt-16 pb-6">
	{#if imageUrl}
		<CachedImage
			src={imageUrl}
			alt={title}
			class="h-48 w-48 shrink-0 object-cover shadow-xl {rounded ? 'rounded-full' : 'rounded-md'}"
		>
			{#snippet fallback()}
				<div
					class="flex h-48 w-48 shrink-0 items-center justify-center {rounded
						? 'rounded-full'
						: 'rounded-md'} bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight shadow-xl"
				>
					<span class="text-6xl text-text-muted">&#9835;</span>
				</div>
			{/snippet}
		</CachedImage>
	{:else}
		<div
			class="flex h-48 w-48 shrink-0 items-center justify-center {rounded
				? 'rounded-full'
				: 'rounded-md'} bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight shadow-xl"
		>
			<span class="text-6xl text-text-muted">&#9835;</span>
		</div>
	{/if}
	<div class="min-w-0">
		{#if type}
			<p class="mb-1 text-xs font-bold uppercase tracking-wider text-text-secondary">{type}</p>
		{/if}
		<h1 class="mb-2 text-4xl font-extrabold leading-tight">{title}</h1>
		{#if subtitle}
			{#if subtitleHref}
				<a href={subtitleHref} class="text-sm text-text-secondary hover:text-text-primary hover:underline">{subtitle}</a>
			{:else}
				<p class="text-sm text-text-secondary">{subtitle}</p>
			{/if}
		{/if}
		{#if meta}
			<p class="mt-1 text-xs text-text-muted">{meta}</p>
		{/if}
	</div>
</div>
