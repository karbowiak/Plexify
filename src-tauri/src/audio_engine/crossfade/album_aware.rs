//! Album-aware crossfade suppression.
//!
//! Suppress crossfade when consecutive tracks share the same album (parentKey)
//! and the user has opted out of same-album crossfade.

/// Returns `true` if crossfade should be suppressed for this track pair.
pub fn should_suppress_crossfade(
    out_parent_key: &str,
    in_parent_key: &str,
    same_album_crossfade_enabled: bool,
) -> bool {
    // If same-album crossfade is enabled, never suppress
    if same_album_crossfade_enabled {
        return false;
    }
    // Suppress if both tracks share a non-empty parent key
    !out_parent_key.is_empty()
        && !in_parent_key.is_empty()
        && out_parent_key == in_parent_key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_album_suppresses_when_disabled() {
        assert!(should_suppress_crossfade("/album/123", "/album/123", false));
    }

    #[test]
    fn same_album_allows_when_enabled() {
        assert!(!should_suppress_crossfade("/album/123", "/album/123", true));
    }

    #[test]
    fn different_albums_never_suppress() {
        assert!(!should_suppress_crossfade("/album/123", "/album/456", false));
        assert!(!should_suppress_crossfade("/album/123", "/album/456", true));
    }

    #[test]
    fn empty_keys_never_suppress() {
        assert!(!should_suppress_crossfade("", "", false));
        assert!(!should_suppress_crossfade("/album/123", "", false));
        assert!(!should_suppress_crossfade("", "/album/123", false));
    }
}
