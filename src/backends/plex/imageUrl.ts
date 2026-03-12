/**
 * Plex-specific image URL assembly.
 *
 * Assembles the raw Plex server URL (with token) then wraps it in the
 * semantic `image://` scheme via the shared buildImageUrl().
 */

import { buildImageUrl, buildExternalImageUrl } from "../../lib/imageUrl"

type EntityType = "artist" | "album" | "track" | "playlist"

/**
 * Build a semantic image URL for a Plex entity.
 *
 * @param baseUrl     Plex server base URL
 * @param token       Plex auth token
 * @param entityType  "artist" | "album" | "track" | "playlist"
 * @param entityId    Plex rating_key as string
 * @param thumbPath   Plex thumb path (e.g. "/library/metadata/548757/thumb/1234567890")
 * @param name        Entity name for metadata fallback
 * @param artist      Artist name for album/track metadata fallback
 */
export function buildPlexImageUrl(
  baseUrl: string,
  token: string,
  entityType: EntityType,
  entityId: string,
  thumbPath: string,
  name?: string | null,
  artist?: string | null,
): string | null {
  if (!baseUrl || !token || !thumbPath) return null
  // If the path is already an absolute URL (e.g. image field from newer PMS),
  // use it directly without prepending the Plex server base URL.
  let plexUrl: string
  if (thumbPath.startsWith("http://") || thumbPath.startsWith("https://")) {
    plexUrl = thumbPath
  } else {
    const base = baseUrl.replace(/\/$/, "")
    const cleanPath = thumbPath.replace(/^\//, "")
    plexUrl = `${base}/${cleanPath}?X-Plex-Token=${token}`
  }
  return buildImageUrl(entityType, entityId, plexUrl, name, artist)
}

/**
 * Build an image URL for Plex resources that don't map to a generic entity
 * (hub mixes, composite playlist thumbs when we don't have the playlist ID, etc.).
 */
export function buildPlexExternalImageUrl(
  baseUrl: string,
  token: string,
  thumbPath: string,
): string | null {
  if (!baseUrl || !token || !thumbPath) return null
  const base = baseUrl.replace(/\/$/, "")
  const cleanPath = thumbPath.replace(/^\//, "")
  const plexUrl = `${base}/${cleanPath}?X-Plex-Token=${token}`
  return buildExternalImageUrl(plexUrl)
}
