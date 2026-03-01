//! Plex API data models
//!
//! This module defines strongly-typed structures for Plex API responses.
//! All models use Serde for serialization/deserialization.
//!
//! # Serde strategy
//!
//! Plex returns JSON with camelCase / PascalCase keys.  When Tauri serialises
//! these structs back to the TypeScript frontend it uses the Rust field names
//! (snake_case) instead, which match the TypeScript interfaces exactly.
//!
//! To achieve this every renamed field uses `rename(deserialize = "PascalCase")`
//! so the rename only applies when reading from Plex; the default (Rust field
//! name, already snake_case) is used when writing to the frontend.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Serde helpers
// ---------------------------------------------------------------------------

/// Serde helper: deserialize a String field that Plex may return as a JSON
/// string, `null`, or may omit entirely.  All of absent/null/empty map to "".
/// Needed because `#[serde(default)]` only handles a missing key, not `null`.
pub(crate) mod serde_null_or_string {
    use serde::{Deserialize, Deserializer};

    pub fn deserialize<'de, D>(deserializer: D) -> Result<String, D::Error>
    where
        D: Deserializer<'de>,
    {
        Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
    }
}

/// Serde helper: deserialize a field that Plex may return as either a JSON
/// integer or a JSON string (e.g. `"key": "5"` vs `"key": 5`).
pub(crate) mod serde_string_or_i64 {
    use serde::{Deserializer, de::{self, Visitor}};

    pub fn deserialize<'de, D>(deserializer: D) -> Result<i64, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = i64;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("string or integer")
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<i64, E> {
                v.parse().map_err(de::Error::custom)
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<i64, E> { Ok(v) }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<i64, E> { Ok(v as i64) }
            fn visit_f64<E: de::Error>(self, v: f64) -> Result<i64, E> { Ok(v as i64) }
        }
        deserializer.deserialize_any(V)
    }
}

/// Serde helper: deserialize a field that Plex may return as either a JSON
/// boolean (`true`/`false`) or as the string `"1"`/`"0"` / integer `1`/`0`.
pub(crate) mod serde_string_or_bool {
    use serde::{Deserializer, de::{self, Visitor}};

    pub fn deserialize<'de, D>(deserializer: D) -> Result<bool, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = bool;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("bool, string \"0\"/\"1\", or integer 0/1")
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<bool, E> { Ok(v) }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<bool, E> {
                match v { "1" | "true" => Ok(true), "0" | "false" => Ok(false),
                    _ => Err(de::Error::custom(format!("expected bool string, got {:?}", v))) }
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<bool, E> { Ok(v != 0) }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<bool, E> { Ok(v != 0) }
        }
        deserializer.deserialize_any(V)
    }
}

/// Serde helper: like `serde_string_or_i64` but for `Option<i64>`.
/// Handles: absent field (→ None via `#[serde(default)]`), JSON null (→ None),
/// JSON string (→ Some(parsed)), JSON integer (→ Some(v)).
pub(crate) mod serde_string_or_i64_opt {
    use serde::{Deserializer, de::{self, Visitor}};

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = Option<i64>;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("optional string or integer")
            }
            fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> { Ok(None) }
            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> { Ok(None) }
            fn visit_some<D: Deserializer<'de>>(self, d: D) -> Result<Self::Value, D::Error> {
                super::serde_string_or_i64::deserialize(d).map(Some)
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                if v.is_empty() { return Ok(None); }
                v.parse().map(Some).map_err(de::Error::custom)
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Self::Value, E> { Ok(Some(v)) }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Self::Value, E> { Ok(Some(v as i64)) }
            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Self::Value, E> { Ok(Some(v as i64)) }
        }
        deserializer.deserialize_any(V)
    }
}

// ---------------------------------------------------------------------------
// Envelope types (internal — not sent to TypeScript)
// ---------------------------------------------------------------------------

/// Top-level Plex API JSON response envelope.
///
/// Every Plex API response is wrapped in `{"MediaContainer": <inner>}`.
/// Use this as the outermost type when deserializing, then access `.container`.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct PlexApiResponse<T> {
    #[serde(rename = "MediaContainer")]
    pub container: T,
}

