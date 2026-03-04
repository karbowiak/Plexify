import { getAppearance } from './configStore.svelte';

// --- Color helpers ---
function hexToHsl(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	let r: number, g: number, b: number;
	if (s === 0) {
		r = g = b = l;
	} else {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h / 360 + 1 / 3);
		g = hue2rgb(p, q, h / 360);
		b = hue2rgb(p, q, h / 360 - 1 / 3);
	}
	const toHex = (v: number) =>
		Math.round(Math.min(255, Math.max(0, v * 255)))
			.toString(16)
			.padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lighten(hex: string, amount: number): string {
	const [h, s, l] = hexToHsl(hex);
	return hslToHex(h, s, Math.min(1, l + amount));
}

function hexToRgb(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `${r}, ${g}, ${b}`;
}

// --- Font loading ---
const GOOGLE_FONTS: Record<string, string> = {
	Inter: 'Inter:wght@400;500;600;700',
	Geist: 'Geist:wght@400;500;600;700',
	Montserrat: 'Montserrat:wght@400;500;600;700',
	Nunito: 'Nunito:wght@400;500;600;700'
};

let loadedFont: string | null = null;
let fontLink: HTMLLinkElement | null = null;

function loadFont(font: string) {
	if (font === loadedFont) return;
	loadedFont = font;

	if (fontLink) {
		fontLink.remove();
		fontLink = null;
	}

	if (font === 'System' || font === 'Circular') return;

	const spec = GOOGLE_FONTS[font];
	if (!spec) return;

	fontLink = document.createElement('link');
	fontLink.rel = 'stylesheet';
	fontLink.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
	document.head.appendChild(fontLink);
}

function getFontFamily(font: string): string {
	if (font === 'System') {
		return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";
	}
	if (font === 'Circular') {
		return "'Circular', -apple-system, BlinkMacSystemFont, sans-serif";
	}
	return `'${font}', -apple-system, BlinkMacSystemFont, sans-serif`;
}

// --- Theme defaults ---
export const DARK_DEFAULTS = {
	bgBase: '#08080c',
	bgSurface: '#0f1014',
	bgElevated: '#16161e',
	bgHighlight: '#1e1e28',
	bgHover: '#262630',
	textPrimary: '#f0f0f0',
	textSecondary: '#a8a8b3',
	textMuted: '#5a5a6e'
};

export const LIGHT_DEFAULTS = {
	bgBase: '#f8f8fa',
	bgSurface: '#ffffff',
	bgElevated: '#f0f0f4',
	bgHighlight: '#e4e4ec',
	bgHover: '#d8d8e2',
	textPrimary: '#1a1a2e',
	textSecondary: '#5a5a72',
	textMuted: '#9898aa'
};

// Base color defaults for overlay/scrollbar/range/accent-secondary
export const DARK_OVERLAY_BASE = '#ffffff';
export const LIGHT_OVERLAY_BASE = '#000000';
export const DARK_SCROLLBAR_BASE = '#a0a0be';
export const LIGHT_SCROLLBAR_BASE = '#000000';
export const DARK_RANGE_TRACK_BASE = '#ffffff';
export const LIGHT_RANGE_TRACK_BASE = '#000000';
export const ACCENT_SECONDARY_DEFAULT = '#e8a849';

const DARK_OVERLAYS = {
	overlay: 'rgba(255, 255, 255, 0.06)',
	overlayHover: 'rgba(255, 255, 255, 0.1)',
	overlaySubtle: 'rgba(255, 255, 255, 0.04)',
	overlayMedium: 'rgba(255, 255, 255, 0.12)',
	border: 'rgba(255, 255, 255, 0.06)',
	scrollbarThumb: 'rgba(160, 160, 190, 0.12)',
	scrollbarThumbHover: 'rgba(160, 160, 190, 0.22)',
	rangeTrack: 'rgba(255, 255, 255, 0.2)'
};

const LIGHT_OVERLAYS = {
	overlay: 'rgba(0, 0, 0, 0.05)',
	overlayHover: 'rgba(0, 0, 0, 0.08)',
	overlaySubtle: 'rgba(0, 0, 0, 0.03)',
	overlayMedium: 'rgba(0, 0, 0, 0.1)',
	border: 'rgba(0, 0, 0, 0.08)',
	scrollbarThumb: 'rgba(0, 0, 0, 0.12)',
	scrollbarThumbHover: 'rgba(0, 0, 0, 0.22)',
	rangeTrack: 'rgba(0, 0, 0, 0.15)'
};

