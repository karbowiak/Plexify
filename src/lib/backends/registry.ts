import type { Backend } from './types';
import { DemoBackend } from './demo';
import { RadioBrowserBackend } from './radio-browser';
import { PodcastIndexBackend } from './podcast-index';

const backends = new Map<string, Backend>();

export function register(backend: Backend) {
	backends.set(backend.id, backend);
}

export function get(id: string): Backend | undefined {
	return backends.get(id);
}

export function getAll(): Backend[] {
	return Array.from(backends.values());
}

// Auto-register built-in backends
register(new DemoBackend());
register(new RadioBrowserBackend());
register(new PodcastIndexBackend());
