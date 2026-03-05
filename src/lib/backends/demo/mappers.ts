import type { DzTrack, DzAlbum, DzArtist } from './types';
import type { Track } from '../models/track';
import type { Album, AlbumType } from '../models/album';
import type { Artist } from '../models/artist';

const BACKEND_ID = 'demo';
const IMG_PREFIX = 'demo-image://';

function prefixImg(url: string | null | undefined): string | null {
	return url ? IMG_PREFIX + url : null;
}

function mapRecordType(rt: string | undefined): AlbumType {
	if (!rt) return 'unknown';
	const map: Record<string, AlbumType> = {
		album: 'album',
		single: 'single',
		ep: 'ep',
		compile: 'compilation'
	};
	return map[rt] ?? 'unknown';
}

export function dzTrackToTrack(t: DzTrack): Track {
	return {
		id: `dz-${t.id}`,
		backendId: BACKEND_ID,
		title: t.title,
		artistName: t.artist?.name ?? '',
		artistId: t.artist ? `dz-${t.artist.id}` : '',
		albumName: t.album?.title ?? '',
		albumId: t.album ? `dz-${t.album.id}` : '',
		trackNumber: t.track_position ?? null,
		discNumber: t.disk_number ?? null,
		year: null,
		albumYear: null,
		duration: Math.min(t.duration, 30) * 1000,
		thumb: prefixImg(t.album?.cover_big ?? t.album?.cover_medium),
		artistThumb: prefixImg(t.artist?.picture_big ?? t.artist?.picture_medium),
		playCount: 0,
		skipCount: null,
		userRating: null,
		lastPlayedAt: null,
		addedAt: null,
		quality: { codec: 'mp3', bitrate: 128, bitDepth: null, sampleRate: 44100, channels: 2, gain: null, albumGain: null, peak: null, loudness: null },
		popularity: t.rank ?? null,
		hasLyrics: false,
		extra: { preview: t.preview, dzId: t.id }
	};
}

export function dzAlbumToAlbum(a: DzAlbum): Album {
	const year = a.release_date ? parseInt(a.release_date.split('-')[0], 10) : null;
	return {
		id: `dz-${a.id}`,
		backendId: BACKEND_ID,
		title: a.title,
		artistName: a.artist?.name ?? '',
		artistId: a.artist ? `dz-${a.artist.id}` : '',
		year: year && !isNaN(year) ? year : null,
		albumType: mapRecordType(a.record_type),
		trackCount: a.nb_tracks ?? 0,
		thumb: prefixImg(a.cover_big ?? a.cover_xl ?? a.cover_medium),
		artistThumb: prefixImg(a.artist?.picture_big ?? a.artist?.picture_medium),
		summary: null,
		studio: a.label ?? null,
		releaseDate: a.release_date ?? null,
		genres: a.genres?.data?.map((g) => g.name) ?? [],
		styles: [],
		moods: [],
		labels: a.label ? [a.label] : [],
		userRating: null,
		addedAt: null,
		lastPlayedAt: null,
		reviews: [],
		extra: { dzId: a.id, fans: a.fans }
	};
}

export function dzArtistToArtist(a: DzArtist): Artist {
	return {
		id: `dz-${a.id}`,
		backendId: BACKEND_ID,
		title: a.name,
		sortTitle: null,
		thumb: prefixImg(a.picture_big ?? a.picture_xl ?? a.picture_medium),
		art: prefixImg(a.picture_xl ?? a.picture_big),
		summary: null,
		genres: [],
		styles: [],
		moods: [],
		userRating: null,
		addedAt: null,
		lastPlayedAt: null,
		extra: { dzId: a.id, fanCount: a.nb_fan, albumCount: a.nb_album }
	};
}
