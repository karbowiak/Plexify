import { Capability, type Backend, type BackendMetadata, type ResourceResolver } from '../types';
import type {
	Podcast,
	PodcastEpisode,
	PodcastDetail,
	PodcastCategory
} from '../models/podcast';
import {
	searchPodcasts as apiSearchPodcasts,
	trendingPodcasts as apiTrendingPodcasts,
	getCategories as apiGetCategories,
	getPodcastFeed as apiGetPodcastFeed
} from '$lib/podcast/api';

const BACKEND_ID = 'podcast-index';
const IMG_PREFIX = 'podcastindex-image://';

function prefixArtwork(url: string | null): string | null {
	return url ? IMG_PREFIX + url : null;
}

function addBackendId<T extends { artwork_url?: string | null }>(item: T): T & { backendId: string } {
	return {
		...item,
		backendId: BACKEND_ID,
		artwork_url: prefixArtwork(item.artwork_url ?? null) as T['artwork_url']
	};
}

function addBackendIdToEpisode<T extends { artwork_url?: string | null }>(item: T): T & { backendId: string } {
	return {
		...item,
		backendId: BACKEND_ID,
		artwork_url: prefixArtwork(item.artwork_url ?? null) as T['artwork_url']
	};
}

export class PodcastIndexBackend implements Backend {
	readonly id = BACKEND_ID;
	readonly capabilities = new Set<Capability>([Capability.Podcasts]);
	private _connected = false;

	readonly resolvers: ResourceResolver[] = [
		{
			protocol: 'podcastindex-image',
			resolve(resourcePath) {
				return { url: resourcePath };
			}
		}
	];

	readonly metadata: BackendMetadata = {
		name: 'Podcast Index',
		description: 'Discover and listen to podcasts via the Podcast Index API',
		icon: 'podcast',
		version: '1.0.0',
		author: 'Built-in',
		configFields: []
	};

	async connect(): Promise<void> {
		this._connected = true;
	}

	async disconnect(): Promise<void> {
		this._connected = false;
	}

	isConnected(): boolean {
		return this._connected;
	}

	supports(capability: Capability): boolean {
		return this.capabilities.has(capability);
	}

	async searchPodcasts(query: string, max?: number): Promise<Podcast[]> {
		const results = await apiSearchPodcasts(query, max);
		return results.map(addBackendId);
	}

	async getTrendingPodcasts(max?: number, category?: string): Promise<Podcast[]> {
		const results = await apiTrendingPodcasts(max, category);
		return results.map(addBackendId);
	}

	async getPodcastCategories(): Promise<PodcastCategory[]> {
		return apiGetCategories();
	}

	async getPodcastFeed(feedUrl: string): Promise<PodcastDetail> {
		const raw = await apiGetPodcastFeed(feedUrl);
		return {
			...addBackendId(raw),
			episodes: raw.episodes.map(addBackendIdToEpisode)
		};
	}

	async getPodcastEpisodeStreamUrl(episode: PodcastEpisode): Promise<string> {
		return episode.audio_url;
	}
}
