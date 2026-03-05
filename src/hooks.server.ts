import { getAll } from '$lib/backends/registry';
import { registerBackendResolvers, registerResolver } from '$lib/server/imageResolvers';
import { evictIfOverSize } from '$lib/server/imageCache';
import { register as registerCacheProvider } from '$lib/cache/registry';
import { ImageCacheProvider } from '$lib/cache/providers/image';
import { MetadataCacheProvider } from '$lib/cache/providers/metadata';
import { ApiCacheProvider } from '$lib/cache/providers/api';
import { AudioAnalysisCacheProvider } from '$lib/cache/providers/audioAnalysis';
import { MediaCacheProvider } from '$lib/cache/providers/media';

// Register resolvers from all backends
for (const backend of getAll()) {
	if (backend.resolvers) {
		registerBackendResolvers(backend.resolvers);
	}
}

// Register fallback resolver for plain http/https
registerResolver('http', (resourcePath) => ({ url: `http://${resourcePath}` }));
registerResolver('https', (resourcePath) => ({ url: `https://${resourcePath}` }));

// Register cache providers
registerCacheProvider(new ImageCacheProvider());
registerCacheProvider(new MetadataCacheProvider());
registerCacheProvider(new ApiCacheProvider());
registerCacheProvider(new MediaCacheProvider());
registerCacheProvider(new AudioAnalysisCacheProvider());

// Check cache size on startup
evictIfOverSize();
