<script lang="ts">
	import { Podcast as PodcastIcon, Check } from 'lucide-svelte';
	import CachedImage from '$lib/components/ui/CachedImage.svelte';
	import type { Podcast, PodcastSubscription } from '$lib/podcast/types';
	import { isSubscribed } from '$lib/stores/podcastStore.svelte';

	let {
		podcast,
		onclick
	}: {
		podcast: Podcast | PodcastSubscription;
		onclick?: () => void;
	} = $props();

	let feedUrl = $derived('feed_url' in podcast ? podcast.feed_url : podcast.feedUrl);
	let artUrl = $derived('artwork_url' in podcast ? podcast.artwork_url : podcast.artworkUrl);
	let title = $derived(podcast.title);
	let author = $derived(podcast.author);
	let subscribed = $derived(isSubscribed(feedUrl));

	function handleClick() {
		if (onclick) {
			onclick();
		} else {
			const encoded = btoa(feedUrl);
			window.location.href = `/podcasts/${encoded}`;
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="group relative cursor-pointer rounded-md bg-bg-elevated p-2 transition-all hover:bg-bg-hover hover:shadow-lg hover:shadow-black/20"
	onclick={handleClick}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') handleClick();
	}}
	role="button"
	tabindex="0"
>
	<!-- Image area -->
	<div class="relative mb-2">
		<CachedImage
			src={artUrl}
			alt=""
			class="aspect-square w-full rounded object-cover"
		>
			{#snippet fallback()}
				<div
					class="flex aspect-square w-full items-center justify-center rounded bg-gradient-to-br from-accent/20 via-bg-highlight to-bg-elevated"
				>
					<PodcastIcon size={32} class="text-text-muted" />
				</div>
			{/snippet}
		</CachedImage>

		<!-- Subscribed badge -->
		{#if subscribed}
			<span
				class="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-bg-base"
			>
				<Check size={12} strokeWidth={3} />
			</span>
		{/if}
	</div>

	<!-- Text -->
	<p class="truncate text-xs font-medium text-text-primary">{title}</p>
	<p class="truncate text-[10px] text-text-secondary">{author}</p>
</div>