/// Plex MediaContainer — the payload inside every Plex API response.
///
/// Items may be under `"Metadata"` (most endpoints), `"Directory"`
/// (library section listings), or `"Hub"` (hub/discovery endpoints).
///
/// Note: `size`, `totalSize`, and `offset` are intentionally omitted —
/// Plex returns them inconsistently as either integers or strings, and
/// we don't use them in the frontend.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct MediaContainer<T> {
    /// Items under the "Metadata" key (tracks, albums, playlists, etc.)
    #[serde(rename = "Metadata", default)]
    pub metadata: Vec<T>,

    /// Items under the "Directory" key (library sections use this key)
    #[serde(rename = "Directory", default)]
    pub directory: Vec<T>,

    /// Items under the "Hub" key (hub/discovery endpoints use this key)
    #[serde(rename = "Hub", default)]
    pub hub: Vec<T>,
}

// ---------------------------------------------------------------------------
// PlexMedia discriminated union
// ---------------------------------------------------------------------------

/// Generic Plex media item.
///
/// Plex uses an internally-tagged representation: `{"type": "track", ...fields...}`.
/// Serde deserialises that flat structure; when serialised back to TypeScript the
/// same flat layout is produced, which TypeScript models as an intersection type.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(tag = "type")]
pub enum PlexMedia {
    #[serde(rename = "track")]
    Track(Track),
    #[serde(rename = "album")]
    Album(Album),
    #[serde(rename = "artist")]
    Artist(Artist),
    #[serde(rename = "playlist")]
    Playlist(Playlist),
    #[default]
    #[serde(other)]
    Unknown,
}

impl PlexMedia {
    /// Return the type string for this item — useful in tests/logging.
    #[allow(dead_code)]
    pub fn item_type(&self) -> &'static str {
        match self {
            Self::Track(_) => "track",
            Self::Album(_) => "album",
            Self::Artist(_) => "artist",
            Self::Playlist(_) => "playlist",
            Self::Unknown => "unknown",
        }
    }
}

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

/// A track (song) in the library
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Track {
    /// Unique key identifying the track (Plex returns this as a string)
    #[serde(rename(deserialize = "ratingKey"), deserialize_with = "serde_string_or_i64::deserialize", default)]
    pub rating_key: i64,

    /// API URL path
    #[serde(default)]
    pub key: String,

    /// Track title
    #[serde(default)]
    pub title: String,

    /// Track number
    #[serde(default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub index: i64,

    /// Duration in milliseconds
    #[serde(default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub duration: i64,

    /// Album rating key
    #[serde(rename(deserialize = "parentKey"), default, deserialize_with = "serde_null_or_string::deserialize")]
    pub parent_key: String,

    /// Album title
    #[serde(rename(deserialize = "parentTitle"), default, deserialize_with = "serde_null_or_string::deserialize")]
    pub parent_title: String,

    /// Artist rating key
    #[serde(rename(deserialize = "grandparentKey"), default, deserialize_with = "serde_null_or_string::deserialize")]
    pub grandparent_key: String,

    /// Artist name
    #[serde(rename(deserialize = "grandparentTitle"), default, deserialize_with = "serde_null_or_string::deserialize")]
    pub grandparent_title: String,

    /// Library section ID
    #[serde(rename(deserialize = "librarySectionID"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub library_section_id: i64,

    /// Library section key
    #[serde(rename(deserialize = "librarySectionKey"), default)]
    pub library_section_key: Option<String>,

    /// Library section title
    #[serde(rename(deserialize = "librarySectionTitle"), default)]
    pub library_section_title: Option<String>,

    /// Year of release
    #[serde(default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub year: i64,

    /// Number of times played
    #[serde(rename(deserialize = "viewCount"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub view_count: i64,

    /// Sonic distance from a reference track
    #[serde(default)]
    pub distance: Option<f64>,

    /// Track/album artwork URL (track's own thumb, usually same as album art)
    #[serde(default)]
    pub thumb: Option<String>,

    /// Parent (album) artwork URL — returned by Plex for smart playlist items
    /// when the track doesn't have its own thumb set.
    #[serde(rename(deserialize = "parentThumb"), default)]
    pub parent_thumb: Option<String>,

    /// Grandparent (artist) artwork URL
    #[serde(rename(deserialize = "grandparentThumb"), default)]
    pub grandparent_thumb: Option<String>,

    /// Thumbnail blur hash
    #[serde(rename(deserialize = "thumbBlurHash"), default)]
    pub thumb_blur_hash: Option<String>,

    /// Summary/description
    #[serde(default)]
    pub summary: Option<String>,

    /// User rating (0-10)
    #[serde(rename(deserialize = "userRating"), default)]
    pub user_rating: Option<f64>,

    /// When the track was added
    #[serde(rename(deserialize = "addedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub added_at: Option<DateTime<Utc>>,

    /// When the track was last viewed
    #[serde(rename(deserialize = "lastViewedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub last_viewed_at: Option<DateTime<Utc>>,

    /// When the track was last rated
    #[serde(rename(deserialize = "lastRatedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub last_rated_at: Option<DateTime<Utc>>,

    /// When the track was last updated
    #[serde(rename(deserialize = "updatedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub updated_at: Option<DateTime<Utc>>,

    /// Plex GUID
    #[serde(default)]
    pub guid: Option<String>,

    /// Audio bitrate (if available)
    #[serde(rename(deserialize = "audioBitrate"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub audio_bitrate: Option<i64>,

    /// Audio channels (2, 5.1, etc.)
    #[serde(rename(deserialize = "audioChannels"), default)]
    pub audio_channels: Option<f64>,

    /// Audio codec (mp3, aac, flac, etc.)
    #[serde(rename(deserialize = "audioCodec"), default)]
    pub audio_codec: Option<String>,

    /// Original artist name (if different from grandparent)
    #[serde(rename(deserialize = "originalTitle"), default)]
    pub original_title: Option<String>,

    /// Primary extra key
    #[serde(rename(deserialize = "primaryExtraKey"), default)]
    pub primary_extra_key: Option<String>,

    /// View offset (for resume playback)
    #[serde(rename(deserialize = "viewOffset"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub view_offset: Option<i64>,

    /// Music analysis version (indicates sonic analysis is available)
    #[serde(rename(deserialize = "musicAnalysisVersion"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub music_analysis_version: Option<i64>,

    /// Number of times this track has been rated
    #[serde(rename(deserialize = "ratingCount"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub rating_count: Option<i64>,

    /// Number of times this track has been skipped
    #[serde(rename(deserialize = "skipCount"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub skip_count: Option<i64>,

    /// Media files for this track (contains stream/part info)
    #[serde(rename(deserialize = "Media"), default)]
    pub media: Vec<Media>,
}

