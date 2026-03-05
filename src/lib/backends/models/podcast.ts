export interface Podcast {
	backendId?: string;
	id: number;
	title: string;
	author: string;
	description: string;
	artwork_url: string;
	feed_url: string;
	categories: Record<string, string>;
	language: string;
	episode_count: number;
}

export interface PodcastEpisode {
	backendId?: string;
	guid: string;
	title: string;
	description: string;
	pub_date: string;
	duration_secs: number;
	audio_url: string;
	audio_type: string;
	audio_size: number;
	episode_number: number | null;
	season_number: number | null;
	artwork_url: string | null;
}

export interface PodcastDetail {
	backendId?: string;
	feed_url: string;
	title: string;
	author: string;
	description: string;
	artwork_url: string;
	link: string;
	language: string;
	categories: string[];
	episodes: PodcastEpisode[];
}

export interface PodcastCategory {
	id: number;
	name: string;
}

export interface PodcastSubscription {
	feedUrl: string;
	podcastId: number;
	title: string;
	author: string;
	artworkUrl: string;
	addedAt: number;
}
