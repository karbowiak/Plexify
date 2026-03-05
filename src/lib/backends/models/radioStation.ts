export interface RadioStation {
	backendId?: string;
	uuid: string;
	name: string;
	stream_url: string;
	homepage: string;
	favicon: string;
	tags: string[];
	country: string;
	country_code: string;
	language: string;
	codec: string;
	bitrate: number;
	is_hls: boolean;
	votes: number;
	click_count: number;
	click_trend: number;
}

export interface RadioCountry {
	name: string;
	code: string;
	station_count: number;
}

export interface RadioTag {
	name: string;
	station_count: number;
}
