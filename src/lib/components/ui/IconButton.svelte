<script lang="ts">
	interface Props {
		icon: any;
		size?: number;
		label?: string;
		active?: boolean;
		variant?: 'default' | 'play';
		onclick?: () => void;
	}

	let {
		icon: Icon,
		size = 20,
		label = '',
		active = false,
		variant = 'default',
		onclick
	}: Props = $props();
</script>

<button
	type="button"
	aria-label={label}
	{onclick}
	class="flex items-center justify-center rounded-full transition-all {variant === 'play'
		? 'h-9 w-9 bg-accent text-bg-base hover:scale-105 hover:bg-accent-hover shadow-[0_0_12px_var(--color-glow-accent)]'
		: 'h-8 w-8 text-text-secondary hover:text-text-primary'} {active ? 'text-accent bg-accent/10' : ''}"
>
	<Icon {size} />
</button>
