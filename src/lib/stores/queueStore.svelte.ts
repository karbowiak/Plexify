import { nowPlaying as nowPlayingData, queueTracks } from '$lib/data/queue';

interface QueueTrack {
	title: string;
	artist: string;
	duration: string;
}

let tracks = $state<QueueTrack[]>([...queueTracks]);
let originalOrder = $state<QueueTrack[]>([]);
let nowPlaying = $state<QueueTrack>({ ...nowPlayingData });

/** Fisher-Yates shuffle. Saves original order first. */
export function shuffleQueue() {
	originalOrder = [...tracks];
	const shuffled = [...tracks];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	tracks = shuffled;
}

/** Restores original order saved before shuffle. */
export function unshuffleQueue() {
	if (originalOrder.length > 0) {
		tracks = [...originalOrder];
		originalOrder = [];
	}
}

/** Move a track from one index to another (drag-to-reorder). */
export function reorderQueue(from: number, to: number) {
	const newQueue = [...tracks];
	const [item] = newQueue.splice(from, 1);
	newQueue.splice(to, 0, item);
	tracks = newQueue;
}

export function getQueueTracks(): QueueTrack[] {
	return tracks;
}

export function getNowPlaying(): QueueTrack {
	return nowPlaying;
}

export function getQueueCount(): number {
	return tracks.length;
}
