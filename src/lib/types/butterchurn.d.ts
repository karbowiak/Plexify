declare module 'butterchurn' {
	interface VisualizerOptions {
		width: number;
		height: number;
		meshWidth?: number;
		meshHeight?: number;
		pixelRatio?: number;
	}

	interface Visualizer {
		connectAudio(node: AudioNode): void;
		disconnectAudio(node: AudioNode): void;
		setRendererSize(width: number, height: number): void;
		loadPreset(preset: object, blendTime?: number): void;
		render(): void;
		launchSongTitleAnim(title: string): void;
	}

	function createVisualizer(
		audioContext: AudioContext,
		canvas: HTMLCanvasElement,
		options: VisualizerOptions
	): Visualizer;

	export default { createVisualizer };
}

declare module 'butterchurn-presets' {
	interface PresetsModule {
		getPresets(): Record<string, object>;
	}
	const presetsModule: PresetsModule;
	export default presetsModule;
}