// ---------------------------------------------------------------------------
// Media / MediaPart
// ---------------------------------------------------------------------------

/// A media file attached to a track
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Media {
    /// Unique media ID
    #[serde(default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub id: i64,

    /// Duration in milliseconds
    #[serde(default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub duration: Option<i64>,

    /// Bitrate in kbps
    #[serde(default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub bitrate: Option<i64>,

    /// Number of audio channels
    #[serde(rename(deserialize = "audioChannels"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub audio_channels: Option<i64>,

    /// Audio codec (flac, mp3, aac, etc.)
    #[serde(rename(deserialize = "audioCodec"), default)]
    pub audio_codec: Option<String>,

    /// Container format (flac, mp3, m4a, etc.)
    #[serde(default)]
    pub container: Option<String>,

    /// The actual file parts
    #[serde(rename(deserialize = "Part"), default)]
    pub parts: Vec<MediaPart>,
}

/// An individual file part of a media item
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct MediaPart {
    /// Unique part ID
    #[serde(default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub id: i64,

    /// Stream key — append to base_url + token for direct play URL
    #[serde(default)]
    pub key: String,

    /// Duration in milliseconds
    #[serde(default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub duration: Option<i64>,

    /// Absolute file path on the server
    #[serde(default)]
    pub file: Option<String>,

    /// File size in bytes
    #[serde(default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub size: Option<i64>,

    /// Container format
    #[serde(default)]
    pub container: Option<String>,

    /// Audio profile
    #[serde(rename(deserialize = "audioProfile"), default)]
    pub audio_profile: Option<String>,

    /// Whether BIF/preview thumbnails exist
    #[serde(default)]
    pub indexes: Option<String>,
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

/// A generic Plex tag (Genre, Subformat, Style, Mood, etc.)
///
/// Plex returns these as arrays of objects: `"Genre": [{"tag": "Rock", ...}]`
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct PlexTag {
    pub tag: String,

    #[serde(default)]
    pub id: Option<i64>,

    #[serde(default)]
    pub filter: Option<String>,
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/// A critic / editorial review returned by `includeReviews=1`
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Review {
    #[serde(default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub id: Option<i64>,

    /// Short headline / tag
    #[serde(default)]
    pub tag: Option<String>,

    /// Full review text
    #[serde(default)]
    pub text: Option<String>,

    /// Image URL for the review source
    #[serde(default)]
    pub image: Option<String>,

    /// Link to the original review
    #[serde(default)]
    pub link: Option<String>,

    /// Source name (e.g. "AllMusic", "Pitchfork")
    #[serde(default)]
    pub source: Option<String>,
}

// ---------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------

/// An album in the library
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Album {
    /// Unique key identifying the album (Plex returns this as a string)
    #[serde(rename(deserialize = "ratingKey"), deserialize_with = "serde_string_or_i64::deserialize", default)]
    pub rating_key: i64,

    /// API URL path
    #[serde(default)]
    pub key: String,

    /// Album title
    #[serde(default)]
    pub title: String,

    /// Artist rating key
    #[serde(rename(deserialize = "parentKey"), default)]
    pub parent_key: String,

    /// Artist name
    #[serde(rename(deserialize = "parentTitle"), default)]
    pub parent_title: String,

    /// Year of release
    #[serde(default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub year: i64,

    /// Library section ID
    #[serde(rename(deserialize = "librarySectionID"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub library_section_id: i64,

    /// Number of tracks in the album
    #[serde(rename(deserialize = "leafCount"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub leaf_count: i64,

    /// Number of tracks marked as played
    #[serde(rename(deserialize = "viewedLeafCount"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub viewed_leaf_count: i64,

    /// Studio
    #[serde(default)]
    pub studio: Option<String>,

    /// Artwork URL
    #[serde(default)]
    pub thumb: Option<String>,

    /// Summary/description
    #[serde(default)]
    pub summary: Option<String>,

    /// User rating (0-10)
    #[serde(rename(deserialize = "userRating"), default)]
    pub user_rating: Option<f64>,

    /// When the album was added
    #[serde(rename(deserialize = "addedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub added_at: Option<DateTime<Utc>>,

    /// When the album was last viewed
    #[serde(rename(deserialize = "lastViewedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub last_viewed_at: Option<DateTime<Utc>>,

    /// When the album was last rated
    #[serde(rename(deserialize = "lastRatedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub last_rated_at: Option<DateTime<Utc>>,

    /// When the album was last updated
    #[serde(rename(deserialize = "updatedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub updated_at: Option<DateTime<Utc>>,

    /// When the album was originally released
    #[serde(rename(deserialize = "originallyAvailableAt"), default)]
    pub originally_available_at: Option<String>,

    /// Sonic distance from a reference item (0.0 = identical, 1.0 = maximally different)
    #[serde(default)]
    pub distance: Option<f64>,

    /// Plex GUID
    #[serde(default)]
    pub guid: Option<String>,

    /// Artist's Plex GUID
    #[serde(rename(deserialize = "parentGuid"), default)]
    pub parent_guid: Option<String>,

    /// Artist theme URL
    #[serde(rename(deserialize = "parentTheme"), default)]
    pub parent_theme: Option<String>,

    /// Artist thumbnail URL
    #[serde(rename(deserialize = "parentThumb"), default)]
    pub parent_thumb: Option<String>,

    /// Format tags (e.g., "Single", "EP", "Live") — empty Vec for full albums.
    /// Plex returns this as `"Format": [{"tag": "Single", ...}]`
    /// Note: Plex's JSON field is "Format" (not "Subformat") for album type classification.
    #[serde(rename(deserialize = "Format"), default)]
    pub subformat: Vec<PlexTag>,

    /// Genre tags (e.g., "Electronic", "Pop")
    #[serde(rename(deserialize = "Genre"), default)]
    pub genre: Vec<PlexTag>,

    /// Style tags (e.g., "Ambient", "Synth-pop")
    #[serde(rename(deserialize = "Style"), default)]
    pub style: Vec<PlexTag>,

    /// Mood tags (e.g., "Energetic", "Melancholic")
    #[serde(rename(deserialize = "Mood"), default)]
    pub mood: Vec<PlexTag>,

    /// Record label tags
    #[serde(rename(deserialize = "Label"), default)]
    pub label: Vec<PlexTag>,

    /// Collection tags
    #[serde(rename(deserialize = "Collection"), default)]
    pub collection: Vec<PlexTag>,

    /// Critic / editorial reviews (populated when `includeReviews=1`)
    #[serde(rename(deserialize = "Review"), default)]
    pub reviews: Vec<Review>,

    /// Loudness analysis version
    #[serde(rename(deserialize = "loudnessAnalysisVersion"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub loudness_analysis_version: Option<i64>,
}

// ---------------------------------------------------------------------------
// Artist
// ---------------------------------------------------------------------------

/// An artist in the library
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Artist {
    /// Unique key identifying the artist (Plex returns this as a string)
    #[serde(rename(deserialize = "ratingKey"), deserialize_with = "serde_string_or_i64::deserialize", default)]
    pub rating_key: i64,

    /// API URL path
    #[serde(default)]
    pub key: String,

    /// Artist name
    #[serde(default)]
    pub title: String,

    /// Sort title
    #[serde(rename(deserialize = "titleSort"), default)]
    pub title_sort: Option<String>,

    /// Library section ID
    #[serde(rename(deserialize = "librarySectionID"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub library_section_id: i64,

    /// Album sort setting
    #[serde(rename(deserialize = "albumSort"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub album_sort: i64,

    /// Rating (0-10)
    #[serde(default)]
    pub rating: Option<f64>,

    /// Artwork URL
    #[serde(default)]
    pub thumb: Option<String>,

    /// Summary/description
    #[serde(default)]
    pub summary: Option<String>,

    /// User rating (0-10)
    #[serde(rename(deserialize = "userRating"), default)]
    pub user_rating: Option<f64>,

    /// When the artist was added
    #[serde(rename(deserialize = "addedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub added_at: Option<DateTime<Utc>>,

    /// When the artist was last viewed
    #[serde(rename(deserialize = "lastViewedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub last_viewed_at: Option<DateTime<Utc>>,

    /// When the artist was last rated
    #[serde(rename(deserialize = "lastRatedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub last_rated_at: Option<DateTime<Utc>>,

    /// When the artist was last updated
    #[serde(rename(deserialize = "updatedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub updated_at: Option<DateTime<Utc>>,

    /// Plex GUID
    #[serde(default)]
    pub guid: Option<String>,

    /// Theme music URL
    #[serde(default)]
    pub theme: Option<String>,

    /// Art URL
    #[serde(default)]
    pub art: Option<String>,

    /// Locations (folder paths)
    #[serde(default)]
    pub locations: Vec<String>,

    /// Sonic distance from a reference item (0.0 = identical, 1.0 = maximally different)
    /// Populated when this artist is returned by a /nearest (sonic similarity) query.
    #[serde(default)]
    pub distance: Option<f64>,
}

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

/// A playlist in the library
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Playlist {
    /// Unique key identifying the playlist (Plex returns this as a string)
    #[serde(rename(deserialize = "ratingKey"), deserialize_with = "serde_string_or_i64::deserialize", default)]
    pub rating_key: i64,

    /// API URL path
    #[serde(default)]
    pub key: String,

    /// Playlist title
    #[serde(default)]
    pub title: String,

    /// Sort title
    #[serde(rename(deserialize = "titleSort"), default)]
    pub title_sort: Option<String>,

    /// Playlist type (audio, video, photo)
    #[serde(rename(deserialize = "playlistType"), default)]
    pub playlist_type: String,

    /// Whether this is a smart playlist
    #[serde(default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub smart: bool,

    /// Whether this is a radio station
    #[serde(default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub radio: bool,

    /// Number of items in the playlist
    #[serde(rename(deserialize = "leafCount"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub leaf_count: i64,

    /// Duration in milliseconds
    #[serde(default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub duration: Option<i64>,

    /// Duration in seconds
    #[serde(rename(deserialize = "durationInSeconds"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub duration_in_seconds: Option<i64>,

    /// Library section ID (for radio playlists)
    #[serde(rename(deserialize = "librarySectionID"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub library_section_id: Option<i64>,

    /// Library section key
    #[serde(rename(deserialize = "librarySectionKey"), default)]
    pub library_section_key: Option<String>,

    /// Library section title
    #[serde(rename(deserialize = "librarySectionTitle"), default)]
    pub library_section_title: Option<String>,

    /// Summary/description
    #[serde(default)]
    pub summary: Option<String>,

    /// Custom thumbnail URL (user-uploaded artwork)
    #[serde(default)]
    pub thumb: Option<String>,

    /// Composite artwork URL (auto-generated from track art)
    #[serde(default)]
    pub composite: Option<String>,

    /// Content filter (for smart playlists)
    #[serde(default)]
    pub content: Option<String>,

    /// Icon URI (for smart playlists)
    #[serde(default)]
    pub icon: Option<String>,

    /// When the playlist was added
    #[serde(rename(deserialize = "addedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub added_at: Option<DateTime<Utc>>,

    /// When the playlist was last updated
    #[serde(rename(deserialize = "updatedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub updated_at: Option<DateTime<Utc>>,

    /// Plex GUID
    #[serde(default)]
    pub guid: Option<String>,

    /// Whether sync is allowed
    #[serde(rename(deserialize = "allowSync"), default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub allow_sync: bool,
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

/// A hub (home screen recommendation)
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct Hub {
    /// Hub title
    #[serde(default)]
    pub title: String,

    /// Hub identifier (e.g. "hub.music.recentlyPlayed")
    #[serde(rename(deserialize = "hubIdentifier"), default)]
    pub hub_identifier: String,

    /// Number of items in the hub (Plex returns this as a string)
    #[serde(rename = "size", default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub size: i64,

    /// The items in the hub
    #[serde(rename(deserialize = "Metadata"), default)]
    pub metadata: Vec<PlexMedia>,

    /// Hub visibility
    #[serde(default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub visibility: Option<i64>,

    /// Hub style
    #[serde(default)]
    pub style: Option<String>,
}

// ---------------------------------------------------------------------------
// LibrarySection
// ---------------------------------------------------------------------------

/// Library section (movie, show, music, photo)
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct LibrarySection {
    /// Section key (ID) — Plex returns this as a string
    #[serde(default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub key: i64,

    /// Section title
    #[serde(default)]
    pub title: String,

    /// Section type (movie, show, artist, photo).
    /// Plex uses the JSON key "type" — renamed only for deserialization so
    /// Tauri serialises it as "section_type" to TypeScript.
    #[serde(rename(deserialize = "type"), default)]
    pub section_type: String,

    /// Metadata agent
    #[serde(default)]
    pub agent: String,

    /// Scanner
    #[serde(default)]
    pub scanner: String,

    /// Language
    #[serde(default)]
    pub language: Option<String>,

    /// Locations (folder paths)
    #[serde(default)]
    pub locations: Vec<String>,

    /// Artwork URL
    #[serde(default)]
    pub thumb: Option<String>,

    /// Composite artwork URL
    #[serde(default)]
    pub composite: Option<String>,

    /// Art URL
    #[serde(default)]
    pub art: Option<String>,

    /// Total size
    #[serde(rename(deserialize = "totalSize"), default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub total_size: Option<i64>,

    /// When the section was created (Unix timestamp from Plex)
    #[serde(rename(deserialize = "createdAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub created_at: Option<DateTime<Utc>>,

    /// When the section was last refreshed (Unix timestamp from Plex)
    #[serde(rename(deserialize = "refreshedAt"), default, deserialize_with = "chrono::serde::ts_seconds_option::deserialize")]
    pub refreshed_at: Option<DateTime<Utc>>,

    /// Whether the section is currently refreshing
    #[serde(default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub refreshing: bool,

    /// Whether filters are available
    #[serde(default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub filters: bool,

    /// Whether sync is allowed
    #[serde(rename(deserialize = "allowSync"), default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub allow_sync: bool,

    /// Section UUID
    #[serde(default)]
    pub uuid: Option<String>,
}

// ---------------------------------------------------------------------------
// PlayQueue
// ---------------------------------------------------------------------------

/// A play queue managed by the Plex server
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct PlayQueue {
    /// Play queue ID
    #[serde(rename(deserialize = "playQueueID"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub id: i64,

    /// Rating key of the currently selected item
    #[serde(rename(deserialize = "playQueueSelectedItemID"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub selected_item_id: i64,

    /// Offset within the selected item (for resume)
    #[serde(rename(deserialize = "playQueueSelectedItemOffset"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub selected_item_offset: i64,

    /// Total number of items in the queue
    #[serde(rename(deserialize = "playQueueTotalCount"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub total_count: i64,

    /// Whether shuffle is active
    #[serde(rename(deserialize = "playQueueShuffled"), default)]
    pub shuffled: bool,

    /// Repeat mode: 0=off, 1=repeat-one, 2=repeat-all
    #[serde(rename(deserialize = "playQueueRepeat"), default, deserialize_with = "serde_string_or_i64::deserialize")]
    pub repeat: i64,

    /// The source URI used to create this queue
    #[serde(rename(deserialize = "playQueueSourceURI"), default)]
    pub source_uri: Option<String>,

    /// The tracks in the queue
    #[serde(rename(deserialize = "Metadata"), default)]
    pub items: Vec<Track>,
}

// ---------------------------------------------------------------------------
// Sonic / stream levels
// ---------------------------------------------------------------------------

/// A loudness/peak level sample from a stream's analysis data
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct Level {
    /// RMS loudness value (dBFS)
    #[serde(default)]
    pub loudness: f64,

    /// Peak value (dBFS)
    #[serde(default)]
    pub peak: f64,

    /// Sample start index
    #[serde(rename(deserialize = "sampleStart"), default)]
    pub sample_start: i64,

    /// Sample end index
    #[serde(rename(deserialize = "sampleEnd"), default)]
    pub sample_end: i64,
}

/// Container returned by the `/library/streams/{id}/levels` endpoint
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct LevelsContainer {
    #[serde(default, deserialize_with = "serde_string_or_i64_opt::deserialize")]
    pub size: Option<i64>,

    #[serde(rename(deserialize = "Level"), default)]
    pub levels: Vec<Level>,
}

// ---------------------------------------------------------------------------
// Server info
// ---------------------------------------------------------------------------

/// Response from `GET /identity`
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct IdentityResponse {
    /// Whether the server is claimed by a Plex account
    #[serde(default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub claimed: bool,

    /// Unique server machine identifier
    #[serde(rename(deserialize = "machineIdentifier"), default)]
    pub machine_identifier: String,

    /// Server software version string
    #[serde(default)]
    pub version: String,
}

/// Response from `GET /` (server capabilities)
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct ServerInfo {
    /// Human-readable server name
    #[serde(rename(deserialize = "friendlyName"), default)]
    pub friendly_name: String,

    /// Unique server machine identifier
    #[serde(rename(deserialize = "machineIdentifier"), default)]
    pub machine_identifier: String,

    /// Host OS platform (Linux, Windows, macOS, etc.)
    #[serde(default)]
    pub platform: String,

    /// Server software version string
    #[serde(default)]
    pub version: String,

    /// Whether the server is linked to a Plex account
    #[serde(rename(deserialize = "myPlex"), default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub my_plex: bool,

    /// Whether multi-user/home mode is enabled
    #[serde(default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub multiuser: bool,

    /// Whether allow sync is enabled
    #[serde(rename(deserialize = "allowSync"), default, deserialize_with = "serde_string_or_bool::deserialize")]
    pub allow_sync: bool,
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/// User-stored connection settings (persisted to disk)
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct PlexSettings {
    /// Base URL of the Plex server (e.g. "http://192.168.1.1:32400")
    #[serde(default)]
    pub base_url: String,

    /// Plex authentication token
    #[serde(default)]
    pub token: String,

    /// Stable per-installation UUID sent as X-Plex-Client-Identifier.
    /// Generated on first launch and preserved across saves.
    #[serde(default)]
    pub client_id: String,

    /// All known connection URLs for this server, ordered best-first.
    /// Used as fallbacks when the primary `base_url` is unreachable.
    #[serde(default)]
    pub all_urls: Vec<String>,
}

// ---------------------------------------------------------------------------
// Misc query helpers (not returned to TypeScript)
// ---------------------------------------------------------------------------

/// Search filters for library queries
#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct SearchFilters {
    /// Library section ID
    #[serde(rename = "type")]
    pub libtype: Option<String>,

    /// Sort string (e.g., "addedAt:desc")
    pub sort: Option<String>,

    /// Limit on number of results
    pub limit: Option<i32>,
}

/// Sonic similarity query parameters
#[derive(Debug, Clone, Serialize)]
#[allow(dead_code)]
pub struct SonicParams {
    /// Limit on number of results
    pub limit: Option<i32>,

    /// Maximum sonic distance (0.0 - 1.0)
    #[serde(rename = "maxDistance")]
    pub max_distance: Option<f64>,

    /// Pivot track rating key
    pub pivot: Option<i64>,

    /// Target track rating key
    #[serde(rename = "to")]
    pub to: Option<i64>,
}
