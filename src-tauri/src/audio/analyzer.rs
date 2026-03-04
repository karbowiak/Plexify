#![allow(dead_code)]

use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use symphonia::core::audio::SampleBuffer;
use tracing::{debug, info, warn};

use super::bpm;
use super::cache::{audio_cache_key, open_audio_file, probe_audio};
use super::state::DecoderShared;

// ---------------------------------------------------------------------------
// TrackAnalysis
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackAnalysis {
    pub rating_key: i64,
    /// First sample above silence threshold (ms from start)
    pub audio_start_ms: i64,
    /// Last sample above silence threshold (ms from start)
    pub audio_end_ms: i64,
    /// Where the musical outro begins (energy decline)
    pub outro_start_ms: i64,
    /// Where the musical intro reaches sustained energy
    pub intro_end_ms: i64,
    /// Track's median RMS energy
    pub median_energy: f32,
    /// Detected BPM
    pub bpm: f32,
}

// ---------------------------------------------------------------------------
// In-memory cache (capped at 200 entries) + disk sidecar persistence
// ---------------------------------------------------------------------------

const MAX_CACHE_ENTRIES: usize = 200;

static ANALYSIS_CACHE: Lazy<Mutex<HashMap<i64, TrackAnalysis>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Derive the `.analysis` sidecar path from the audio cache key.
fn sidecar_path(cache_dir: &std::path::Path, url: &str) -> PathBuf {
    let key = audio_cache_key(url);
    // Replace .audio extension with .analysis
    let base = key.strip_suffix(".audio").unwrap_or(&key);
    cache_dir.join(format!("{base}.analysis"))
}

/// Try to load a TrackAnalysis from its `.analysis` sidecar file.
fn load_from_sidecar(cache_dir: &std::path::Path, url: &str) -> Option<TrackAnalysis> {
    let path = sidecar_path(cache_dir, url);
    let data = std::fs::read_to_string(&path).ok()?;
    let analysis: TrackAnalysis = serde_json::from_str(&data).ok()?;
    debug!(rating_key = analysis.rating_key, "Loaded analysis from sidecar");
    Some(analysis)
}

/// Write a TrackAnalysis to its `.analysis` sidecar file.
fn save_to_sidecar(cache_dir: &std::path::Path, url: &str, analysis: &TrackAnalysis) {
    let path = sidecar_path(cache_dir, url);
    match serde_json::to_string(analysis) {
        Ok(json) => {
            if let Ok(mut f) = File::create(&path) {
                let _ = f.write_all(json.as_bytes());
            }
        }
        Err(e) => warn!(error = %e, "Failed to serialize analysis sidecar"),
    }
}

/// Retrieve a cached analysis by rating_key (memory only — for hot path).
/// Use `get_analysis_with_disk` when you also want to check disk sidecars.
pub fn get_analysis(rating_key: i64) -> Option<TrackAnalysis> {
    ANALYSIS_CACHE
        .lock()
        .ok()
        .and_then(|c| c.get(&rating_key).cloned())
}

/// Retrieve analysis: check memory cache, then fall back to disk sidecar.
/// If found on disk, promotes to memory cache for subsequent lookups.
pub fn get_analysis_with_disk(rating_key: i64, cache_dir: Option<&std::path::Path>, url: &str) -> Option<TrackAnalysis> {
    // Check memory first
    if let Some(a) = get_analysis(rating_key) {
        return Some(a);
    }
    // Fall back to disk sidecar
    let dir = cache_dir?;
    let analysis = load_from_sidecar(dir, url)?;
    // Promote to memory cache
    store_in_memory(analysis.clone());
    Some(analysis)
}

fn store_in_memory(analysis: TrackAnalysis) {
    if let Ok(mut cache) = ANALYSIS_CACHE.lock() {
        if cache.len() >= MAX_CACHE_ENTRIES {
            let keys: Vec<i64> = cache.keys().take(MAX_CACHE_ENTRIES / 2).copied().collect();
            for k in keys {
                cache.remove(&k);
            }
        }
        cache.insert(analysis.rating_key, analysis);
    }
}

