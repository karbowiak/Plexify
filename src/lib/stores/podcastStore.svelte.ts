import type {
	Podcast,
	PodcastSubscription
} from '$lib/podcast/types';

const STORAGE_KEY = 'podcast-state';

// ---------------------------------------------------------------------------
// Persisted state
// ---------------------------------------------------------------------------

interface PersistedState {
	subscriptions: PodcastSubscription[];
	listenProgress: Record<string, Record<string, number>>; // feedUrl → guid → secs
	completedEpisodes: Record<string, string[]>; // feedUrl → guid[]
}

function load(): PersistedState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				subscriptions: parsed.subscriptions ?? [],
				listenProgress: parsed.listenProgress ?? {},
				completedEpisodes: parsed.completedEpisodes ?? {}
			};
		}
	} catch {
		// ignore
	}
	return { subscriptions: [], listenProgress: {}, completedEpisodes: {} };
}

const initial = load();

let subscriptions = $state<PodcastSubscription[]>(initial.subscriptions);
let listenProgress = $state<Record<string, Record<string, number>>>(initial.listenProgress);
let completedEpisodes = $state<Record<string, string[]>>(initial.completedEpisodes);

function save() {
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({ subscriptions, listenProgress, completedEpisodes })
	);
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export function getSubscriptions(): PodcastSubscription[] {
	return subscriptions;
}

export function subscribe(podcast: Podcast | PodcastSubscription) {
	const isPodcast = 'feed_url' in podcast;
	const feedUrl = isPodcast ? (podcast as Podcast).feed_url : (podcast as PodcastSubscription).feedUrl;
	if (subscriptions.some((s) => s.feedUrl === feedUrl)) return;
	subscriptions = [
		{
			feedUrl,
			podcastId: isPodcast ? (podcast as Podcast).id : (podcast as PodcastSubscription).podcastId,
			title: podcast.title,
			author: podcast.author,
			artworkUrl: isPodcast ? (podcast as Podcast).artwork_url : (podcast as PodcastSubscription).artworkUrl,
			addedAt: Date.now()
		},
		...subscriptions
	];
	save();
}

export function unsubscribe(feedUrl: string) {
	subscriptions = subscriptions.filter((s) => s.feedUrl !== feedUrl);
	save();
}

export function isSubscribed(feedUrl: string): boolean {
	return subscriptions.some((s) => s.feedUrl === feedUrl);
}

// ---------------------------------------------------------------------------
// Listen progress
// ---------------------------------------------------------------------------

export function setEpisodeProgress(feedUrl: string, guid: string, secs: number) {
	if (!listenProgress[feedUrl]) {
		listenProgress[feedUrl] = {};
	}
	listenProgress[feedUrl][guid] = secs;
	save();
}

export function getEpisodeProgress(feedUrl: string, guid: string): number {
	return listenProgress[feedUrl]?.[guid] ?? 0;
}

export function markCompleted(feedUrl: string, guid: string) {
	if (!completedEpisodes[feedUrl]) {
		completedEpisodes[feedUrl] = [];
	}
	if (!completedEpisodes[feedUrl].includes(guid)) {
		completedEpisodes[feedUrl] = [...completedEpisodes[feedUrl], guid];
		save();
	}
}

export function isCompleted(feedUrl: string, guid: string): boolean {
	return completedEpisodes[feedUrl]?.includes(guid) ?? false;
}
