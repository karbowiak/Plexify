# Backend & Cache Architecture

Reference document for the backend system, custom URL protocols, cache registry, and how they all connect.

---

## Backend System

### Registry (`src/lib/backends/registry.ts`)

All backends register in a central `Map<string, Backend>`. Built-in backends auto-register on import:

| Backend ID        | Class                  | Capabilities                          |
|-------------------|------------------------|---------------------------------------|
| `demo`            | `DemoBackend`          | Search, Artists, Albums, Tracks, Hubs, Tags, Playlists, EditPlaylists, Ratings |
| `radio-browser`   | `RadioBrowserBackend`  | InternetRadio                         |
| `podcast-index`   | `PodcastIndexBackend`  | Podcasts                              |

```typescript
import { register, get, getAll } from '$lib/backends/registry';
```

### Backend Interface (`src/lib/backends/types.ts`)

Every backend implements the `Backend` interface:

```typescript
interface Backend {
  readonly id: string;
  readonly metadata: BackendMetadata;
  readonly capabilities: Set<Capability>;
  readonly resolvers?: ResourceResolver[];   // custom URL resolvers
  connect(config): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  supports(capability): boolean;
  // ... capability-specific methods (search, getTrack, etc.)
}
```

### Resource Resolvers

Backends declare `resolvers` to teach the system how to fetch resources behind custom protocol URLs. Each resolver handles one protocol:

```typescript
interface ResourceResolver {
  protocol: string;   // e.g. "demo-image"
  resolve(resourcePath: string, config: Record<string, unknown>): {
    url: string;
    headers?: Record<string, string>;
  };
}
```

---

## Custom URL Protocol Scheme

### Format: `{backendId}-{resourceType}://`

All backend resources use a compound protocol prefix. The format is `{backendId}-{resourceType}://` followed by the actual resource path (usually a URL).

| Backend         | Resource | Protocol              | Example                                            |
|-----------------|----------|-----------------------|----------------------------------------------------|
| Demo (Deezer)   | image    | `demo-image://`       | `demo-image://https://cdn.deezer.com/img/abc.jpg`  |
| Radio Browser   | image    | `radiobrowser-image://` | `radiobrowser-image://https://radio.com/fav.png` |
| Podcast Index   | image    | `podcastindex-image://` | `podcastindex-image://https://pod.co/art.jpg`    |
| Plain URLs      | -        | `http://` / `https://`  | unchanged, passed through directly               |

### How URLs Flow

1. **Backend creates URL** — mappers prefix image URLs:
   ```typescript
   // src/lib/backends/demo/mappers.ts
   const IMG_PREFIX = 'demo-image://';
   function prefixImg(url) { return url ? IMG_PREFIX + url : null; }
   ```

2. **Component renders** — `<CachedImage src="demo-image://https://..." />` renders an `<img>` tag pointing to `/api/img?src=demo-image://https://...`

3. **Server resolves** — the `/api/img` endpoint calls `resolveUrl(src)`:
   ```
   parseProtocolUrl("demo-image://https://cdn.deezer.com/img.jpg")
   → { backendId: "demo", resourceType: "image", protocol: "demo-image", resourcePath: "https://cdn.deezer.com/img.jpg" }
   ```

4. **Resolver returns real URL** — looks up `"demo-image"` in the resolver map, calls `resolve(resourcePath)` → `{ url: "https://cdn.deezer.com/img.jpg" }`

5. **Server fetches & caches** — fetches from the resolved URL, stores on disk, serves to browser.

### Parser (`src/lib/server/imageResolvers.ts`)

```typescript
parseProtocolUrl(src: string): {
  backendId: string;      // "demo", "radiobrowser", "podcastindex"
  resourceType: string;   // "image", "api", "media"
  protocol: string;       // "demo-image" (full compound key)
  resourcePath: string;   // everything after "://"
} | null
```

Splits on the **last hyphen** before `://`, so backend IDs with hyphens work correctly (e.g. `radiobrowser-image` → `backendId="radiobrowser"`, `resourceType="image"`).

### Registration (`src/hooks.server.ts`)

On server startup, all backend resolvers are registered:

```typescript
for (const backend of getAll()) {
  if (backend.resolvers) {
    registerBackendResolvers(backend.resolvers);
  }
}
// Fallback for plain URLs
registerResolver('http', (path) => ({ url: `http://${path}` }));
registerResolver('https', (path) => ({ url: `https://${path}` }));
```

### Adding a New Protocol

1. Add a `ResourceResolver` to your backend's `resolvers` array
2. Use the compound format: `{backendId}-{resourceType}`
3. Prefix URLs in your mappers with `{backendId}-{resourceType}://`
4. The resolver is auto-registered via `hooks.server.ts`

