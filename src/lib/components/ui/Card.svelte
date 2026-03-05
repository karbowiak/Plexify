<script lang="ts">
	import { Play } from 'lucide-svelte';
	import CachedImage from './CachedImage.svelte';

	interface Props {
		title: string;
		subtitle?: string;
		imageUrl?: string;
		rounded?: boolean;
		playable?: boolean;
		compact?: boolean;
		onplay?: () => void;
	}

	let { title, subtitle, imageUrl, rounded = false, playable = true, compact = false, onplay }: Props = $props();
</script>

<div class="group rounded-md bg-bg-elevated text-left transition-all hover:bg-bg-hover hover:shadow-lg hover:shadow-black/20 {compact ? 'p-2' : 'p-4'}">
	<div class="relative {compact ? 'mb-2' : 'mb-4'}">
		<CachedImage
			src={imageUrl}
			alt={title}
			class="aspect-square w-full object-cover shadow-lg {rounded ? 'rounded-full' : 'rounded'}"
		>
			{#snippet fallback()}
				<div
					class="aspect-square w-full shadow-lg {rounded
						? 'rounded-full'
						: 'rounded'} bg-gradient-to-br from-bg-highlight via-bg-elevated to-bg-highlight"
				></div>
			{/snippet}
		</CachedImage>
		{#if playable}
			<button
				type="button"
				aria-label="Play {title}"
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onplay?.();
				}}
				class="absolute right-2 bottom-2 flex translate-y-2 items-center justify-center rounded-full bg-accent text-bg-base opacity-0 shadow-lg shadow-glow-accent transition-all duration-200 hover:scale-105 hover:bg-accent-hover group-hover:translate-y-0 group-hover:opacity-100 {compact ? 'h-8 w-8' : 'h-10 w-10'}"
			>
				<Play size={compact ? 14 : 18} fill="currentColor" />
			</button>
		{/if}
	</div>
	<p class="truncate font-medium {compact ? 'text-xs' : 'text-sm'}">{title}</p>
	{#if subtitle}
		<p class="truncate text-text-secondary {compact ? 'text-[10px]' : 'text-xs'}">{subtitle}</p>
	{/if}
</div>
