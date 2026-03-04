export interface Album {
	id: string;
	title: string;
	artist: string;
	artistId: string;
	year: number;
	trackCount: number;
}

export const albums: Album[] = [
	{ id: 'ok-computer', title: 'OK Computer', artist: 'Radiohead', artistId: 'radiohead', year: 1997, trackCount: 12 },
	{ id: 'kid-a', title: 'Kid A', artist: 'Radiohead', artistId: 'radiohead', year: 2000, trackCount: 10 },
	{ id: 'in-rainbows', title: 'In Rainbows', artist: 'Radiohead', artistId: 'radiohead', year: 2007, trackCount: 10 },
	{ id: 'the-king-of-limbs', title: 'The King of Limbs', artist: 'Radiohead', artistId: 'radiohead', year: 2011, trackCount: 8 },
	{ id: 'hail-to-the-thief', title: 'Hail to the Thief', artist: 'Radiohead', artistId: 'radiohead', year: 2003, trackCount: 14 },
	{ id: 'discovery', title: 'Discovery', artist: 'Daft Punk', artistId: 'daft-punk', year: 2001, trackCount: 14 },
	{ id: 'random-access-memories', title: 'Random Access Memories', artist: 'Daft Punk', artistId: 'daft-punk', year: 2013, trackCount: 13 },
	{ id: 'violator', title: 'Violator', artist: 'Depeche Mode', artistId: 'depeche-mode', year: 1990, trackCount: 9 },
	{ id: 'disintegration', title: 'Disintegration', artist: 'The Cure', artistId: 'the-cure', year: 1989, trackCount: 12 },
	{ id: 'power-corruption', title: 'Power, Corruption & Lies', artist: 'New Order', artistId: 'new-order', year: 1983, trackCount: 8 },
	{ id: 'unknown-pleasures', title: 'Unknown Pleasures', artist: 'Joy Division', artistId: 'joy-division', year: 1979, trackCount: 10 },
	{ id: 'closer', title: 'Closer', artist: 'Joy Division', artistId: 'joy-division', year: 1980, trackCount: 9 }
];

export function getAlbumById(id: string): Album | undefined {
	return albums.find((a) => a.id === id);
}

export function getAlbumsByArtist(artistId: string): Album[] {
	return albums.filter((a) => a.artistId === artistId);
}