---

## Cache System

### Cache Provider Registry (`src/lib/cache/registry.ts`)

Mirrors the backend registry pattern. Each cache type implements `CacheProvider`:

```typescript
interface CacheProvider {
  readonly id: string;           // "image", "metadata", "audio-analysis", "api"
  readonly name: string;         // Display name
  readonly description: string;
  readonly icon: string;         // Lucide icon key

  getStats(): CacheStats;
  clear(): void;
  configure(opts: Record<string, unknown>): void;
  getConfig(): { directory: string; maxSizeMB: number; ttlDays: number };
  getEnvLocks(): Record<string, boolean>;
}

interface CacheStats {
  totalSizeBytes: number;
  entryCount: number;
  oldestEntry: number | null;    // epoch ms
  newestEntry: number | null;    // epoch ms
}
```

### Current Providers

| Provider ID        | File                                       | Storage     | What it caches                                  |
|--------------------|--------------------------------------------|-------------|--------------------------------------------------|
| `image`            | `src/lib/cache/providers/image.ts`         | Disk        | Album art, radio favicons, podcast artwork       |
| `media`            | `src/lib/cache/providers/media.ts`         | Disk        | Audio files (songs, podcasts, radio segments)    |
| `metadata`         | `src/lib/cache/providers/metadata.ts`      | In-memory   | ICY stream metadata (now-playing info)           |
| `audio-analysis`   | `src/lib/cache/providers/audioAnalysis.ts`  | In-memory   | Track BPM, beat detection, frequency analysis    |
| `api`              | `src/lib/cache/providers/api.ts`           | In-memory   | Podcast feed responses                           |

### How Providers Are Registered

In `src/hooks.server.ts` (server-side providers):
```typescript
import { register } from '$lib/cache/registry';
import { ImageCacheProvider } from '$lib/cache/providers/image';
import { MediaCacheProvider } from '$lib/cache/providers/media';
import { MetadataCacheProvider } from '$lib/cache/providers/metadata';
import { ApiCacheProvider } from '$lib/cache/providers/api';

register(new ImageCacheProvider());
register(new MediaCacheProvider());
register(new MetadataCacheProvider());
register(new ApiCacheProvider());
```

