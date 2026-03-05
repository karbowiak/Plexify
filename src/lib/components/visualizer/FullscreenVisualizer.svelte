<script lang="ts">
	import {
		SkipBack,
		SkipForward,
		Play,
		Pause,
		X,
		Heart,
		Timer,
		List,
		Shuffle,
		ChevronLeft,
		ChevronRight
	} from 'lucide-svelte';
	import CachedImage from '$lib/components/ui/CachedImage.svelte';
	import SeekVisualizer from './SeekVisualizer.svelte';
	import MilkdropVisualizer from './MilkdropVisualizer.svelte';
	import MilkdropPresetBrowser from './MilkdropPresetBrowser.svelte';
	import {
		getFullscreenVisMode,
		setFullscreenVisMode,
		setFullscreenVisualizer,
		type FullscreenVisMode
	} from '$lib/stores/uiStore.svelte';
	import {
		getState,
		getPosition,
		getDuration,
		getVisSamples,
		togglePlayback,
		skipNext,
		skipPrevious,
		seekTo
	} from '$lib/stores/playerStore.svelte';
	import { getCurrentItem, toDisplay } from '$lib/stores/unifiedQueue.svelte';
	import {
		getPresetBrowserOpen,
		togglePresetBrowser,
		closePresetBrowser,
		getCurrentPresetName,
		isFavorite,
		toggleFavorite,
		getAutoCycleEnabled,
		setAutoCycleEnabled,
		getAutoCycleIntervalSec,
		getStarfieldReactivity,
		setStarfieldReactivity,
		getStarfieldBaseSpeed,
		setStarfieldBaseSpeed
	} from '$lib/stores/visualizerStore.svelte';

	let canvasEl: HTMLCanvasElement | undefined = $state();
	let seekHoverPct: number | null = $state(null);

	let item = $derived(getCurrentItem());
	let display = $derived(item ? toDisplay(item) : null);
	let playState = $derived(getState());
	let pos = $derived(getPosition());
	let dur = $derived(getDuration());
	let visMode = $derived(getFullscreenVisMode());
	let progressPct = $derived(dur > 0 ? (pos / dur) * 100 : 0);

	// Visualizer store derived
	let browserOpen = $derived(getPresetBrowserOpen());
	let currentPreset = $derived(getCurrentPresetName());
	let cycleEnabled = $derived(getAutoCycleEnabled());
	let cycleIntervalSec = $derived(getAutoCycleIntervalSec());
	let sfReactivity = $derived(getStarfieldReactivity());
	let sfBaseSpeed = $derived(getStarfieldBaseSpeed());

	const MODES: FullscreenVisMode[] = ['spectrum', 'oscilloscope', 'vu', 'starfield', 'milkdrop'];

	let milkdropRef: MilkdropVisualizer | undefined = $state();
	let milkdropPresetKeys: string[] = $state([]);

	// Poll preset keys from milkdrop ref once ready
	$effect(() => {
		if (!milkdropRef) {
			milkdropPresetKeys = [];
			return;
		}
		// Check periodically until we get keys
		const iv = setInterval(() => {
			const keys = milkdropRef?.getPresetKeys() ?? [];
			if (keys.length > 0) {
				milkdropPresetKeys = keys;
				clearInterval(iv);
			}
		}, 200);
		return () => clearInterval(iv);
	});

	let specSmoothed: Float32Array | null = null;
	let vuSmoothed = { L: 0, R: 0 };
	let accentCache = '';
	let accentTick = 0;

	// Starfield state
	interface Star {
		x: number;
		y: number;
		z: number;
		pz: number;
	}
	let stars: Star[] | null = null;
	let starSpeed = 0;

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

	function formatTime(ms: number): string {
		const totalSec = Math.floor(ms / 1000);
		const m = Math.floor(totalSec / 60);
		const s = totalSec % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function close() {
		setFullscreenVisualizer(false);
	}

	function onSeekClick(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		seekTo(dur * pct);
	}

	function onSeekHover(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		seekHoverPct = Math.max(
			0,
			Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
		);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (browserOpen) {
				closePresetBrowser();
			} else {
				close();
			}
			return;
		}
		if (visMode === 'milkdrop') {
			if (e.key === 'ArrowRight') milkdropRef?.nextPreset();
			if (e.key === 'ArrowLeft') milkdropRef?.prevPreset();
			if (e.key === 'b' || e.key === 'B') togglePresetBrowser();
			if (e.key === 'r' || e.key === 'R') milkdropRef?.randomPreset();
			if ((e.key === 'f' || e.key === 'F') && currentPreset) toggleFavorite(currentPreset);
		}
	}

	// Main canvas animation
	$effect(() => {
		if (!canvasEl) return;

		let cancelled = false;
		let raf = 0;

		function resize() {
			if (!canvasEl) return;
			canvasEl.width = canvasEl.clientWidth || window.innerWidth;
			canvasEl.height = canvasEl.clientHeight || window.innerHeight;
			stars = null;
		}
		resize();
		window.addEventListener('resize', resize);

		function draw() {
			if (cancelled || !canvasEl) return;
			const ctx = canvasEl.getContext('2d');
			if (!ctx) return;
			const W = canvasEl.width;
			const H = canvasEl.height;
			const currentMode = getFullscreenVisMode();

			if (currentMode !== 'starfield') ctx.clearRect(0, 0, W, H);

			if (!accentCache || ++accentTick >= 30) {
				accentTick = 0;
				accentCache =
					getComputedStyle(canvasEl).getPropertyValue('--color-accent').trim() ||
					'#22c55e';
			}
			const accent = accentCache;

			const pcm = getVisSamples();

			if (currentMode === 'spectrum') {
				if (pcm) {
					const BINS = 128;
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
						const norm = specSmoothed[i] / maxVal;
						const barH = Math.max(2, norm * H * 0.85);
						ctx.fillStyle = `hsl(${120 + norm * 60}, 80%, 50%)`;
						ctx.fillRect(x + 1, H - barH, barW - 2, barH);
					}
				}
			} else if (currentMode === 'oscilloscope') {
				if (pcm) {
					ctx.strokeStyle = accent;
					ctx.lineWidth = 2;
					ctx.shadowColor = accent;
					ctx.shadowBlur = 8;
					ctx.beginPath();
					const mid = H / 2;
					const len = Math.min(pcm.length, 1024);
					for (let i = 0; i < len; i++) {
						const x = (i / (len - 1)) * W;
						const y = mid - pcm[i] * mid * 1.5;
						if (i === 0) ctx.moveTo(x, y);
						else ctx.lineTo(x, y);
					}
					ctx.stroke();
					ctx.shadowBlur = 0;
				}
			} else if (currentMode === 'vu') {
				if (pcm) {
					let sumL = 0,
						sumR = 0,
						count = 0;
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
					const drawVU = (rms: number, y: number, h: number, label: string) => {
						const db = rms > 0 ? 20 * Math.log10(rms) : DB_FLOOR;
						const fill =
							Math.max(0, Math.min(1, (db - DB_FLOOR) / -DB_FLOOR)) * W;
						const grad = ctx.createLinearGradient(0, 0, W, 0);
						grad.addColorStop(0, accent);
						grad.addColorStop(0.7, accent);
						grad.addColorStop(0.85, '#f0c040');
						grad.addColorStop(1, '#e04040');
						ctx.fillStyle = '#222';
						ctx.fillRect(0, y, W, h);
						ctx.fillStyle = grad;
						ctx.fillRect(0, y, fill, h);
						const fontSize = Math.min(h * 0.6, 20);
						ctx.fillStyle = 'rgba(255,255,255,0.5)';
						ctx.font = `${fontSize}px sans-serif`;
						ctx.fillText(label, 12, y + h / 2 + fontSize * 0.35);
						const dbText = `${db.toFixed(1)} dB`;
						const dbWidth = ctx.measureText(dbText).width;
						ctx.fillText(dbText, W - dbWidth - 12, y + h / 2 + fontSize * 0.35);
					};
					const barH = H * 0.15;
					const pad = H * 0.3;
					drawVU(vuSmoothed.L, pad, barH, 'L');
					drawVU(vuSmoothed.R, pad + barH + 12, barH, 'R');
				}
			} else if (currentMode === 'starfield') {
				const NUM_STARS = 800;
				const MAX_DEPTH = 1500;

				if (!stars || stars.length !== NUM_STARS) {
					stars = Array.from({ length: NUM_STARS }, () => ({
						x: (Math.random() - 0.5) * W * 2,
						y: (Math.random() - 0.5) * H * 2,
						z: Math.random() * MAX_DEPTH,
						pz: Math.random() * MAX_DEPTH
					}));
				}

				let rms = 0;
				let bassEnergy = 0;
				if (pcm) {
					let sum = 0;
					for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
					rms = Math.sqrt(sum / pcm.length);
					let bassSum = 0;
					const bassN = Math.min(64, pcm.length);
					for (let i = 0; i < bassN; i++) bassSum += Math.abs(pcm[i]);
					bassEnergy = bassSum / bassN;
				}

				const baseSpeed = getStarfieldBaseSpeed();
				const reactivity = getStarfieldReactivity();
				const targetSpeed = baseSpeed + (bassEnergy * 60 + rms * 30) * (reactivity / 100);
				starSpeed += 0.15 * (targetSpeed - starSpeed);
				const speed = starSpeed;
				const cx = W / 2;
				const cy = H / 2;
				const fov = 256;

				ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.15, 0.4 - rms * 0.5)})`;
				ctx.fillRect(0, 0, W, H);

				for (let i = 0; i < stars.length; i++) {
					const s = stars[i];
					s.pz = s.z;
					s.z -= speed;

					if (s.z <= 0) {
						s.x = (Math.random() - 0.5) * W * 2;
						s.y = (Math.random() - 0.5) * H * 2;
						s.z = MAX_DEPTH;
						s.pz = MAX_DEPTH;
						continue;
					}

					const sx = cx + (s.x / s.z) * fov;
					const sy = cy + (s.y / s.z) * fov;
					if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;

					const px = cx + (s.x / s.pz) * fov;
					const py = cy + (s.y / s.pz) * fov;
					const depthNorm = 1 - s.z / MAX_DEPTH;
					const brightness = Math.min(1, depthNorm * depthNorm * 1.5);
					const size = Math.max(0.5, depthNorm * 3);

					if (speed > 2) {
						ctx.strokeStyle = `rgba(200, 210, 255, ${brightness * 0.6})`;
						ctx.lineWidth = size * 0.6;
						ctx.beginPath();
						ctx.moveTo(px, py);
						ctx.lineTo(sx, sy);
						ctx.stroke();
					}

					ctx.fillStyle = `rgba(220, 230, 255, ${brightness})`;
					ctx.beginPath();
					ctx.arc(sx, sy, size, 0, Math.PI * 2);
					ctx.fill();
				}
			}

			raf = requestAnimationFrame(draw);
		}

		raf = requestAnimationFrame(draw);

		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-[100] flex flex-col bg-black">
	<!-- Close button -->
	<button
		type="button"
		class="absolute top-4 right-4 z-20 text-xl text-white/30 transition-colors hover:text-white"
		onclick={close}
		aria-label="Close visualizer"
	>
		<X size={20} />
	</button>

	<!-- Canvas area -->
	<div class="relative flex-1">
		{#if visMode === 'milkdrop'}
			<MilkdropVisualizer bind:this={milkdropRef} />
		{:else}
			<canvas bind:this={canvasEl} class="absolute inset-0 h-full w-full"></canvas>
		{/if}

		<!-- Preset browser panel (overlays canvas) -->
		{#if browserOpen && visMode === 'milkdrop'}
			<MilkdropPresetBrowser presetKeys={milkdropPresetKeys} />
		{/if}
	</div>

	<!-- Bottom bar -->
	<div class="z-10 flex items-center gap-4 bg-black/80 px-5 py-3">
		<!-- Track info -->
		<div class="flex shrink-0 items-center gap-3">
			{#if display?.artwork}
				<CachedImage src={display.artwork} alt="" class="h-10 w-10 rounded object-cover" lazy={false} />
			{/if}
			<div class="min-w-0">
				<div class="max-w-[180px] truncate text-sm font-semibold text-white">
					{display?.title ?? '—'}
				</div>
				<div class="max-w-[180px] truncate text-xs text-white/50">
					{display?.subtitle ?? ''}
				</div>
			</div>
		</div>

		<!-- Playback controls -->
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="text-white/70 transition-colors hover:text-white"
				onclick={() => skipPrevious()}
				aria-label="Previous"
			>
				<SkipBack size={18} />
			</button>
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
				onclick={() => togglePlayback()}
				aria-label={playState === 'playing' ? 'Pause' : 'Play'}
			>
				{#if playState === 'playing'}
					<Pause size={18} />
				{:else}
					<Play size={18} />
				{/if}
			</button>
			<button
				type="button"
				class="text-white/70 transition-colors hover:text-white"
				onclick={() => skipNext()}
				aria-label="Next"
			>
				<SkipForward size={18} />
			</button>
		</div>

		<!-- Seek bar -->
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<span class="shrink-0 text-[0.625rem] tabular-nums text-white/50">
				{formatTime(seekHoverPct !== null ? dur * seekHoverPct / 100 : pos)}
			</span>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative min-w-0 flex-1 cursor-pointer select-none"
				onmousemove={onSeekHover}
				onmouseleave={() => (seekHoverPct = null)}
				onclick={onSeekClick}
			>
				<SeekVisualizer {progressPct} hoverPct={seekHoverPct} mode="spectrum" />
			</div>
			<span class="shrink-0 text-[0.625rem] tabular-nums text-white/50">
				{formatTime(dur)}
			</span>
		</div>

		<!-- Mode-specific inline controls (between seek bar and mode pills) -->
		{#if visMode === 'milkdrop'}
			<span class="text-white/10">|</span>
			<div class="flex shrink-0 items-center gap-1.5">
				<button
					type="button"
					class="rounded bg-white/10 p-1 text-white/70 transition-colors hover:bg-white/20"
					onclick={() => milkdropRef?.prevPreset()}
					aria-label="Previous preset"
					title="Previous preset (←)"
				>
					<ChevronLeft size={14} />
				</button>
				<button
					type="button"
					class="max-w-[140px] truncate text-xs text-white/50 transition-colors hover:text-white/80"
					onclick={togglePresetBrowser}
					title="Browse presets (B)"
				>
					{currentPreset ?? 'Preset'}
				</button>
				<button
					type="button"
					class="rounded bg-white/10 p-1 text-white/70 transition-colors hover:bg-white/20"
					onclick={() => milkdropRef?.nextPreset()}
					aria-label="Next preset"
					title="Next preset (→)"
				>
					<ChevronRight size={14} />
				</button>
				<button
					type="button"
					class="rounded bg-white/10 p-1 text-white/70 transition-colors hover:bg-white/20"
					onclick={() => milkdropRef?.randomPreset()}
					aria-label="Random preset"
					title="Random preset (R)"
				>
					<Shuffle size={14} />
				</button>
				<button
					type="button"
					class="rounded p-1 transition-colors {currentPreset && isFavorite(currentPreset) ? 'text-red-400 bg-red-400/10' : 'bg-white/10 text-white/70 hover:bg-white/20'}"
					onclick={() => currentPreset && toggleFavorite(currentPreset)}
					aria-label="Toggle favorite"
					title="Favorite (F)"
				>
					<Heart size={14} fill={currentPreset && isFavorite(currentPreset) ? 'currentColor' : 'none'} />
				</button>
				<button
					type="button"
					class="rounded p-1 transition-colors {cycleEnabled ? 'text-accent bg-accent/10' : 'bg-white/10 text-white/70 hover:bg-white/20'}"
					onclick={() => setAutoCycleEnabled(!cycleEnabled)}
					aria-label="Toggle auto-cycle"
					title="Auto-cycle ({cycleIntervalSec}s)"
				>
					<Timer size={14} />
				</button>
				<button
					type="button"
					class="rounded p-1 transition-colors {browserOpen ? 'text-accent bg-accent/10' : 'bg-white/10 text-white/70 hover:bg-white/20'}"
					onclick={togglePresetBrowser}
					aria-label="Browse presets"
					title="Browse presets (B)"
				>
					<List size={14} />
				</button>
			</div>
		{:else if visMode === 'starfield'}
			<span class="text-white/10">|</span>
			<div class="flex shrink-0 items-center gap-3">
				<label class="flex items-center gap-1.5 text-xs text-white/50">
					Reactivity
					<input
						type="range"
						min="0"
						max="100"
						step="1"
						value={sfReactivity}
						oninput={(e) => setStarfieldReactivity(Number(e.currentTarget.value))}
						class="h-1 w-20 accent-accent"
					/>
					<span class="w-6 text-right tabular-nums text-white/40">{sfReactivity}</span>
				</label>
				<label class="flex items-center gap-1.5 text-xs text-white/50">
					Speed
					<input
						type="range"
						min="1"
						max="10"
						step="0.5"
						value={sfBaseSpeed}
						oninput={(e) => setStarfieldBaseSpeed(Number(e.currentTarget.value))}
						class="h-1 w-20 accent-accent"
					/>
					<span class="w-6 text-right tabular-nums text-white/40">{sfBaseSpeed}</span>
				</label>
			</div>
		{/if}

		<!-- Separator -->
		<span class="text-white/10">|</span>

		<!-- Mode pills -->
		<div class="flex shrink-0 gap-1.5">
			{#each MODES as m}
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs capitalize transition-colors {visMode === m
						? 'bg-accent font-semibold text-black'
						: 'bg-white/10 text-white/70 hover:bg-white/20'}"
					onclick={() => setFullscreenVisMode(m)}
				>
					{m}
				</button>
			{/each}
		</div>
	</div>
</div>
