<script lang="ts">
	import { getVisSamples } from '$lib/stores/playerStore.svelte';
	import type { CompactVisMode } from '$lib/stores/uiStore.svelte';

	interface Props {
		progressPct: number;
		hoverPct: number | null;
		mode: CompactVisMode;
	}

	let { progressPct, hoverPct, mode }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let specSmoothed: Float32Array | null = null;
	let vuSmoothed = { L: 0, R: 0 };
	let accentCache = '';
	let accentTick = 0;

	function computeSpectrum(samples: Float32Array, bins: number): Float32Array {
		const N = Math.min(samples.length, 1024);
		const result = new Float32Array(bins);
		const fMin = 1;
		const fMax = N / 2;
		for (let b = 0; b < bins; b++) {
			const f = Math.max(1, Math.round(fMin * Math.pow(fMax / fMin, b / (bins - 1))));
			let real = 0,
				imag = 0;
			for (let n = 0; n < N; n++) {
				const angle = (2 * Math.PI * f * n) / N;
				real += samples[n] * Math.cos(angle);
				imag -= samples[n] * Math.sin(angle);
			}
			result[b] = Math.pow(Math.sqrt(real * real + imag * imag) / N, 0.15);
		}
		for (let b = 0; b < bins; b++) {
			const t = b / (bins - 1);
			result[b] *= (0.4 + 0.4 * t * t * t) * 0.9;
		}
		return result;
	}

	function hexToRgba(hex: string, alpha: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	$effect(() => {
		if (mode === 'off' || !canvas) return;

		let cancelled = false;
		let raf = 0;

		function draw() {
			if (cancelled || !canvas) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const W = canvas.width;
			const H = canvas.height;
			ctx.clearRect(0, 0, W, H);

			// Refresh accent on first frame + every ~30 frames
			if (!accentCache || ++accentTick >= 30) {
				accentTick = 0;
				accentCache =
					getComputedStyle(canvas).getPropertyValue('--color-accent').trim() ||
					'#22c55e';
			}
			const accent = accentCache;

			const activePct = hoverPct ?? progressPct;
			const splitX = (activePct / 100) * W;
			const isHovering = hoverPct !== null;

			if (mode === 'spectrum') {
				const pcm = getVisSamples();
				if (!pcm) {
					raf = requestAnimationFrame(draw);
					return;
				}
				const BINS = 64;
				const raw = computeSpectrum(pcm, BINS);
				if (!specSmoothed || specSmoothed.length !== BINS) {
					specSmoothed = new Float32Array(BINS);
				}
				for (let i = 0; i < BINS; i++) {
					const a = raw[i] > specSmoothed[i] ? 0.4 : 0.18;
					specSmoothed[i] += a * (raw[i] - specSmoothed[i]);
				}
				const barW = W / BINS;
				const maxVal = Math.max(...Array.from(specSmoothed), 0.001);
				for (let i = 0; i < BINS; i++) {
					const x = i * barW;
					const barH = Math.max(2, (specSmoothed[i] / maxVal) * H * 0.9);
					const barX = x + barW * 0.1;
					const barWidth = barW * 0.8;
					ctx.fillStyle =
						x + barW / 2 < splitX
							? isHovering
								? hexToRgba(accent, 0.5)
								: accent
							: '#404040';
					ctx.fillRect(barX, H - barH, barWidth, barH);
				}
				// Progress indicator
				ctx.strokeStyle = 'rgba(255,255,255,0.25)';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(splitX, 0);
				ctx.lineTo(splitX, H);
				ctx.stroke();
			} else if (mode === 'oscilloscope') {
				const pcm = getVisSamples();
				if (!pcm) {
					raf = requestAnimationFrame(draw);
					return;
				}
				const samples = pcm.length > 512 ? pcm.subarray(0, 512) : pcm;
				ctx.strokeStyle = '#e0e0e0';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				const mid = H / 2;
				for (let i = 0; i < samples.length; i++) {
					const x = (i / (samples.length - 1)) * W;
					const y = mid - samples[i] * mid * 3.0;
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
				// Progress indicator
				ctx.strokeStyle = 'rgba(255,255,255,0.2)';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(splitX, 0);
				ctx.lineTo(splitX, H);
				ctx.stroke();
			} else if (mode === 'vu') {
				const pcm = getVisSamples();
				if (!pcm) {
					raf = requestAnimationFrame(draw);
					return;
				}
				// RMS from even/odd samples (pseudo L/R)
				let sumL = 0, sumR = 0, count = 0;
				for (let i = 0; i < pcm.length - 1; i += 2) {
					sumL += pcm[i] * pcm[i];
					sumR += pcm[i + 1] * pcm[i + 1];
					count++;
				}
				const rmsL = count > 0 ? Math.sqrt(sumL / count) : 0;
				const rmsR = count > 0 ? Math.sqrt(sumR / count) : 0;
				vuSmoothed.L += (rmsL > vuSmoothed.L ? 0.55 : 0.15) * (rmsL - vuSmoothed.L);
				vuSmoothed.R += (rmsR > vuSmoothed.R ? 0.55 : 0.15) * (rmsR - vuSmoothed.R);

				const DB_FLOOR = -40;
				const gap = 4;
				const barH = (H - gap) / 2;

				const drawBar = (rms: number, y: number) => {
					const db = rms > 0 ? 20 * Math.log10(rms) : DB_FLOOR;
					const fill = Math.max(0, Math.min(1, (db - DB_FLOOR) / -DB_FLOOR)) * W;
					const grad = ctx.createLinearGradient(0, 0, W, 0);
					grad.addColorStop(0, accent);
					grad.addColorStop(0.7, accent);
					grad.addColorStop(0.85, '#f0c040');
					grad.addColorStop(1, '#e04040');
					ctx.fillStyle = '#2a2a2a';
					ctx.fillRect(0, y, W, barH);
					ctx.fillStyle = grad;
					ctx.fillRect(0, y, fill, barH);
				};

				drawBar(vuSmoothed.L, 0);
				drawBar(vuSmoothed.R, barH + gap);

				// Progress indicator line
				ctx.strokeStyle = 'rgba(255,255,255,0.3)';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(splitX, 0);
				ctx.lineTo(splitX, H);
				ctx.stroke();
			}

			raf = requestAnimationFrame(draw);
		}

		raf = requestAnimationFrame(draw);

		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	});
</script>

{#if mode !== 'off'}
	<div class="pointer-events-none relative h-7 w-full">
		<canvas
			bind:this={canvas}
			width={800}
			height={28}
			class="absolute inset-0 h-full w-full"
			style="image-rendering: pixelated;"
		></canvas>
	</div>
{/if}