The `AudioAnalysisCacheProvider` runs client-side (it wraps the Web Audio engine's analysis cache), so it's registered from the audio engine when it initializes.

### Cache API

Unified REST endpoint for all providers:

```
GET    /api/cache/{id}/stats   → { ...CacheStats, ...config, envLocks }
DELETE /api/cache/{id}/stats   → clear cache
PATCH  /api/cache/{id}/stats   → update config, return updated stats
```

Example:
```bash
# Get image cache stats
curl /api/cache/image/stats

# Clear image cache
curl -X DELETE /api/cache/image/stats

# Update image cache config
curl -X PATCH /api/cache/image/stats \
  -H 'Content-Type: application/json' \
  -d '{"maxSizeMB": 1024, "ttlDays": 14}'
```

### Config Store (`src/lib/stores/configStore.svelte.ts`)

Cache configs are stored per-provider under the `caches` key:

```typescript
type CachesConfig = Record<string, {
  directory: string;
  maxSizeMB: number;
  ttlDays: number;
}>;

// Read
getCache('image')  → { directory: '.cache/img', maxSizeMB: 500, ttlDays: 7 }

// Write
setCache('image', { maxSizeMB: 1024 })
```

Old flat `cache` key is auto-migrated to `caches.image` on first load.

### Settings UI

- **Summary page** (`/settings/cache`) — lists all registered providers with size/count badges
- **Detail page** (`/settings/cache/[id]`) — full stats, usage bar, settings controls, env lock indicators

### Shared DiskCache Class (`src/lib/server/diskCache.ts`)

All disk-based caches (image, media, future ones) use the same `DiskCache` class:

```typescript
import { DiskCache } from './diskCache';

const cache = new DiskCache({
  defaultDir: '.cache/media',      // relative to project root
  defaultMaxMB: 2048,              // 2 GB
  defaultTtlDays: 30,
  envDirKey: 'MEDIA_CACHE_DIR',    // env var name for directory override
  envMaxSizeKey: 'MEDIA_CACHE_MAX_SIZE_MB',
  envTtlKey: 'MEDIA_CACHE_TTL_DAYS'
}, envVars);
```

Features: SHA-256 sharding, per-entry metadata, TTL expiry, LRU eviction, env var locks.

### Environment Variable Pattern

Each disk cache has 3 env vars: `{PREFIX}_DIR`, `{PREFIX}_MAX_SIZE_MB`, `{PREFIX}_TTL_DAYS`.

| Cache  | Prefix              | Default Dir     | Default Size | Default TTL |
|--------|---------------------|-----------------|-------------|-------------|
| Image  | `IMAGE_CACHE`       | `.cache/img`    | 500 MB      | 7 days      |
| Media  | `MEDIA_CACHE`       | `.cache/media`  | 2 GB        | 30 days     |

All paths are relative to the project root (`.cache/` directory). When set via env, the corresponding UI field is locked and shows an "ENV" badge.

### Adding a New Cache Provider

**Disk-based cache:**
1. Create `src/lib/server/yourCache.ts` using the `DiskCache` class
2. Create `src/lib/cache/providers/yourCache.ts` implementing `CacheProvider`
3. Register it in `hooks.server.ts`
4. Add env vars to `.env.example`
5. Add default config entry in `configStore.svelte.ts` `CACHE_DEFAULTS`
6. Add the provider to the summary page's `providers` array in `/settings/cache/+page.svelte`
7. Add `cacheInfoMap` entry in `/settings/cache/[id]/+page.svelte` for "how it works"
8. Add sidebar entry in `/settings/+layout.svelte`

**In-memory cache:**
1. Create `src/lib/cache/providers/yourCache.ts` implementing `CacheProvider`
2. Return all `getEnvLocks()` as `true` (signals in-memory to the detail page)
3. Register it in `hooks.server.ts`
4. Add to summary page + sidebar
5. It automatically gets a detail page at `/settings/cache/{id}` and an API at `/api/cache/{id}/stats`

---

## Image Proxy Endpoint (`/api/img`)

The image proxy at `src/routes/api/img/+server.ts` handles all image fetching:

1. Receives `?src=demo-image://https://cdn.example.com/art.jpg`
2. Checks disk cache → return with `X-Cache: HIT`
3. Parses protocol, looks up resolver
4. Fetches from resolved URL (with optional auth headers)
5. Writes to disk cache
6. Returns with `X-Cache: MISS`

Browser caching: `Cache-Control: public, max-age=86400` (24h).

---

## Component Reference

### `<CachedImage>`
`src/lib/components/ui/CachedImage.svelte`

Drop-in `<img>` replacement that routes through the image proxy:
```svelte
<CachedImage src="demo-image://https://cdn.deezer.com/img.jpg" alt="Album art" />
```

Internally renders: `<img src="/api/img?src=demo-image://https://..." />`

Works with any protocol URL or plain `http://`/`https://` URLs.

---

## File Map

```
src/lib/backends/
├── types.ts                    # Backend + ResourceResolver interfaces
├── registry.ts                 # Backend registry (register/get/getAll)
├── demo/
│   ├── index.ts                # DemoBackend class + resolvers
│   ├── mappers.ts              # Deezer → unified models (prefixes demo-image://)
│   ├── api.ts                  # Raw Deezer API calls
│   ├── state.ts                # Local playlist/rating storage
│   └── types.ts                # Deezer response types
├── radio-browser/
│   └── index.ts                # RadioBrowserBackend (radiobrowser-image://)
├── podcast-index/
│   └── index.ts                # PodcastIndexBackend (podcastindex-image://)
└── models/                     # Shared data models

src/lib/cache/
├── types.ts                    # CacheProvider + CacheStats interfaces
├── registry.ts                 # Cache provider registry
└── providers/
    ├── image.ts                # Wraps imageCache.ts (disk)
    ├── media.ts                # Wraps mediaCache.ts (disk)
    ├── metadata.ts             # Wraps icyMetadataStore.ts (memory)
    ├── audioAnalysis.ts        # Wraps engine analysis cache (memory, client-side)
    └── api.ts                  # Wraps podcast feed cache (memory)

src/lib/server/
├── imageResolvers.ts           # Protocol parser + resolver registry
├── diskCache.ts                # Reusable disk cache class (SHA256 sharded)
├── imageCache.ts               # Image cache instance (500MB, 7d TTL)
└── mediaCache.ts               # Media/audio cache instance (2GB, 30d TTL)

src/routes/api/
├── img/+server.ts              # Image proxy endpoint
└── cache/[id]/stats/+server.ts # Unified cache management API

src/routes/settings/cache/
├── +page.svelte                # Cache summary (lists all providers)
└── [id]/+page.svelte           # Cache detail page (stats + settings)
```
