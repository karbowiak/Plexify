<script lang="ts">
	import { getAudioContext, getAnalyserNode } from '$lib/stores/playerStore.svelte';
	import {
		getCurrentPresetName,
		setCurrentPreset,
		getAutoCycleEnabled,
		getAutoCycleIntervalSec,
		getAutoCycleMode
	} from '$lib/stores/visualizerStore.svelte';

	let canvas: HTMLCanvasElement | undefined = $state();
	let presetName = $state('');
	let error = $state('');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let visualizer: any = null;
	let presetKeys: string[] = [];
	let presetIndex = 0;
	let presets: Record<string, object> = {};
	let ready = $state(false);

	export function getPresetKeys(): string[] {
		return presetKeys;
	}

	export function loadPreset(name: string) {
		if (!visualizer || !presets[name]) return;
		const idx = presetKeys.indexOf(name);
		if (idx >= 0) presetIndex = idx;
		visualizer.loadPreset(presets[name], 2.0);
		presetName = name;
	}

	export function nextPreset() {
		if (!visualizer || presetKeys.length === 0) return;
		presetIndex = (presetIndex + 1) % presetKeys.length;
		const key = presetKeys[presetIndex];
		visualizer.loadPreset(presets[key], 2.0);
		presetName = key;
		setCurrentPreset(key);
	}

	export function prevPreset() {
		if (!visualizer || presetKeys.length === 0) return;
		presetIndex = (presetIndex - 1 + presetKeys.length) % presetKeys.length;
		const key = presetKeys[presetIndex];
		visualizer.loadPreset(presets[key], 2.0);
		presetName = key;
		setCurrentPreset(key);
	}

	export function randomPreset() {
		if (!visualizer || presetKeys.length === 0) return;
		presetIndex = Math.floor(Math.random() * presetKeys.length);
		const key = presetKeys[presetIndex];
		visualizer.loadPreset(presets[key], 2.0);
		presetName = key;
		setCurrentPreset(key);
	}

	// Watch store for external preset changes (e.g. from browser panel)
	$effect(() => {
		const storeName = getCurrentPresetName();
		if (!ready || !storeName || storeName === presetName || !presets[storeName]) return;
		loadPreset(storeName);
	});

	// Reactive auto-cycle driven by store
	$effect(() => {
		const enabled = getAutoCycleEnabled();
		const intervalSec = getAutoCycleIntervalSec();
		const mode = getAutoCycleMode();

		if (!enabled || !ready) return;

		const interval = setInterval(() => {
			if (!visualizer || presetKeys.length === 0) return;
			if (mode === 'sequential') {
				presetIndex = (presetIndex + 1) % presetKeys.length;
			} else {
				presetIndex = Math.floor(Math.random() * presetKeys.length);
			}
			const key = presetKeys[presetIndex];
			visualizer.loadPreset(presets[key], 2.0);
			presetName = key;
			setCurrentPreset(key);
		}, intervalSec * 1000);

		return () => clearInterval(interval);
	});

	$effect(() => {
		if (!canvas) return;

		const audioCtx = getAudioContext();
		const analyser = getAnalyserNode();
		if (!audioCtx || !analyser) {
			error = 'Audio not initialized — play a track first';
			return;
		}

		let rafId = 0;
		let resizeObserver: ResizeObserver | null = null;
		let cancelled = false;

		(async () => {
			const [butterchurnMod, presetsMod] = await Promise.all([
				import('butterchurn'),
				import('butterchurn-presets')
			]);

			if (cancelled) return;

			const butterchurn = butterchurnMod.default ?? butterchurnMod;
			const presetsExport = presetsMod.default ?? presetsMod;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const raw = presetsExport as any;
			presets = typeof raw.getPresets === 'function' ? raw.getPresets() : raw;
			presetKeys = Object.keys(presets);

			if (presetKeys.length === 0) {
				error = 'No presets found';
				return;
			}

			const W = canvas!.clientWidth * (window.devicePixelRatio || 1);
			const H = canvas!.clientHeight * (window.devicePixelRatio || 1);
			canvas!.width = W;
			canvas!.height = H;

			try {
				visualizer = butterchurn.createVisualizer(audioCtx, canvas!, {
					width: W,
					height: H
				});
			} catch (err) {
				error = `WebGL not supported: ${err}`;
				return;
			}

			visualizer.connectAudio(analyser);

			// Load stored preset or random
			const storedName = getCurrentPresetName();
			if (storedName && presets[storedName]) {
				presetIndex = presetKeys.indexOf(storedName);
				visualizer.loadPreset(presets[storedName], 0);
				presetName = storedName;
			} else {
				presetIndex = Math.floor(Math.random() * presetKeys.length);
				const initialKey = presetKeys[presetIndex];
				visualizer.loadPreset(presets[initialKey], 0);
				presetName = initialKey;
				setCurrentPreset(initialKey);
			}

			ready = true;

			// Render loop
			function render() {
				if (cancelled) return;
				try {
					visualizer?.render();
				} catch {
					return;
				}
				rafId = requestAnimationFrame(render);
			}
			rafId = requestAnimationFrame(render);

			// Handle resize
			resizeObserver = new ResizeObserver(() => {
				if (!canvas || !visualizer) return;
				const w = canvas.clientWidth * (window.devicePixelRatio || 1);
				const h = canvas.clientHeight * (window.devicePixelRatio || 1);
				canvas.width = w;
				canvas.height = h;
				visualizer.setRendererSize(w, h);
			});
			resizeObserver.observe(canvas!);
		})().catch((err) => {
			if (!cancelled) error = `Failed to load Milkdrop: ${err}`;
		});

		return () => {
			cancelled = true;
			ready = false;
			cancelAnimationFrame(rafId);
			resizeObserver?.disconnect();
			if (visualizer && analyser) {
				try {
					visualizer.disconnectAudio(analyser);
				} catch {}
			}
			visualizer = null;
		};
	});
</script>

{#if error}
	<div class="flex h-full w-full items-center justify-center text-white/50">
		{error}
	</div>
{:else}
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full"></canvas>
{/if}
