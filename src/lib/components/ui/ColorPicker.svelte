<script lang="ts">
	import FloatingCard from './FloatingCard.svelte';
	import { contrastColor } from '$lib/color';

	interface Props {
		value: string;
		onchange: (hex: string) => void;
		open?: boolean;
		label?: string;
		class?: string;
	}

	let { value, onchange, open = $bindable(false), label, class: className = '' }: Props = $props();

	let textColor = $derived(contrastColor(value));
	let h = $state(0);
	let s = $state(0);
	let v = $state(1);
	let hexInput = $state('');

	// Canvas refs
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let canvasRect: DOMRect | null = null;

	const CANVAS_W = 200;
	const CANVAS_H = 160;

	// --- Color math ---
	function hexToHsv(hex: string): [number, number, number] {
		const r = parseInt(hex.slice(1, 3), 16) / 255;
		const g = parseInt(hex.slice(3, 5), 16) / 255;
		const b = parseInt(hex.slice(5, 7), 16) / 255;
		const max = Math.max(r, g, b),
			min = Math.min(r, g, b);
		const d = max - min;
		let hh = 0;
		if (d !== 0) {
			if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
			else if (max === g) hh = ((b - r) / d + 2) / 6;
			else hh = ((r - g) / d + 4) / 6;
		}
		const ss = max === 0 ? 0 : d / max;
		return [hh * 360, ss, max];
	}

	function hsvToHex(hh: number, ss: number, vv: number): string {
		const c = vv * ss;
		const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
		const m = vv - c;
		let r = 0,
			g = 0,
			b = 0;
		if (hh < 60) {
			r = c;
			g = x;
		} else if (hh < 120) {
			r = x;
			g = c;
		} else if (hh < 180) {
			g = c;
			b = x;
		} else if (hh < 240) {
			g = x;
			b = c;
		} else if (hh < 300) {
			r = x;
			b = c;
		} else {
			r = c;
			b = x;
		}
		const toHex = (n: number) =>
			Math.round(Math.min(255, Math.max(0, (n + m) * 255)))
				.toString(16)
				.padStart(2, '0');
		return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
	}

	function hueToRgb(hh: number): string {
		const c = 1;
		const x = 1 - Math.abs(((hh / 60) % 2) - 1);
		let r = 0,
			g = 0,
			b = 0;
		if (hh < 60) {
			r = c;
			g = x;
		} else if (hh < 120) {
			r = x;
			g = c;
		} else if (hh < 180) {
			g = c;
			b = x;
		} else if (hh < 240) {
			g = x;
			b = c;
		} else if (hh < 300) {
			r = x;
			b = c;
		} else {
			r = c;
			b = x;
		}
		return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
	}

	// Sync from prop
	$effect(() => {
		if (/^#[0-9a-fA-F]{6}$/.test(value)) {
			const [hh, ss, vv] = hexToHsv(value);
			h = hh;
			s = ss;
			v = vv;
			hexInput = value.slice(1);
		}
	});

	// Draw SV canvas whenever hue changes
	$effect(() => {
		const canvas = canvasEl;
		if (!canvas) return;
		const ctx = canvas.getContext('2d', { willReadFrequently: false });
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = CANVAS_W * dpr;
		canvas.height = CANVAS_H * dpr;
		ctx.scale(dpr, dpr);

		// Base hue fill
		ctx.fillStyle = hueToRgb(h);
		ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

		// White gradient (left to right)
		const whiteGrad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
		whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
		whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
		ctx.fillStyle = whiteGrad;
		ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

		// Black gradient (top to bottom)
		const blackGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
		blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
		blackGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
		ctx.fillStyle = blackGrad;
		ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
	});

	let liveHex = $derived(hsvToHex(h, s, v));

	// --- SV canvas pointer handling ---
	function updateSV(clientX: number, clientY: number) {
		if (!canvasRect) return;
		const x = Math.max(0, Math.min(CANVAS_W, clientX - canvasRect.left));
		const y = Math.max(0, Math.min(CANVAS_H, clientY - canvasRect.top));
		s = x / CANVAS_W;
		v = 1 - y / CANVAS_H;
	}

	function handleCanvasPointerDown(e: PointerEvent) {
		e.preventDefault();
		const el = e.currentTarget as HTMLElement;
		canvasRect = el.getBoundingClientRect();
		el.setPointerCapture(e.pointerId);
		updateSV(e.clientX, e.clientY);

		const onMove = (ev: PointerEvent) => updateSV(ev.clientX, ev.clientY);
		const onUp = () => {
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			el.removeEventListener('lostpointercapture', onUp);
			onchange(hsvToHex(h, s, v));
		};
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		el.addEventListener('lostpointercapture', onUp);
	}

	// --- Hue slider ---
	function handleHueInput(e: Event) {
		h = Number((e.target as HTMLInputElement).value);
		onchange(hsvToHex(h, s, v));
	}

	// --- Hex input ---
	function handleHexChange(e: Event) {
		const raw = (e.target as HTMLInputElement).value.replace('#', '');
		if (/^[0-9a-fA-F]{6}$/.test(raw)) {
			const hex = `#${raw}`;
			const [hh, ss, vv] = hexToHsv(hex);
			h = hh;
			s = ss;
			v = vv;
			onchange(hex);
		}
	}

	// Crosshair position
	let crossX = $derived(s * 100);
	let crossY = $derived((1 - v) * 100);