// --- System theme detection ---
function getSystemTheme(): 'dark' | 'light' {
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

function resolveTheme(theme: 'dark' | 'light' | 'system'): 'dark' | 'light' {
	return theme === 'system' ? getSystemTheme() : theme;
}

// --- Apply ---
export function applyTheme() {
	const config = getAppearance();
	const el = document.documentElement;
	const s = el.style;

	// System theme listener
	if (mediaListener && mediaQuery) {
		mediaQuery.removeEventListener('change', mediaListener);
		mediaListener = null;
	}
	if (config.theme === 'system') {
		mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaListener = () => applyTheme();
		mediaQuery.addEventListener('change', mediaListener);
	}

	const resolved = resolveTheme(config.theme);
	el.dataset.theme = resolved;

	// Accent color
	const accent = config.accentColor || '#1db954';
	s.setProperty('--color-accent', accent);
	s.setProperty('--color-accent-hover', lighten(accent, 0.1));
	s.setProperty('--color-glow-accent', `rgba(${hexToRgb(accent)}, 0.15)`);

	// Highlight intensity (0-200 → 0.0-2.0)
	const intensity = (config.highlightIntensity ?? 100) / 100;
	s.setProperty('--highlight-intensity', String(intensity));
	// Computed accent tints using intensity
	const rgb = hexToRgb(accent);
	s.setProperty('--color-accent-tint', `rgba(${rgb}, ${(0.1 * intensity).toFixed(3)})`);
	s.setProperty(
		'--color-accent-tint-subtle',
		`rgba(${rgb}, ${(0.03 * intensity).toFixed(3)})`
	);
	s.setProperty(
		'--color-accent-tint-strong',
		`rgba(${rgb}, ${(0.15 * intensity).toFixed(3)})`
	);
	s.setProperty(
		'--color-accent-tint-hover',
		`rgba(${rgb}, ${(0.06 * intensity).toFixed(3)})`
	);

	// Compact mode
	const compact = config.compactMode;
	s.setProperty('--spacing-sidebar', compact ? '220px' : '260px');
	s.setProperty('--spacing-topbar', compact ? '48px' : '64px');
	s.setProperty('--spacing-player', compact ? '72px' : '90px');

	// Card scale (80-200 → 0.8-2.0)
	const scale = (config.cardSize ?? 100) / 100;
	s.setProperty('--card-scale', String(scale));

	// Font
	loadFont(config.font);
	s.setProperty('--font-family', getFontFamily(config.font));

	// Custom colors or theme defaults
	const colors = config.customColors;
	const def = resolved === 'light' ? LIGHT_DEFAULTS : DARK_DEFAULTS;
	s.setProperty('--color-bg-base', colors?.bgBase ?? def.bgBase);
	s.setProperty('--color-bg-surface', colors?.bgSurface ?? def.bgSurface);
	s.setProperty('--color-bg-elevated', colors?.bgElevated ?? def.bgElevated);
	s.setProperty('--color-bg-highlight', colors?.bgHighlight ?? def.bgHighlight);
	s.setProperty('--color-bg-hover', colors?.bgHover ?? def.bgHover);
	s.setProperty('--color-text-primary', colors?.textPrimary ?? def.textPrimary);
	s.setProperty('--color-text-secondary', colors?.textSecondary ?? def.textSecondary);
	s.setProperty('--color-text-muted', colors?.textMuted ?? def.textMuted);

	// Overlay & border colors (theme-aware transparency)
	if (colors?.overlayBase) {
		const oRgb = hexToRgb(colors.overlayBase);
		const darkAlphas = [0.06, 0.1, 0.04, 0.12, 0.06];
		const lightAlphas = [0.05, 0.08, 0.03, 0.1, 0.08];
		const alphas = resolved === 'light' ? lightAlphas : darkAlphas;
		s.setProperty('--color-overlay', `rgba(${oRgb}, ${alphas[0]})`);
		s.setProperty('--color-overlay-hover', `rgba(${oRgb}, ${alphas[1]})`);
		s.setProperty('--color-overlay-subtle', `rgba(${oRgb}, ${alphas[2]})`);
		s.setProperty('--color-overlay-medium', `rgba(${oRgb}, ${alphas[3]})`);
		s.setProperty('--color-border', `rgba(${oRgb}, ${alphas[4]})`);
	} else {
		const ov = resolved === 'light' ? LIGHT_OVERLAYS : DARK_OVERLAYS;
		s.setProperty('--color-overlay', ov.overlay);
		s.setProperty('--color-overlay-hover', ov.overlayHover);
		s.setProperty('--color-overlay-subtle', ov.overlaySubtle);
		s.setProperty('--color-overlay-medium', ov.overlayMedium);
		s.setProperty('--color-border', ov.border);
	}

	if (colors?.scrollbarBase) {
		const sRgb = hexToRgb(colors.scrollbarBase);
		s.setProperty('--color-scrollbar-thumb', `rgba(${sRgb}, 0.12)`);
		s.setProperty('--color-scrollbar-thumb-hover', `rgba(${sRgb}, 0.22)`);
	} else {
		const ov = resolved === 'light' ? LIGHT_OVERLAYS : DARK_OVERLAYS;
		s.setProperty('--color-scrollbar-thumb', ov.scrollbarThumb);
		s.setProperty('--color-scrollbar-thumb-hover', ov.scrollbarThumbHover);
	}

	if (colors?.rangeTrackBase) {
		const rRgb = hexToRgb(colors.rangeTrackBase);
		const alpha = resolved === 'light' ? 0.15 : 0.2;
		s.setProperty('--color-range-track', `rgba(${rRgb}, ${alpha})`);
	} else {
		const ov = resolved === 'light' ? LIGHT_OVERLAYS : DARK_OVERLAYS;
		s.setProperty('--color-range-track', ov.rangeTrack);
	}

	// Accent secondary
	const accentSec = colors?.accentSecondary ?? ACCENT_SECONDARY_DEFAULT;
	s.setProperty('--color-accent-secondary', accentSec);
	s.setProperty('--color-accent-secondary-hover', lighten(accentSec, 0.1));
}
