const STORAGE_KEY = 'sleep-timer';

/** Parse a timer value like '15m', '1h', or a custom '90m' into seconds. Returns 0 for 'eot'. */
function parseToSeconds(value: string): number {
	if (value === 'eot') return 0;
	if (value.endsWith('h')) return parseInt(value) * 3600;
	if (value.endsWith('m')) return parseInt(value) * 60;
	return 0;
}

let selected = $state<string | null>(null);
let remainingSeconds = $state(0);
let intervalId: ReturnType<typeof setInterval> | null = null;

function clearTimer() {
	if (intervalId !== null) {
		clearInterval(intervalId);
		intervalId = null;
	}
}

function saveTimer() {
	if (selected === null) {
		localStorage.removeItem(STORAGE_KEY);
		return;
	}
	if (selected === 'eot') {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected: 'eot', endsAt: 0 }));
		return;
	}
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({ selected, endsAt: Date.now() + remainingSeconds * 1000 })
	);
}

function clearPersisted() {
	localStorage.removeItem(STORAGE_KEY);
}

function tick() {
	remainingSeconds--;
	if (remainingSeconds <= 0) {
		expire();
	}
}

function expire() {
	clearTimer();
	selected = null;
	remainingSeconds = 0;
	clearPersisted();
	// TODO: pause playback when player state machine is wired up
}

export function getSleepTimer() {
	return { selected, remainingSeconds };
}

export function startSleepTimer(value: string) {
	clearTimer();

	if (value === 'eot') {
		// End-of-track: no countdown, handled by player on track end
		selected = value;
		remainingSeconds = 0;
		saveTimer();
		return;
	}

	const secs = parseToSeconds(value);
	if (secs <= 0) return;

	selected = value;
	remainingSeconds = secs;
	intervalId = setInterval(tick, 1000);
	saveTimer();
}

export function cancelSleepTimer() {
	clearTimer();
	selected = null;
	remainingSeconds = 0;
	clearPersisted();
}

/** Check if the sleep timer should fire on end-of-track. Call from player when a track ends. */
export function onTrackEnd() {
	if (selected === 'eot') {
		expire();
	}
}

export function formatRemaining(): string {
	if (selected === 'eot') return 'End of track';
	if (remainingSeconds <= 0) return '';
	const m = Math.floor(remainingSeconds / 60);
	const s = remainingSeconds % 60;
	if (m >= 60) {
		const h = Math.floor(m / 60);
		const rm = m % 60;
		return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	return `${m}:${String(s).padStart(2, '0')}`;
}

// Restore timer from localStorage on module load
function restoreTimer() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const data = JSON.parse(raw);
		if (!data.selected) return;

		if (data.selected === 'eot') {
			selected = 'eot';
			remainingSeconds = 0;
			return;
		}

		const remaining = Math.round((data.endsAt - Date.now()) / 1000);
		if (remaining <= 0) {
			// Timer expired while away
			clearPersisted();
			return;
		}

		selected = data.selected;
		remainingSeconds = remaining;
		intervalId = setInterval(tick, 1000);
	} catch {
		// ignore corrupt data
	}
}

restoreTimer();
