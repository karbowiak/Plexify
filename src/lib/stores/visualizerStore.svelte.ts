const STORAGE_KEY = 'visualizer-v1';
const HISTORY_CAP = 50;

interface VisualizerState {
	currentPresetName: string | null;
	autoCycleEnabled: boolean;
	autoCycleIntervalSec: number;
	autoCycleMode: 'random' | 'sequential';
	favoritePresets: string[];
	presetHistory: string[];
	starfieldReactivity: number;
	starfieldBaseSpeed: number;
}

const defaults: VisualizerState = {
	currentPresetName: null,
	autoCycleEnabled: true,
	autoCycleIntervalSec: 45,
	autoCycleMode: 'random',
	favoritePresets: [],
	presetHistory: [],
	starfieldReactivity: 50,
	starfieldBaseSpeed: 3
};

function load(): VisualizerState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return { ...defaults, ...JSON.parse(raw) };
	} catch {
		// ignore corrupt data
	}
	return { ...defaults };
}

const initial = load();

// Persisted state
let currentPresetName = $state<string | null>(initial.currentPresetName);
let autoCycleEnabled = $state(initial.autoCycleEnabled);
let autoCycleIntervalSec = $state(initial.autoCycleIntervalSec);
let autoCycleMode = $state<'random' | 'sequential'>(initial.autoCycleMode);
let favoritePresets = $state<string[]>(initial.favoritePresets);
let presetHistory = $state<string[]>(initial.presetHistory);
let starfieldReactivity = $state(initial.starfieldReactivity);
let starfieldBaseSpeed = $state(initial.starfieldBaseSpeed);

// Ephemeral state
let presetBrowserOpen = $state(false);

function save() {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			currentPresetName,
			autoCycleEnabled,
			autoCycleIntervalSec,
			autoCycleMode,
			favoritePresets,
			presetHistory,
			starfieldReactivity,
			starfieldBaseSpeed
		})
	);
}

// Preset browser
export function getPresetBrowserOpen(): boolean {
	return presetBrowserOpen;
}
export function togglePresetBrowser() {
	presetBrowserOpen = !presetBrowserOpen;
}
export function closePresetBrowser() {
	presetBrowserOpen = false;
}

// Current preset
export function getCurrentPresetName(): string | null {
	return currentPresetName;
}
export function setCurrentPreset(name: string) {
	currentPresetName = name;
	// Prepend to history (deduped, capped)
	presetHistory = [name, ...presetHistory.filter((n) => n !== name)].slice(0, HISTORY_CAP);
	save();
}

// Auto-cycle
export function getAutoCycleEnabled(): boolean {
	return autoCycleEnabled;
}
export function setAutoCycleEnabled(v: boolean) {
	autoCycleEnabled = v;
	save();
}
export function getAutoCycleIntervalSec(): number {
	return autoCycleIntervalSec;
}
export function setAutoCycleIntervalSec(v: number) {
	autoCycleIntervalSec = v;
	save();
}
export function getAutoCycleMode(): 'random' | 'sequential' {
	return autoCycleMode;
}
export function setAutoCycleMode(v: 'random' | 'sequential') {
	autoCycleMode = v;
	save();
}

// Favorites
export function getFavoritePresets(): string[] {
	return favoritePresets;
}
export function toggleFavorite(name: string) {
	if (favoritePresets.includes(name)) {
		favoritePresets = favoritePresets.filter((n) => n !== name);
	} else {
		favoritePresets = [...favoritePresets, name];
	}
	save();
}
export function isFavorite(name: string): boolean {
	return favoritePresets.includes(name);
}

// History
export function getPresetHistory(): string[] {
	return presetHistory;
}

// Starfield
export function getStarfieldReactivity(): number {
	return starfieldReactivity;
}
export function setStarfieldReactivity(n: number) {
	starfieldReactivity = Math.max(0, Math.min(100, n));
	save();
}
export function getStarfieldBaseSpeed(): number {
	return starfieldBaseSpeed;
}
export function setStarfieldBaseSpeed(n: number) {
	starfieldBaseSpeed = Math.max(1, Math.min(10, n));
	save();
}
