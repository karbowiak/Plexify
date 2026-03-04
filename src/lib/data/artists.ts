export interface Artist {
	id: string;
	name: string;
	genres: string[];
}

export const artists: Artist[] = [
	{ id: 'radiohead', name: 'Radiohead', genres: ['Alternative Rock', 'Art Rock'] },
	{ id: 'daft-punk', name: 'Daft Punk', genres: ['Electronic', 'French House'] },
	{ id: 'new-order', name: 'New Order', genres: ['Synth-Pop', 'Post-Punk'] },
	{ id: 'joy-division', name: 'Joy Division', genres: ['Post-Punk', 'Gothic Rock'] },
	{ id: 'depeche-mode', name: 'Depeche Mode', genres: ['Synth-Pop', 'New Wave'] },
	{ id: 'the-cure', name: 'The Cure', genres: ['Post-Punk', 'Gothic Rock'] },
	{ id: 'the-church', name: 'The Church', genres: ['Alternative Rock', 'Dream Pop'] },
	{ id: 'tame-impala', name: 'Tame Impala', genres: ['Psychedelic Rock', 'Synth-Pop'] },
	{ id: 'boards-of-canada', name: 'Boards of Canada', genres: ['IDM', 'Ambient'] },
	{ id: 'aphex-twin', name: 'Aphex Twin', genres: ['IDM', 'Electronic'] },
	{ id: 'nick-drake', name: 'Nick Drake', genres: ['Folk', 'Singer-Songwriter'] },
	{ id: 'thom-yorke', name: 'Thom Yorke', genres: ['Electronic', 'Art Rock'] }
];

export function getArtistById(id: string): Artist | undefined {
	return artists.find((a) => a.id === id);
}