fn store_analysis(analysis: TrackAnalysis, cache_dir: Option<&std::path::Path>, url: &str) {
    // Persist to disk sidecar first
    if let Some(dir) = cache_dir {
        save_to_sidecar(dir, url, &analysis);
    }
    // Then memory
    store_in_memory(analysis);
}

// ---------------------------------------------------------------------------
// Analysis constants
// ---------------------------------------------------------------------------

/// Silence threshold in dBFS. Windows below this are considered silent.
const SILENCE_THRESHOLD_DBFS: f32 = -55.0;

/// Energy window size in seconds for the RMS envelope.
const ENERGY_WINDOW_SECS: f32 = 0.1; // 100ms windows

/// Rolling average window for outro/intro detection (seconds).
const ROLLING_AVG_SECS: f32 = 2.0;

/// Energy ratio threshold — outro starts when rolling average drops below
/// this fraction of the track's median energy.
const ENERGY_RATIO_THRESHOLD: f32 = 0.40;

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

/// Analyze a track's audio content. Returns None if decoding fails.
///
/// This function:
/// 1. Decodes the full file to mono
/// 2. Computes RMS energy in 100ms windows
/// 3. Finds silence boundaries (audio_start_ms, audio_end_ms)
/// 4. Detects outro_start_ms and intro_end_ms using energy envelope
/// 5. Detects BPM from the first 30s
pub fn analyze(
    rating_key: i64,
    url: &str,
    duration_ms: i64,
    shared: &Arc<DecoderShared>,
) -> Option<TrackAnalysis> {
    let cache_dir = shared.cache_dir.as_ref()?;

    // Check disk sidecar first — avoids re-decoding the full track
    if let Some(cached) = load_from_sidecar(cache_dir, url) {
        if cached.rating_key == rating_key {
            // Validate: audio_end should be at least half the expected duration.
            // A cached analysis from a partial decode would have a very low
            // audio_end_ms — discard it and re-analyze.
            if duration_ms > 0 && cached.audio_end_ms < duration_ms / 2 {
                info!(
                    rating_key = rating_key,
                    audio_end_ms = cached.audio_end_ms,
                    duration_ms = duration_ms,
                    "Discarding stale analysis sidecar (audio_end < 50% of duration)"
                );
                // Delete the bad sidecar so it doesn't persist
                let _ = std::fs::remove_file(sidecar_path(cache_dir, url));
            } else {
                store_in_memory(cached.clone());
                return Some(cached);
            }
        }
    }

    let cache_path = cache_dir.join(audio_cache_key(url));

    // Wait up to 10s for prefetch to complete
    let mut waited_ms = 0u64;
    while !cache_path.exists() && waited_ms < 10_000 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        waited_ms += 500;
    }
    if !cache_path.exists() {
        return None;
    }

    let (mss, _url) = open_audio_file(&cache_path, url).ok()?;
    let (mut fmt, mut dec, tid, sr, _ch, _codec, _) = probe_audio(mss, url).ok()?;

    let samples_per_window = ((sr as f32 * ENERGY_WINDOW_SECS) as usize).max(1);

    // Decode full track to mono
    let mut mono_samples: Vec<f32> = Vec::with_capacity(sr as usize * 300); // ~5 min
    let mut sb: Option<SampleBuffer<f32>> = None;

    loop {
        let packet = match fmt.next_packet() {
            Ok(p) if p.track_id() == tid => p,
            Ok(_) => continue,
            Err(_) => break,
        };
        match dec.decode(&packet) {
            Ok(audio_buf) => {
                let spec = *audio_buf.spec();
                let frames = audio_buf.frames();
                let num_samples = frames * spec.channels.count();
                if sb.as_ref().map_or(true, |s| s.capacity() < num_samples) {
                    sb = Some(SampleBuffer::new(frames as u64, spec));
                }
                let s = sb.as_mut().unwrap();
                s.copy_interleaved_ref(audio_buf);
                let actual_ch = spec.channels.count().max(1);
                for frame_samples in s.samples().chunks(actual_ch) {
                    let mono = frame_samples.iter().sum::<f32>() / actual_ch as f32;
                    mono_samples.push(mono);
                }
            }
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(_) => break,
        }
    }

    if mono_samples.is_empty() {
        return None;
    }

    // --- 1. Compute RMS energy envelope (100ms windows) ---
    let energy_envelope: Vec<f32> = mono_samples
        .chunks(samples_per_window)
        .map(|chunk| {
            let mean_sq = chunk.iter().map(|&s| s * s).sum::<f32>() / chunk.len() as f32;
            mean_sq.sqrt()
        })
        .collect();

    if energy_envelope.is_empty() {
        return None;
    }

    // Convert silence threshold from dBFS to linear
    let silence_linear = 10f32.powf(SILENCE_THRESHOLD_DBFS / 20.0);

    // --- 2. Silence boundaries ---
    let window_ms = (ENERGY_WINDOW_SECS * 1000.0) as i64;

    let audio_start_idx = energy_envelope
        .iter()
        .position(|&e| e > silence_linear)
        .unwrap_or(0);
    let audio_start_ms = (audio_start_idx as i64 * window_ms).min(duration_ms);

    let audio_end_idx = energy_envelope
        .iter()
        .rposition(|&e| e > silence_linear)
        .unwrap_or(energy_envelope.len().saturating_sub(1));
    // audio_end is the END of the window that contains the last audible sample
    let audio_end_ms = (((audio_end_idx + 1) as i64) * window_ms).min(duration_ms);

    // --- 3. Median energy (for threshold calculations) ---
    let median_energy = {
        let mut sorted: Vec<f32> = energy_envelope
            .iter()
            .copied()
            .filter(|&e| e > silence_linear)
            .collect();
        if sorted.is_empty() {
            sorted = energy_envelope.clone();
        }
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        sorted[sorted.len() / 2]
    };

    let energy_threshold = median_energy * ENERGY_RATIO_THRESHOLD;

    // --- 4. Outro detection ---
    // Scan backward from audio_end, compute 2s rolling average.
    // Find where rolling average first exceeds the threshold (going backward).
    let rolling_windows = (ROLLING_AVG_SECS / ENERGY_WINDOW_SECS) as usize;
    let outro_start_ms = detect_outro(
        &energy_envelope,
        audio_end_idx,
        energy_threshold,
        rolling_windows,
        window_ms,
        duration_ms,
    );

    // --- 5. Intro detection ---
    // Scan forward from audio_start, find where rolling average reaches threshold.
    let intro_end_ms = detect_intro(
        &energy_envelope,
        audio_start_idx,
        energy_threshold,
        rolling_windows,
        window_ms,
        duration_ms,
    );

    // --- 6. BPM detection (first 30s of mono buffer) ---
    let bpm_samples = sr as usize * 30;
    let bpm_slice = &mono_samples[..mono_samples.len().min(bpm_samples)];
    let detected_bpm = bpm::detect(bpm_slice, sr);

    let analysis = TrackAnalysis {
        rating_key,
        audio_start_ms,
        audio_end_ms,
        outro_start_ms,
        intro_end_ms,
        median_energy,
        bpm: detected_bpm,
    };

    info!(
        rating_key = rating_key,
        audio_start_ms = audio_start_ms,
        audio_end_ms = audio_end_ms,
        outro_start_ms = outro_start_ms,
        intro_end_ms = intro_end_ms,
        median_energy = format!("{:.6}", median_energy),
        bpm = format!("{:.1}", detected_bpm),
        total_windows = energy_envelope.len(),
        "Track analysis complete"
    );

    store_analysis(analysis.clone(), Some(cache_dir.as_path()), url);
    Some(analysis)
}

