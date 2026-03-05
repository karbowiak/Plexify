<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		src: string | null | undefined;
		alt?: string;
		class?: string;
		fallback?: Snippet;
		lazy?: boolean;
		onerror?: (e: Event) => void;
	}

	let {
		src,
		alt = '',
		class: className = '',
		fallback,
		lazy = true,
		onerror: onErrorProp
	}: Props = $props();

	let hasError = $state(false);

	let resolvedSrc = $derived.by(() => {
		if (!src) return null;
		// Plain http/https — pass through to cache endpoint
		if (src.startsWith('http://') || src.startsWith('https://')) {
			return `/api/img?src=${encodeURIComponent(src)}`;
		}
		// Custom protocol — pass through to cache endpoint
		if (src.includes('://')) {
			return `/api/img?src=${encodeURIComponent(src)}`;
		}
		// Unknown format — use as-is (e.g. data: URLs, relative paths)
		return src;
	});

	function handleError(e: Event) {
		hasError = true;
		onErrorProp?.(e);
	}

	// Reset error state when src changes
	$effect(() => {
		src;
		hasError = false;
	});
</script>

{#if resolvedSrc && !hasError}
	<img
		src={resolvedSrc}
		{alt}
		class={className}
		loading={lazy ? 'lazy' : 'eager'}
		onerror={handleError}
	/>
{:else if fallback}
	{@render fallback()}
{/if}
