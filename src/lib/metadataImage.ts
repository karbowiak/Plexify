/**
 * Helpers for disk-caching external metadata images via the `metaimg://` Tauri protocol.
 *
 * External image URLs (Deezer CDN, Apple Music CDN, Last.fm CDN) are wrapped with
 * this scheme so the Rust handler can cache them to disk on first load and serve
 * them instantly on subsequent requests — just like `pleximg://` does for Plex artwork.
 *
 * Usage:
 *   <img src={buildMetaImageUrl(deezerArtist.image_url)} />
 */

/**
 * Wraps an external image URL in the `metaimg://` caching scheme.
 * Returns null if the input URL is null/undefined/empty.
 */
export function buildMetaImageUrl(externalUrl: string | null | undefined): string | null {
  if (!externalUrl) return null
  return `metaimg://img?src=${encodeURIComponent(externalUrl)}`
}
