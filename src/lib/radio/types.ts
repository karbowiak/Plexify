export type { RadioStation, RadioCountry, RadioTag } from '$lib/backends/models/radioStation';

/** Convert ISO 3166-1 alpha-2 code to flag emoji */
export function countryFlag(code: string): string {
	if (!code || code.length !== 2) return '';
	return [...code.toUpperCase()]
		.map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
		.join('');
}
