//! Crossfade types — shared across all crossfade strategies.

use serde::Deserialize;

/// A point on a loudness ramp (from Plex's prolog/epilog metadata).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RampPoint {
    pub db: f32,
    pub time_sec: f32,
}

/// Parsed start and end ramps for a track.
#[derive(Debug, Clone)]
pub struct TrackRamps {
    pub start_ramp: Vec<RampPoint>,
    pub end_ramp: Vec<RampPoint>,
}

/// A computed transition plan between two tracks.
#[derive(Debug, Clone)]
pub struct TransitionPlan {
    /// Absolute time in the outgoing track (seconds) to start the transition.
    pub start_time_sec: f32,
    /// Duration of the overlap (seconds).
    pub duration_sec: f32,
    /// Fade-out gain curve for outgoing deck. `None` = MixRamp (no gain manipulation).
    pub fade_out_curve: Option<Vec<f32>>,
    /// Fade-in gain curve for incoming deck. `None` = MixRamp (no gain manipulation).
    pub fade_in_curve: Option<Vec<f32>>,
}

/// Parameters needed to compute a crossfade transition.
#[derive(Debug, Clone)]
pub struct CrossfadeParams {
    pub out_duration_sec: f32,
    pub out_parent_key: String,
    pub in_parent_key: String,
    pub out_end_ramp: Option<Vec<RampPoint>>,
    pub in_start_ramp: Option<Vec<RampPoint>>,
    pub crossfade_window_ms: u32,
    pub smart_crossfade_max_ms: u32,
    pub mixramp_db: f32,
    pub smart_crossfade_enabled: bool,
    pub same_album_crossfade: bool,
}

/// Parse a Plex ramp string into RampPoint pairs.
///
/// Format: `"db time;db time;..."` e.g. `"-20.5 0.1;-15.2 0.5;-3.1 1.2"`
pub fn parse_ramp(raw: Option<&str>) -> Vec<RampPoint> {
    let raw = match raw {
        Some(s) if !s.is_empty() => s,
        _ => return Vec::new(),
    };
    raw.split(';')
        .filter(|s| !s.is_empty())
        .filter_map(|pair| {
            let mut parts = pair.trim().split_whitespace();
            let db: f32 = parts.next()?.parse().ok()?;
            let time: f32 = parts.next()?.parse().ok()?;
            Some(RampPoint { db, time_sec: time })
        })
        .collect()
}

/// Crossfade settings passed from JS (via Tauri commands).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossfadeSettings {
    pub crossfade_window_ms: u32,
    pub same_album_crossfade: bool,
    pub smart_crossfade: bool,
    pub smart_crossfade_max_ms: u32,
    pub mixramp_db: f32,
}

impl Default for CrossfadeSettings {
    fn default() -> Self {
        Self {
            crossfade_window_ms: 4000,
            same_album_crossfade: false,
            smart_crossfade: true,
            smart_crossfade_max_ms: 20000,
            mixramp_db: -17.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ramp_basic() {
        let ramp = parse_ramp(Some("-20.5 0.1;-15.2 0.5;-3.1 1.2"));
        assert_eq!(ramp.len(), 3);
        assert!((ramp[0].db - -20.5).abs() < 1e-5);
        assert!((ramp[0].time_sec - 0.1).abs() < 1e-5);
        assert!((ramp[2].db - -3.1).abs() < 1e-5);
        assert!((ramp[2].time_sec - 1.2).abs() < 1e-5);
    }

    #[test]
    fn parse_ramp_empty() {
        assert!(parse_ramp(None).is_empty());
        assert!(parse_ramp(Some("")).is_empty());
    }

    #[test]
    fn parse_ramp_trailing_semicolon() {
        let ramp = parse_ramp(Some("-10 0.5;-5 1.0;"));
        assert_eq!(ramp.len(), 2);
    }

    #[test]
    fn parse_ramp_malformed_pair_skipped() {
        let ramp = parse_ramp(Some("-10 0.5;garbage;-5 1.0"));
        assert_eq!(ramp.len(), 2);
    }
}
