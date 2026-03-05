import type { Track } from '$lib/backends/models/track';
import type { RadioStation } from '$lib/radio/types';
import type { PodcastEpisode } from '$lib/podcast/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueItem =
	| { type: 'track'; data: Track }
	| { type: 'radio'; data: RadioStation }
	| {
			type: 'podcast';
			data: PodcastEpisode;
			feedUrl: string;
			podcastTitle: string;
			podcastArtwork: string;
		};

export interface QueueItemDisplay {
	id: string;
	title: string;
	subtitle: string;
	artwork: string | null;
	durationMs: number;
	isStream: boolean;
	isSeekable: boolean;
}

export function toDisplay(item: QueueItem): QueueItemDisplay {
	switch (item.type) {
		case 'track':
			return {
				id: item.data.id,
				title: item.data.title,
				subtitle: item.data.artistName,
				artwork: item.data.thumb,
				durationMs: item.data.duration,
				isStream: false,
				isSeekable: true
			};
		case 'radio':
			return {
				id: item.data.uuid,
				title: item.data.name,
				subtitle: item.data.tags.slice(0, 3).join(' · '),
				artwork: item.data.favicon || null,
				durationMs: 0,
				isStream: true,
				isSeekable: false
			};
		case 'podcast':
			return {
				id: item.data.guid,
				title: item.data.title,
				subtitle: item.podcastTitle,
				artwork: item.data.artwork_url || item.podcastArtwork || null,
				durationMs: item.data.duration_secs * 1000,
				isStream: false,
				isSeekable: true
			};
	}
}

export type MediaType = 'track' | 'radio' | 'podcast' | null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let items = $state<QueueItem[]>([]);
let originalOrder = $state<QueueItem[]>([]);
let currentIndex = $state(-1);

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

export function getItems(): QueueItem[] {
	return items;
}

export function getCurrentIndex(): number {
	return currentIndex;
}

export function getCurrentItem(): QueueItem | null {
	if (currentIndex < 0 || currentIndex >= items.length) return null;
	return items[currentIndex];
}

export function getNextItem(): QueueItem | null {
	const next = currentIndex + 1;
	if (next >= items.length) return null;
	return items[next];
}

export function getQueueCount(): number {
	return items.length;
}

export function hasNext(): boolean {
	return currentIndex + 1 < items.length;
}

export function hasPrevious(): boolean {
	return currentIndex > 0;
}

export function getActiveMediaType(): MediaType {
	const item = getCurrentItem();
	return item?.type ?? null;
}

// ---------------------------------------------------------------------------
// Core mutators
// ---------------------------------------------------------------------------

export function play(newItems: QueueItem[], startIndex = 0) {
	items = [...newItems];
	originalOrder = [];
	currentIndex = Math.max(0, Math.min(startIndex, newItems.length - 1));
}

export function addToQueue(...newItems: QueueItem[]) {
	items = [...items, ...newItems];
}

export function playNext(...newItems: QueueItem[]) {
	const insertAt = currentIndex + 1;
	const updated = [...items];
	updated.splice(insertAt, 0, ...newItems);
	items = updated;
}

export function advanceIndex(): QueueItem | null {
	if (currentIndex + 1 >= items.length) return null;
	currentIndex++;
	return items[currentIndex];
}

export function retreatIndex(): QueueItem | null {
	if (currentIndex <= 0) return null;
	currentIndex--;
	return items[currentIndex];
}

export function setCurrentIndex(index: number) {
	if (index >= 0 && index < items.length) {
		currentIndex = index;
	}
}

export function removeFromQueue(index: number) {
	if (index < 0 || index >= items.length) return;
	items = items.filter((_, i) => i !== index);
	if (index < currentIndex) {
		currentIndex--;
	} else if (index === currentIndex && currentIndex >= items.length) {
		currentIndex = items.length - 1;
	}
}

export function clearQueue() {
	items = [];
	originalOrder = [];
	currentIndex = -1;
}

function getItemId(item: QueueItem): string {
	switch (item.type) {
		case 'track':
			return item.data.id;
		case 'radio':
			return item.data.uuid;
		case 'podcast':
			return item.data.guid;
	}
}

export function shuffleQueue() {
	const current = getCurrentItem();
	originalOrder = [...items];

	const rest = items.filter((_, i) => i !== currentIndex);
	for (let i = rest.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[rest[i], rest[j]] = [rest[j], rest[i]];
	}

	if (current) {
		items = [current, ...rest];
		currentIndex = 0;
	} else {
		items = rest;
	}
}

export function unshuffleQueue() {
	if (originalOrder.length === 0) return;
	const current = getCurrentItem();
	items = [...originalOrder];
	originalOrder = [];
	if (current) {
		const id = getItemId(current);
		const idx = items.findIndex((item) => getItemId(item) === id);
		currentIndex = idx >= 0 ? idx : 0;
	}
}

export function reorderQueue(from: number, to: number) {
	const newQueue = [...items];
	const [item] = newQueue.splice(from, 1);
	newQueue.splice(to, 0, item);
	items = newQueue;

	if (from === currentIndex) {
		currentIndex = to;
	} else if (from < currentIndex && to >= currentIndex) {
		currentIndex--;
	} else if (from > currentIndex && to <= currentIndex) {
		currentIndex++;
	}
}

// ---------------------------------------------------------------------------
// Convenience wrappers (combine queue mutation + trigger playback)
// ---------------------------------------------------------------------------

export function playTracksNow(tracks: Track[], startIndex = 0) {
	const queueItems: QueueItem[] = tracks.map((t) => ({ type: 'track', data: t }));
	play(queueItems, startIndex);
	// Caller should call playerStore.playCurrentItem() after this
}

export function addTracksToQueue(...tracks: Track[]) {
	addToQueue(...tracks.map((t): QueueItem => ({ type: 'track', data: t })));
}

export function playRadioNow(station: RadioStation) {
	play([{ type: 'radio', data: station }]);
	// Caller should call playerStore.playCurrentItem() after this
}

export function playPodcastNow(
	episode: PodcastEpisode,
	feedUrl: string,
	podcastTitle: string,
	podcastArtwork: string,
	allEpisodes?: PodcastEpisode[]
) {
	const episodes = allEpisodes && allEpisodes.length > 0 ? allEpisodes : [episode];
	const queueItems: QueueItem[] = episodes.map((ep) => ({
		type: 'podcast',
		data: ep,
		feedUrl,
		podcastTitle,
		podcastArtwork
	}));
	const startIdx = episodes.findIndex((ep) => ep.guid === episode.guid);
	play(queueItems, startIdx >= 0 ? startIdx : 0);
	// Caller should call playerStore.playCurrentItem() after this
}
