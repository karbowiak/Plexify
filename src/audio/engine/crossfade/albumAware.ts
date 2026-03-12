/**
 * Check if crossfade should be suppressed for same-album transitions.
 * Uses Plex parentKey (album key) comparison.
 */
export function shouldSuppressCrossfade(
  outParentKey: string,
  inParentKey: string,
  sameAlbumCrossfade: boolean,
): boolean {
  if (sameAlbumCrossfade) return false
  if (!outParentKey || !inParentKey) return false
  return outParentKey === inParentKey
}
