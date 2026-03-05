import type { Backend } from '$lib/backends/types';
import { Capability } from '$lib/backends/types';
import * as registry from '$lib/backends/registry';
import { getBackendConfig, setBackend } from './configStore.svelte';

const ACTIVE_KEY = 'active-backend-id';

let activeBackendId = $state<string | null>(null);
let connectedBackends = $state(new Map<string, Backend>());

// ---------------------------------------------------------------------------
// Primary music backend (backward compat)
// ---------------------------------------------------------------------------

export function getBackend(): Backend | null {
	if (!activeBackendId) return null;
	return connectedBackends.get(activeBackendId) ?? null;
}

export function getActiveBackendId(): string | null {
	return activeBackendId;
}

// ---------------------------------------------------------------------------
// Multi-backend queries
// ---------------------------------------------------------------------------

export function getBackendsWithCapability(cap: Capability): Backend[] {
	return [...connectedBackends.values()].filter((b) => b.supports(cap));
}

export function getFirstBackendWithCapability(cap: Capability): Backend | null {
	for (const b of connectedBackends.values()) {
		if (b.supports(cap)) return b;
	}
	return null;
}

export function getConnectedBackends(): Map<string, Backend> {
	return connectedBackends;
}

// ---------------------------------------------------------------------------
// Capability helpers (union of all connected)
// ---------------------------------------------------------------------------

export function getCapabilities(): Set<Capability> {
	const caps = new Set<Capability>();
	for (const b of connectedBackends.values()) {
		for (const c of b.capabilities) caps.add(c);
	}
	return caps;
}

export function hasCapability(cap: Capability): boolean {
	for (const b of connectedBackends.values()) {
		if (b.supports(cap)) return true;
	}
	return false;
}

export function isConnected(): boolean {
	return connectedBackends.size > 0;
}

// ---------------------------------------------------------------------------
// Connect / disconnect individual backends
// ---------------------------------------------------------------------------

export async function connectBackend(id: string, config: Record<string, unknown> = {}): Promise<void> {
	const instance = registry.get(id);
	if (!instance) throw new Error(`Backend "${id}" not found in registry`);

	if (instance.isConnected()) return;

	await instance.connect(config);

	const updated = new Map(connectedBackends);
	updated.set(id, instance);
	connectedBackends = updated;

	setBackend(id, { enabled: true, config });
}

export async function disconnectBackend(id: string): Promise<void> {
	const instance = connectedBackends.get(id);
	if (!instance) return;

	try {
		await instance.disconnect();
	} catch {
		// ignore
	}

	const updated = new Map(connectedBackends);
	updated.delete(id);
	connectedBackends = updated;

	if (activeBackendId === id) {
		activeBackendId = null;
		localStorage.removeItem(ACTIVE_KEY);
	}
}

// ---------------------------------------------------------------------------
// Set primary music backend
// ---------------------------------------------------------------------------

export function setActiveMusicBackend(id: string): void {
	if (!connectedBackends.has(id)) return;
	activeBackendId = id;
	localStorage.setItem(ACTIVE_KEY, id);
}

// ---------------------------------------------------------------------------
// Set active backend (legacy — connects + sets as primary music backend)
// ---------------------------------------------------------------------------

export async function setActiveBackend(id: string, config: Record<string, unknown> = {}): Promise<void> {
	await connectBackend(id, config);
	setActiveMusicBackend(id);
}

// ---------------------------------------------------------------------------
// Restore all enabled backends on startup
// ---------------------------------------------------------------------------

export async function restoreBackends(): Promise<void> {
	for (const b of registry.getAll()) {
		const cfg = getBackendConfig(b.id);
		if (cfg.enabled) {
			try {
				await connectBackend(b.id, cfg.config);
			} catch {
				// Failed to connect — skip
			}
		}
	}

	// Restore active music backend from localStorage
	const savedId = localStorage.getItem(ACTIVE_KEY);
	if (savedId && connectedBackends.has(savedId)) {
		activeBackendId = savedId;
	} else {
		// Default to first connected backend that has music capabilities
		for (const b of connectedBackends.values()) {
			if (b.supports(Capability.Tracks) || b.supports(Capability.Search)) {
				activeBackendId = b.id;
				localStorage.setItem(ACTIVE_KEY, b.id);
				break;
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Entity ID resolution
// ---------------------------------------------------------------------------

export function resolveEntityBackend(entityId: string): Backend | null {
	for (const b of connectedBackends.values()) {
		const prefix = b.metadata.idPrefix;
		if (prefix && entityId.startsWith(prefix + '-')) return b;
	}
	return null;
}

// Legacy alias
export const restoreBackend = restoreBackends;
