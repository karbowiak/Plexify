<script lang="ts">
	interface Props {
		number: number;
		title: string;
		artist: string;
		artistId?: string;
		album?: string;
		albumId?: string;
		duration: string;
		compact?: boolean;
	}

	let { number, title, artist, artistId, album, albumId, duration, compact = false }: Props = $props();
</script>

<div
	class="group grid items-center rounded px-3 text-sm transition-colors hover:bg-bg-hover {compact ? 'h-9 grid-cols-[1.5rem_1fr_4rem]' : 'h-10 grid-cols-[2rem_1fr_1fr_4rem]'}"
>
	<span class="text-text-muted text-right pr-3 text-xs">{number}</span>
	<div class="min-w-0">
		<p class="truncate font-medium text-text-primary">{title}</p>
		{#if compact}
			<p class="truncate text-xs text-text-secondary">{artist}</p>
		{/if}
	</div>
	{#if !compact}
		<div class="min-w-0">
			{#if artistId}
				<a href="/artist/{artistId}" class="truncate text-text-secondary hover:text-text-primary hover:underline">{artist}</a>
			{:else}
				<span class="truncate text-text-secondary">{artist}</span>
			{/if}
			{#if album}
				<span class="text-text-muted"> · </span>
				{#if albumId}
					<a href="/album/{albumId}" class="truncate text-text-secondary hover:text-text-primary hover:underline">{album}</a>
				{:else}
					<span class="truncate text-text-secondary">{album}</span>
				{/if}
			{/if}
		</div>
	{/if}
	<span class="text-right text-text-muted text-xs">{duration}</span>
</div>
