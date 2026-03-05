import { Capability, type Backend, type BackendMetadata, type Hub, type ResourceResolver } from '../types';
import type { Track } from '../models/track';
import type { Album } from '../models/album';
import type { Artist } from '../models/artist';
import type { Playlist } from '../models/playlist';
import * as api from './api';
import { dzTrackToTrack, dzAlbumToAlbum, dzArtistToArtist } from './mappers';
import * as localState from './state';

function toDzId(id: string): number {
	return parseInt(id.replace('dz-', ''), 10);
}

function localPlaylistToPlaylist(lp: ReturnType<typeof localState.getPlaylists>[number]): Playlist {
	return {
		id: lp.id,
		backendId: 'demo',
		title: lp.title,
		sortTitle: null,
		description: lp.description,
		smart: false,
		radio: false,
		trackCount: lp.trackIds.length,
		duration: null,
		thumb: null,
		composite: null,
		addedAt: lp.createdAt,
		updatedAt: null,
		extra: {}
	};
}

const SUPPORTED_CAPABILITIES = new Set<Capability>([
	Capability.Search,
	Capability.Artists,
	Capability.Albums,
	Capability.Tracks,
	Capability.Hubs,
	Capability.Tags,
	Capability.Playlists,
	Capability.EditPlaylists
]);

export class DemoBackend implements Backend {
	readonly id = 'demo';
	readonly capabilities = SUPPORTED_CAPABILITIES;
	private _connected = false;

	readonly resolvers: ResourceResolver[] = [
		{
			protocol: 'demo-image',
			resolve(resourcePath) {
				return { url: resourcePath };
			}
		}
	];

	readonly metadata: BackendMetadata = {
		name: 'Demo (Deezer)',
		description: 'Deezer-powered demo with search, browse, and 30-second previews. Playlists and ratings stored locally.',
		icon: 'music',
		version: '2.0.0',
		author: 'Built-in',
		configFields: [],
		idPrefix: 'dz'
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

	// Search
	async search(query: string): Promise<{ tracks: Track[]; albums: Album[]; artists: Artist[] }> {
		const [tracks, albums, artists] = await Promise.all([
			api.searchAll(query),
			api.searchAlbums(query),
			api.searchArtists(query)
		]);
		return {
			tracks: tracks.data.map(dzTrackToTrack),
			albums: albums.data.map(dzAlbumToAlbum),
			artists: artists.data.map(dzArtistToArtist)
		};
	}

	// Library
	async getTrack(id: string): Promise<Track> {
		const dz = await api.getTrack(toDzId(id));
		return dzTrackToTrack(dz);
	}

	async getAlbum(id: string): Promise<Album> {
		const dz = await api.getAlbum(toDzId(id));
		return dzAlbumToAlbum(dz);
	}

	async getAlbumTracks(albumId: string): Promise<Track[]> {
		const [dz, albumDz] = await Promise.all([
			api.getAlbumTracks(toDzId(albumId)),
			api.getAlbum(toDzId(albumId))
		]);
		const albumThumb = albumDz.cover_big ?? albumDz.cover_xl ?? albumDz.cover_medium ?? null;
		return dz.data.map((t) => {
			const track = dzTrackToTrack(t);
			if (!track.albumId) track.albumId = albumId;
			if (!track.albumName) track.albumName = albumDz.title;
			if (!track.thumb && albumThumb) {
				track.thumb = 'demo-image://' + albumThumb;
			}
			return track;
		});
	}

	async getArtist(id: string): Promise<Artist> {
		const dz = await api.getArtist(toDzId(id));
		return dzArtistToArtist(dz);
	}

	async getArtistAlbums(artistId: string): Promise<Album[]> {
		const dz = await api.getArtistAlbums(toDzId(artistId));
		return dz.data.map(dzAlbumToAlbum);
	}

	async getArtistTopTracks(artistId: string, limit = 10): Promise<Track[]> {
		const dz = await api.getArtistTop(toDzId(artistId), limit);
		const tracks = dz.data.map(dzTrackToTrack);
		if (tracks.length > 0) return tracks;

		// Fallback: gather tracks from the artist's discography
		const albums = await this.getArtistAlbums(artistId);
		const discographyTracks: Track[] = [];
		for (const album of albums) {
			if (discographyTracks.length >= limit) break;
			const albumTracks = await this.getAlbumTracks(album.id);
			discographyTracks.push(...albumTracks);
		}
		return discographyTracks.slice(0, limit);
	}

	async getArtistRelated(artistId: string): Promise<Artist[]> {
		const dz = await api.getArtistRelated(toDzId(artistId));
		return dz.data.map(dzArtistToArtist);
	}

	// Playback
	async getStreamUrl(trackId: string): Promise<string> {
		const dz = await api.getTrack(toDzId(trackId));
		if (!dz.preview) throw new Error('No preview available for this track');
		return dz.preview;
	}

	// Hubs (charts)
	async getHubs(): Promise<Hub[]> {
		const chart = await api.getChart();
		return [
			{ title: 'Top Tracks', layout: 'scroller', items: chart.tracks.data.map(dzTrackToTrack) },
			{ title: 'Top Albums', layout: 'scroller', items: chart.albums.data.map(dzAlbumToAlbum) },
			{ title: 'Top Artists', layout: 'scroller', items: chart.artists.data.map(dzArtistToArtist) }
		];
	}

	// Tags (genres)
	async getTags(): Promise<{ tag: string; count: number | null }[]> {
		const res = await api.getGenres();
		return res.data
			.filter((g) => g.id !== 0) // exclude "All"
			.map((g) => ({ tag: g.name, count: null }));
	}

	// Playlists (local)
	async getPlaylists(): Promise<Playlist[]> {
		return localState.getPlaylists().map(localPlaylistToPlaylist);
	}

	async getPlaylistTracks(
		playlistId: string,
		offset = 0,
		limit = 50
	): Promise<{ items: Track[]; total: number }> {
		const pl = localState.getPlaylist(playlistId);
		if (!pl) return { items: [], total: 0 };

		const slice = pl.trackIds.slice(offset, offset + limit);
		const tracks = await Promise.all(
			slice.map(async (id) => {
				try {
					return await this.getTrack(id);
				} catch {
					return null;
				}
			})
		);

		return {
			items: tracks.filter((t): t is Track => t !== null),
			total: pl.trackIds.length
		};
	}

	async createPlaylist(title: string, trackIds: string[] = []): Promise<Playlist> {
		const pl = localState.createPlaylist(title, trackIds);
		return localPlaylistToPlaylist(pl);
	}

	async addToPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
		localState.addToPlaylist(playlistId, trackIds);
	}

	async deletePlaylist(playlistId: string): Promise<void> {
		localState.deletePlaylist(playlistId);
	}

	// Tags — genre artists
	private genreMap: Map<string, number> | null = null;

	async getTagItems(tag: string): Promise<{ artists: Artist[]; albums: Album[] }> {
		// Build genre name→id cache on first call
		if (!this.genreMap) {
			const res = await api.getGenres();
			this.genreMap = new Map(res.data.map((g) => [g.name.toLowerCase(), g.id]));
		}
		const genreId = this.genreMap.get(tag.toLowerCase());
		if (genreId == null) return { artists: [], albums: [] };

		const res = await api.getGenreArtists(genreId);
		return { artists: res.data.map(dzArtistToArtist), albums: [] };
	}
}