/// Detect where the outro begins by scanning backward from `end_idx`.
fn detect_outro(
    envelope: &[f32],
    end_idx: usize,
    threshold: f32,
    rolling_len: usize,
    window_ms: i64,
    duration_ms: i64,
) -> i64 {
    if envelope.is_empty() || end_idx == 0 {
        return duration_ms;
    }

    // Scan backward from end_idx
    let start = end_idx.saturating_sub(1);
    for i in (0..=start).rev() {
        let window_end = (i + rolling_len).min(envelope.len());
        let slice = &envelope[i..window_end];
        let avg = slice.iter().sum::<f32>() / slice.len() as f32;
        if avg >= threshold {
            // This is where energy is still strong — outro starts at the next window
            let outro_idx = (i + 1).min(end_idx);
            return (outro_idx as i64 * window_ms).min(duration_ms);
        }
    }

    // Entire track is quiet — outro starts at audio_end
    (end_idx as i64 * window_ms).min(duration_ms)
}

/// Detect where the intro ends by scanning forward from `start_idx`.
fn detect_intro(
    envelope: &[f32],
    start_idx: usize,
    threshold: f32,
    rolling_len: usize,
    window_ms: i64,
    duration_ms: i64,
) -> i64 {
    if envelope.is_empty() {
        return 0;
    }

    for i in start_idx..envelope.len() {
        let window_end = (i + rolling_len).min(envelope.len());
        let slice = &envelope[i..window_end];
        let avg = slice.iter().sum::<f32>() / slice.len() as f32;
        if avg >= threshold {
            return (i as i64 * window_ms).min(duration_ms);
        }
    }

    // Never reaches threshold — use audio_start
    (start_idx as i64 * window_ms).min(duration_ms)
}

