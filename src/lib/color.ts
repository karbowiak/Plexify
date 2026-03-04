/**
 * Returns black or white depending on which has better contrast against the given hex color.
 * Uses WCAG relative luminance formula.
 */
export function contrastColor(hex: string): '#000000' | '#ffffff' {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;

	// sRGB to linear
	const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

	return luminance > 0.179 ? '#000000' : '#ffffff';
}
