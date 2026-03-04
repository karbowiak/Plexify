let hasLyrics = $state(false);

export function getHasLyrics(): boolean {
	return hasLyrics;
}

export function setHasLyrics(value: boolean) {
	hasLyrics = value;
}
