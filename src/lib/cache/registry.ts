import type { CacheProvider } from './types';

const providers = new Map<string, CacheProvider>();

export function register(provider: CacheProvider) {
	providers.set(provider.id, provider);
}

export function get(id: string): CacheProvider | undefined {
	return providers.get(id);
}

export function getAll(): CacheProvider[] {
	return Array.from(providers.values());
}
