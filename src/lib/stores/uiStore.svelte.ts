const STORAGE_KEY = 'ui-state';

export type SidePanel = 'queue' | 'lyrics' | null;
export type PanelType = SidePanel; // backwards compat alias

interface UiState {
	sidePanel: SidePanel;
	artExpanded: boolean;
}

const defaults: UiState = {
	sidePanel: null,
	artExpanded: false
};

function load(): UiState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return { ...defaults, ...parsed };
		}
	} catch {
		// ignore corrupt data
	}
	return { ...defaults };
}

const initial = load();

let sidePanel = $state<SidePanel>(initial.sidePanel);
let artExpanded = $state(initial.artExpanded);
let artFullscreen = $state(false); // never persisted

function save() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify({ sidePanel, artExpanded }));
}

// Side panel
export function getSidePanel(): SidePanel {
	return sidePanel;
}

export function toggleQueue() {
	sidePanel = sidePanel === 'queue' ? null : 'queue';
	save();
}

export function toggleLyrics() {
	sidePanel = sidePanel === 'lyrics' ? null : 'lyrics';
	save();
}

export function setSidePanel(tab: 'queue' | 'lyrics') {
	sidePanel = tab;
	save();
}

export function closeSidePanel() {
	sidePanel = null;
	save();
}

// Album art
export function getArtExpanded(): boolean {
	return artExpanded;
}

export function toggleArtExpanded() {
	artExpanded = !artExpanded;
	save();
}

export function setArtExpanded(value: boolean) {
	artExpanded = value;
	save();
}

export function getArtFullscreen(): boolean {
	return artFullscreen;
}

export function setArtFullscreen(value: boolean) {
	artFullscreen = value;
	// intentionally not persisted
}

// Create Playlist modal
let showCreatePlaylist = $state(false);

export function getShowCreatePlaylist(): boolean {
	return showCreatePlaylist;
}

export function toggleCreatePlaylist() {
	showCreatePlaylist = !showCreatePlaylist;
}

export function closeCreatePlaylist() {
	showCreatePlaylist = false;
}