</script>

<FloatingCard bind:open position="above" align="start">
	{#snippet trigger()}
		{#if label}
			<div
				class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-medium transition-all hover:brightness-110 {className}"
				style="background-color: {value}; color: {textColor}"
			>
				<span class="opacity-60">#</span><span>{value.slice(1)}</span>
			</div>
		{:else}
			<div
				class="shrink-0 cursor-pointer rounded-full border-2 border-dashed border-border transition-transform hover:scale-110 {className}"
				style="background-color: {value}"
			></div>
		{/if}
	{/snippet}
	{#snippet children()}
		<div class="w-[232px] p-3">
			<!-- SV Canvas -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="relative mb-3 cursor-crosshair overflow-hidden rounded-md" style="width: {CANVAS_W}px; height: {CANVAS_H}px">
				<canvas
					bind:this={canvasEl}
					style="width: {CANVAS_W}px; height: {CANVAS_H}px; display: block"
					onpointerdown={handleCanvasPointerDown}
				></canvas>
				<!-- Crosshair -->
				<div
					class="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
					style="left: {crossX}%; top: {crossY}%"
				></div>
			</div>

			<!-- Hue slider -->
			<input
				type="range"
				min="0"
				max="360"
				step="1"
				value={Math.round(h)}
				oninput={handleHueInput}
				class="color-picker-hue mb-3 h-3 w-full cursor-pointer appearance-none rounded-full outline-none"
			/>

			<!-- Preview + hex input row -->
			<div class="flex items-center gap-2">
				<div
					class="h-7 w-7 shrink-0 rounded-full border border-border"
					style="background-color: {liveHex}"
				></div>
				<div class="flex flex-1 items-center rounded-lg bg-overlay px-2">
					<span class="text-xs text-text-muted">#</span>
					<input
						type="text"
						bind:value={hexInput}
						onchange={handleHexChange}
						maxlength="6"
						class="w-full border-0 bg-transparent py-1.5 pl-1 text-xs text-text-primary outline-none"
						placeholder="ffffff"
					/>
				</div>
			</div>
		</div>
	{/snippet}
</FloatingCard>

<style>
	/* Hue slider rainbow track */
	.color-picker-hue {
		background: linear-gradient(
			to right,
			#ff0000 0%,
			#ffff00 17%,
			#00ff00 33%,
			#00ffff 50%,
			#0000ff 67%,
			#ff00ff 83%,
			#ff0000 100%
		);
	}

	/* Thumb styles */
	.color-picker-hue::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgba(0, 0, 0, 0.2);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		cursor: pointer;
	}

	.color-picker-hue::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: white;
		border: 2px solid rgba(0, 0, 0, 0.2);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		cursor: pointer;
	}
</style>
