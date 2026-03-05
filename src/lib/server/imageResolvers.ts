import type { ResourceResolver } from '$lib/backends/types';

type ResolverFn = (
	resourcePath: string,
	config: Record<string, unknown>
) => { url: string; headers?: Record<string, string> };

const resolvers = new Map<string, ResolverFn>();

export function registerResolver(protocol: string, resolve: ResolverFn) {
	resolvers.set(protocol, resolve);
}

export function getResolver(protocol: string): ResolverFn | undefined {
	return resolvers.get(protocol);
}

export function hasResolver(protocol: string): boolean {
	return resolvers.has(protocol);
}

export function clearResolvers() {
	resolvers.clear();
}

/**
 * Parse a compound protocol URL like "demo-image://https://cdn.example.com/img.jpg"
 * Returns { backendId, resourceType, protocol, resourcePath } or null for plain http/https URLs.
 *
 * The compound format is `{backendId}-{resourceType}://path`.
 * We split on the last hyphen before `://` so backend IDs with hyphens (e.g. "radio-browser")
 * are handled correctly: "radiobrowser-image" → backendId="radiobrowser", resourceType="image".
 */
export function parseProtocolUrl(
	src: string
): { backendId: string; resourceType: string; protocol: string; resourcePath: string } | null {
	// Plain http/https — no custom protocol
	if (src.startsWith('http://') || src.startsWith('https://')) {
		return null;
	}
	const idx = src.indexOf('://');
	if (idx === -1) return null;

	const protocol = src.substring(0, idx);
	const resourcePath = src.substring(idx + 3);

	// Split compound protocol on last hyphen
	const lastHyphen = protocol.lastIndexOf('-');
	if (lastHyphen === -1) {
		// Legacy or simple protocol — treat entire thing as backendId, no resourceType
		return { backendId: protocol, resourceType: '', protocol, resourcePath };
	}

	return {
		backendId: protocol.substring(0, lastHyphen),
		resourceType: protocol.substring(lastHyphen + 1),
		protocol,
		resourcePath
	};
}

/**
 * Resolve a protocol URL to a fetchable URL + headers.
 * Plain http/https URLs are returned as-is.
 */
export function resolveUrl(
	src: string,
	config: Record<string, unknown> = {}
): { url: string; headers?: Record<string, string> } {
	const parsed = parseProtocolUrl(src);
	if (!parsed) {
		// Plain URL
		return { url: src };
	}

	const resolver = resolvers.get(parsed.protocol);
	if (!resolver) {
		throw new Error(`No resolver for protocol: ${parsed.protocol}`);
	}

	return resolver(parsed.resourcePath, config);
}

/** @deprecated Use resolveUrl instead */
export const resolveImageUrl = resolveUrl;

/**
 * Register resolvers from a backend's resolvers array.
 */
export function registerBackendResolvers(backendResolvers: ResourceResolver[]) {
	for (const r of backendResolvers) {
		registerResolver(r.protocol, r.resolve.bind(r));
	}
}
