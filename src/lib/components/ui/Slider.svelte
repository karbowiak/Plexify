<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		class?: string;
		oninput?: HTMLInputAttributes['oninput'];
	}

	let { value = $bindable(0), min = 0, max = 100, step = 1, class: className = '', oninput }: Props = $props();

	let fillPercent = $derived(max > min ? ((value - min) / (max - min)) * 100 : 0);
</script>

<div class="group relative flex items-center {className}">
	<input
		type="range"
		bind:value
		{oninput}
		{min}
		{max}
		{step}
		class="w-full"
		style="background: transparent; background-image: linear-gradient(to right, var(--color-accent) {fillPercent}%, rgba(255,255,255,0.2) {fillPercent}%); background-size: 100% 4px; background-repeat: no-repeat; background-position: center;"
	/>
</div>
