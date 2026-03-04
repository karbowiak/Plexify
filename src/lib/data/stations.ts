export interface Station {
	id: string;
	name: string;
	description: string;
	type: 'artist' | 'mood' | 'genre' | 'decade';
}

export const stations: Station[] = [
	{ id: 's1', name: 'Radiohead Radio', description: 'Based on Radiohead', type: 'artist' },
	{ id: 's2', name: 'Daft Punk Radio', description: 'Based on Daft Punk', type: 'artist' },
	{ id: 's3', name: 'The Cure Radio', description: 'Based on The Cure', type: 'artist' },
	{ id: 's4', name: 'Melancholy Mix', description: 'For rainy afternoons', type: 'mood' },
	{ id: 's5', name: 'Upbeat Energy', description: 'Get moving', type: 'mood' },
	{ id: 's6', name: 'Late Night Chill', description: 'Wind down', type: 'mood' },
	{ id: 's7', name: 'Post-Punk Essentials', description: 'The best of post-punk', type: 'genre' },
	{ id: 's8', name: 'Electronic Explorations', description: 'IDM, ambient & more', type: 'genre' },
	{ id: 's9', name: 'Indie Rock', description: 'Guitar-driven gems', type: 'genre' },
	{ id: 's10', name: '80s Synth', description: 'The sound of the 80s', type: 'decade' },
	{ id: 's11', name: '90s Alternative', description: 'Alternative rock glory', type: 'decade' },
	{ id: 's12', name: '2000s Indie', description: 'The indie boom', type: 'decade' }
];

export interface InternetRadio {
	id: string;
	name: string;
	description: string;
	url: string;
}

export const internetRadio: InternetRadio[] = [
	{ id: 'ir1', name: 'SomaFM - Groove Salad', description: 'A nicely chilled plate of ambient beats', url: '#' },
	{ id: 'ir2', name: 'SomaFM - Drone Zone', description: 'Atmospheric textures with minimal beats', url: '#' },
	{ id: 'ir3', name: 'SomaFM - DEF CON', description: 'Music from the DEF CON hacker conference', url: '#' },
	{ id: 'ir4', name: 'KEXP 90.3', description: 'Where the music matters — Seattle', url: '#' },
	{ id: 'ir5', name: 'BBC Radio 6 Music', description: 'The best alternative music', url: '#' },
	{ id: 'ir6', name: 'NTS Radio', description: 'Don\'t assume — London', url: '#' },
	{ id: 'ir7', name: 'Dublab', description: 'Future roots radio — Los Angeles', url: '#' },
	{ id: 'ir8', name: 'FIP Radio', description: 'Éclectique — Paris', url: '#' }
];