// ---------------------------------------------------------------------------
// Background analysis (replaces detect_bpm_bg)
// ---------------------------------------------------------------------------

/// Spawn background analysis for a track. Stores result in cache and updates
/// `shared.next_bpm` for backward compatibility.
pub fn analyze_bg(url: String, rating_key: i64, duration_ms: i64, shared: Arc<DecoderShared>) {
    std::thread::Builder::new()
        .name("track-analyzer".into())
        .spawn(move || {
            if let Some(analysis) = analyze(rating_key, &url, duration_ms, &shared) {
                let bpm_fixed = (analysis.bpm * 100.0) as u64;
                shared.next_bpm.store(bpm_fixed, Ordering::Relaxed);
                debug!(
                    rating_key = rating_key,
                    bpm = analysis.bpm,
                    "Background analysis stored for next track"
                );
            }
        })
        .ok();
}

/// Spawn background analysis for the currently playing track.
pub fn analyze_current_bg(
    url: String,
    rating_key: i64,
    duration_ms: i64,
    shared: Arc<DecoderShared>,
) {
    std::thread::Builder::new()
        .name("track-analyzer-cur".into())
        .spawn(move || {
            if let Some(analysis) = analyze(rating_key, &url, duration_ms, &shared) {
                let bpm_fixed = (analysis.bpm * 100.0) as u64;
                shared.current_bpm.store(bpm_fixed, Ordering::Relaxed);
                debug!(
                    rating_key = rating_key,
                    bpm = analysis.bpm,
                    "Background analysis stored for current track"
                );
            }
        })
        .ok();
}

