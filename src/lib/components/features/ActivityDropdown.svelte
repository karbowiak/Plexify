<script lang="ts">
	import { Activity } from 'lucide-svelte';
	import FloatingCard from '$lib/components/ui/FloatingCard.svelte';
	import IconButton from '$lib/components/ui/IconButton.svelte';

	import { activityItems } from '$lib/data/activity';

	let open = $state(false);
</script>

<FloatingCard bind:open position="below" align="end">
	{#snippet trigger()}
		<IconButton icon={Activity} label="Activity" active={open} />
	{/snippet}
	{#snippet children()}
		<div class="w-80 p-4">
			<h3 class="mb-3 text-sm font-bold">Recent Activity</h3>
			<div class="flex flex-col gap-1">
				{#each activityItems as item}
					<div class="rounded-md px-2 py-2 transition-colors hover:bg-accent-tint-hover">
						<p class="text-sm text-text-primary">{item.action}</p>
						<p class="text-xs text-text-muted">{item.time}</p>
					</div>
				{/each}
			</div>
		</div>
	{/snippet}
</FloatingCard>
