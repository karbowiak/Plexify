export interface Track {
	id: string;
	title: string;
	artist: string;
	artistId: string;
	album: string;
	albumId: string;
	duration: string;
	trackNumber: number;
}

export const tracks: Track[] = [
	{ id: 't01', title: 'Airbag', artist: 'Radiohead', artistId: 'radiohead', album: 'OK Computer', albumId: 'ok-computer', duration: '4:44', trackNumber: 1 },
	{ id: 't02', title: 'Paranoid Android', artist: 'Radiohead', artistId: 'radiohead', album: 'OK Computer', albumId: 'ok-computer', duration: '6:23', trackNumber: 2 },
	{ id: 't03', title: 'Subterranean Homesick Alien', artist: 'Radiohead', artistId: 'radiohead', album: 'OK Computer', albumId: 'ok-computer', duration: '4:27', trackNumber: 3 },
	{ id: 't04', title: 'Exit Music (For a Film)', artist: 'Radiohead', artistId: 'radiohead', album: 'OK Computer', albumId: 'ok-computer', duration: '4:24', trackNumber: 4 },
	{ id: 't05', title: 'Let Down', artist: 'Radiohead', artistId: 'radiohead', album: 'OK Computer', albumId: 'ok-computer', duration: '4:59', trackNumber: 5 },
	{ id: 't06', title: 'Karma Police', artist: 'Radiohead', artistId: 'radiohead', album: 'OK Computer', albumId: 'ok-computer', duration: '4:21', trackNumber: 6 },
	{ id: 't07', title: 'Everything In Its Right Place', artist: 'Radiohead', artistId: 'radiohead', album: 'Kid A', albumId: 'kid-a', duration: '4:11', trackNumber: 1 },
	{ id: 't08', title: 'Kid A', artist: 'Radiohead', artistId: 'radiohead', album: 'Kid A', albumId: 'kid-a', duration: '4:44', trackNumber: 2 },
	{ id: 't09', title: 'The National Anthem', artist: 'Radiohead', artistId: 'radiohead', album: 'Kid A', albumId: 'kid-a', duration: '5:51', trackNumber: 3 },
	{ id: 't10', title: 'How to Disappear Completely', artist: 'Radiohead', artistId: 'radiohead', album: 'Kid A', albumId: 'kid-a', duration: '5:56', trackNumber: 4 },
	{ id: 't11', title: 'Idioteque', artist: 'Radiohead', artistId: 'radiohead', album: 'Kid A', albumId: 'kid-a', duration: '5:09', trackNumber: 5 },
	{ id: 't12', title: 'Nude', artist: 'Radiohead', artistId: 'radiohead', album: 'In Rainbows', albumId: 'in-rainbows', duration: '4:15', trackNumber: 1 },
	{ id: 't13', title: 'Weird Fishes / Arpeggi', artist: 'Radiohead', artistId: 'radiohead', album: 'In Rainbows', albumId: 'in-rainbows', duration: '5:18', trackNumber: 2 },
	{ id: 't14', title: 'Reckoner', artist: 'Radiohead', artistId: 'radiohead', album: 'In Rainbows', albumId: 'in-rainbows', duration: '4:50', trackNumber: 3 },
	{ id: 't15', title: 'Blue Monday', artist: 'New Order', artistId: 'new-order', album: 'Power, Corruption & Lies', albumId: 'power-corruption', duration: '7:29', trackNumber: 1 },
	{ id: 't16', title: 'Ceremony', artist: 'New Order', artistId: 'new-order', album: 'Power, Corruption & Lies', albumId: 'power-corruption', duration: '4:23', trackNumber: 2 },
	{ id: 't17', title: 'Bizarre Love Triangle', artist: 'New Order', artistId: 'new-order', album: 'Power, Corruption & Lies', albumId: 'power-corruption', duration: '4:22', trackNumber: 3 },
	{ id: 't18', title: 'Love Will Tear Us Apart', artist: 'Joy Division', artistId: 'joy-division', album: 'Unknown Pleasures', albumId: 'unknown-pleasures', duration: '3:26', trackNumber: 1 },
	{ id: 't19', title: 'Disorder', artist: 'Joy Division', artistId: 'joy-division', album: 'Unknown Pleasures', albumId: 'unknown-pleasures', duration: '3:36', trackNumber: 2 },
	{ id: 't20', title: 'Enjoy the Silence', artist: 'Depeche Mode', artistId: 'depeche-mode', album: 'Violator', albumId: 'violator', duration: '4:17', trackNumber: 1 },
	{ id: 't21', title: 'Personal Jesus', artist: 'Depeche Mode', artistId: 'depeche-mode', album: 'Violator', albumId: 'violator', duration: '4:56', trackNumber: 2 },
	{ id: 't22', title: 'Policy of Truth', artist: 'Depeche Mode', artistId: 'depeche-mode', album: 'Violator', albumId: 'violator', duration: '4:55', trackNumber: 3 },
	{ id: 't23', title: 'Just Like Heaven', artist: 'The Cure', artistId: 'the-cure', album: 'Disintegration', albumId: 'disintegration', duration: '3:32', trackNumber: 1 },
	{ id: 't24', title: 'A Forest', artist: 'The Cure', artistId: 'the-cure', album: 'Disintegration', albumId: 'disintegration', duration: '5:54', trackNumber: 2 },
	{ id: 't25', title: 'Pictures of You', artist: 'The Cure', artistId: 'the-cure', album: 'Disintegration', albumId: 'disintegration', duration: '7:24', trackNumber: 3 },
	{ id: 't26', title: 'One More Time', artist: 'Daft Punk', artistId: 'daft-punk', album: 'Discovery', albumId: 'discovery', duration: '5:20', trackNumber: 1 },
	{ id: 't27', title: 'Harder Better Faster Stronger', artist: 'Daft Punk', artistId: 'daft-punk', album: 'Discovery', albumId: 'discovery', duration: '3:45', trackNumber: 2 },
	{ id: 't28', title: 'Digital Love', artist: 'Daft Punk', artistId: 'daft-punk', album: 'Discovery', albumId: 'discovery', duration: '4:58', trackNumber: 3 },
	{ id: 't29', title: 'Get Lucky', artist: 'Daft Punk', artistId: 'daft-punk', album: 'Random Access Memories', albumId: 'random-access-memories', duration: '6:09', trackNumber: 1 },
	{ id: 't30', title: 'Instant Crush', artist: 'Daft Punk', artistId: 'daft-punk', album: 'Random Access Memories', albumId: 'random-access-memories', duration: '5:37', trackNumber: 2 },
	{ id: 't31', title: 'Under the Milky Way', artist: 'The Church', artistId: 'the-church', album: 'Starfish', albumId: 'starfish', duration: '4:58', trackNumber: 1 },
	{ id: 't32', title: 'Bloom', artist: 'Radiohead', artistId: 'radiohead', album: 'The King of Limbs', albumId: 'the-king-of-limbs', duration: '5:15', trackNumber: 1 },
	{ id: 't33', title: 'Separator', artist: 'Radiohead', artistId: 'radiohead', album: 'The King of Limbs', albumId: 'the-king-of-limbs', duration: '5:20', trackNumber: 2 }
];

export function getTracksByAlbum(albumId: string): Track[] {
	return tracks.filter((t) => t.albumId === albumId).sort((a, b) => a.trackNumber - b.trackNumber);
}

export function getTracksByArtist(artistId: string): Track[] {
	return tracks.filter((t) => t.artistId === artistId);
}