/// Spawn background analysis for a lookahead track (doesn't touch BPM state).
/// Used to pre-analyze tracks further ahead in the queue.
pub fn analyze_lookahead_bg(
    url: String,
    rating_key: i64,
    duration_ms: i64,
    shared: Arc<DecoderShared>,
) {
    // Skip if already cached
    if get_analysis(rating_key).is_some() {
        return;
    }
    std::thread::Builder::new()
        .name("track-analyzer-ahead".into())
        .spawn(move || {
            let _ = analyze(rating_key, &url, duration_ms, &shared);
        })
        .ok();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sine(freq: f32, sr: u32, duration_secs: f32) -> Vec<f32> {
        let n = (sr as f32 * duration_secs) as usize;
        (0..n)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr as f32).sin())
            .collect()
    }

    fn make_envelope(samples: &[f32], window: usize) -> Vec<f32> {
        samples
            .chunks(window)
            .map(|c| {
                let ms = c.iter().map(|&s| s * s).sum::<f32>() / c.len() as f32;
                ms.sqrt()
            })
            .collect()
    }

    #[test]
    fn silence_boundaries_detect_leading_trailing_silence() {
        let sr = 44100u32;
        let window = (sr as f32 * ENERGY_WINDOW_SECS) as usize;
        let window_ms = (ENERGY_WINDOW_SECS * 1000.0) as i64;
        let silence_linear = 10f32.powf(SILENCE_THRESHOLD_DBFS / 20.0);

        // 1s silence + 3s tone + 2s silence = 6s total
        let silence_1s = vec![0.0f32; sr as usize];
        let tone_3s = make_sine(440.0, sr, 3.0);
        let silence_2s = vec![0.0f32; sr as usize * 2];

        let mut samples = Vec::new();
        samples.extend_from_slice(&silence_1s);
        samples.extend_from_slice(&tone_3s);
        samples.extend_from_slice(&silence_2s);

        let envelope = make_envelope(&samples, window);

        let start_idx = envelope.iter().position(|&e| e > silence_linear).unwrap();
        let end_idx = envelope.iter().rposition(|&e| e > silence_linear).unwrap();

        let start_ms = start_idx as i64 * window_ms;
        let end_ms = (end_idx + 1) as i64 * window_ms;

        // Audio should start around 1000ms (±200ms tolerance for windowing)
        assert!(
            (start_ms - 1000).abs() < 200,
            "audio_start_ms={start_ms}, expected ~1000"
        );
        // Audio should end around 4000ms
        assert!(
            (end_ms - 4000).abs() < 200,
            "audio_end_ms={end_ms}, expected ~4000"
        );
    }

    #[test]
    fn outro_detection_finds_fadeout() {
        let sr = 44100u32;
        let window = (sr as f32 * ENERGY_WINDOW_SECS) as usize;
        let window_ms = (ENERGY_WINDOW_SECS * 1000.0) as i64;
        let duration_ms = 10_000i64;
        let rolling_windows = (ROLLING_AVG_SECS / ENERGY_WINDOW_SECS) as usize;

        // Build: 5s full volume + 3s linear fade + 2s silence
        let full_5s = make_sine(440.0, sr, 5.0);
        let fade_3s: Vec<f32> = (0..(sr as usize * 3))
            .map(|i| {
                let t = i as f32 / (sr as f32 * 3.0);
                let envelope_val = 1.0 - t; // linear fade
                (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sr as f32).sin() * envelope_val
            })
            .collect();
        let silence_2s = vec![0.0f32; sr as usize * 2];

        let mut samples = Vec::new();
        samples.extend_from_slice(&full_5s);
        samples.extend_from_slice(&fade_3s);
        samples.extend_from_slice(&silence_2s);

        let envelope = make_envelope(&samples, window);

        let silence_linear = 10f32.powf(SILENCE_THRESHOLD_DBFS / 20.0);
        let audio_end_idx = envelope.iter().rposition(|&e| e > silence_linear).unwrap_or(0);

        let mut sorted: Vec<f32> = envelope.iter().copied().filter(|&e| e > silence_linear).collect();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let median = sorted[sorted.len() / 2];
        let threshold = median * ENERGY_RATIO_THRESHOLD;

        let outro_ms = detect_outro(&envelope, audio_end_idx, threshold, rolling_windows, window_ms, duration_ms);

        // Outro should start somewhere around 5000-6500ms (where fade begins to drop below threshold)
        assert!(
            outro_ms >= 4500 && outro_ms <= 7000,
            "outro_start_ms={outro_ms}, expected 4500..7000"
        );
    }

    #[test]
    fn intro_detection_finds_fade_in() {
        let sr = 44100u32;
        let window = (sr as f32 * ENERGY_WINDOW_SECS) as usize;
        let window_ms = (ENERGY_WINDOW_SECS * 1000.0) as i64;
        let duration_ms = 8_000i64;
        let rolling_windows = (ROLLING_AVG_SECS / ENERGY_WINDOW_SECS) as usize;

        // Build: 1s silence + 2s fade-in + 5s full volume
        let silence_1s = vec![0.0f32; sr as usize];
        let fade_in_2s: Vec<f32> = (0..(sr as usize * 2))
            .map(|i| {
                let t = i as f32 / (sr as f32 * 2.0);
                (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sr as f32).sin() * t
            })
            .collect();
        let full_5s = make_sine(440.0, sr, 5.0);

        let mut samples = Vec::new();
        samples.extend_from_slice(&silence_1s);
        samples.extend_from_slice(&fade_in_2s);
        samples.extend_from_slice(&full_5s);

        let envelope = make_envelope(&samples, window);

        let silence_linear = 10f32.powf(SILENCE_THRESHOLD_DBFS / 20.0);
        let audio_start_idx = envelope.iter().position(|&e| e > silence_linear).unwrap_or(0);

        let mut sorted: Vec<f32> = envelope.iter().copied().filter(|&e| e > silence_linear).collect();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let median = sorted[sorted.len() / 2];
        let threshold = median * ENERGY_RATIO_THRESHOLD;

        let intro_ms = detect_intro(&envelope, audio_start_idx, threshold, rolling_windows, window_ms, duration_ms);

        // Intro should end somewhere around 1500-3500ms
        assert!(
            intro_ms >= 1000 && intro_ms <= 3500,
            "intro_end_ms={intro_ms}, expected 1000..3500"
        );
    }

    #[test]
    fn abrupt_ending_gives_short_outro() {
        let sr = 44100u32;
        let window = (sr as f32 * ENERGY_WINDOW_SECS) as usize;
        let window_ms = (ENERGY_WINDOW_SECS * 1000.0) as i64;
        let duration_ms = 5_000i64;
        let rolling_windows = (ROLLING_AVG_SECS / ENERGY_WINDOW_SECS) as usize;

        // 5s of constant-amplitude sine — no fade at all
        let samples = make_sine(440.0, sr, 5.0);
        let envelope = make_envelope(&samples, window);

        let silence_linear = 10f32.powf(SILENCE_THRESHOLD_DBFS / 20.0);
        let audio_end_idx = envelope.iter().rposition(|&e| e > silence_linear).unwrap_or(0);

        let mut sorted: Vec<f32> = envelope.iter().copied().filter(|&e| e > silence_linear).collect();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let median = sorted[sorted.len() / 2];
        let threshold = median * ENERGY_RATIO_THRESHOLD;

        let outro_ms = detect_outro(&envelope, audio_end_idx, threshold, rolling_windows, window_ms, duration_ms);

        // For an abrupt ending, outro_start should be very close to audio_end
        let audio_end_ms = (audio_end_idx + 1) as i64 * window_ms;
        assert!(
            (outro_ms - audio_end_ms).abs() < 500,
            "outro_start_ms={outro_ms}, audio_end_ms={audio_end_ms} — should be close for abrupt ending"
        );
    }

    #[test]
    fn pure_silence_returns_sane_values() {
        let sr = 44100u32;
        let window = (sr as f32 * ENERGY_WINDOW_SECS) as usize;
        let window_ms = (ENERGY_WINDOW_SECS * 1000.0) as i64;
        let duration_ms = 3_000i64;
        let rolling_windows = (ROLLING_AVG_SECS / ENERGY_WINDOW_SECS) as usize;

        let samples = vec![0.0f32; sr as usize * 3];
        let envelope = make_envelope(&samples, window);

        let silence_linear = 10f32.powf(SILENCE_THRESHOLD_DBFS / 20.0);
        let audio_start_idx = envelope.iter().position(|&e| e > silence_linear).unwrap_or(0);
        let audio_end_idx = envelope
            .iter()
            .rposition(|&e| e > silence_linear)
            .unwrap_or(0);

        let start_ms = audio_start_idx as i64 * window_ms;
        let end_ms = (audio_end_idx + 1) as i64 * window_ms;

        // Both should be 0 (nothing above silence)
        assert_eq!(start_ms, 0);
        // end should also be near 0 (first window end)
        assert!(end_ms <= window_ms);

        // Outro/intro should be sensible even for silent tracks
        let threshold = 0.001;
        let outro_ms = detect_outro(&envelope, audio_end_idx, threshold, rolling_windows, window_ms, duration_ms);
        let intro_ms = detect_intro(&envelope, audio_start_idx, threshold, rolling_windows, window_ms, duration_ms);
        // Just verify they don't panic and are within bounds
        assert!(outro_ms <= duration_ms);
        assert!(intro_ms <= duration_ms);
    }
}
