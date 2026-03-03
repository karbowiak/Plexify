#![allow(dead_code)]

use std::fs::File;
use std::sync::Arc;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{CodecType, CODEC_TYPE_OPUS};
use symphonia::core::formats::FormatReader;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::{StandardTagKey, Value};
use tracing::warn;

use super::cache::{audio_cache_key, probe_audio};
use super::state::DecoderShared;
use super::types::TrackMeta;

/// Target RMS level in dBFS for fallback normalization. -15 dBFS RMS
/// accounts for the ~3 dB RMS-to-LUFS offset for typical music, bringing
/// Opus tracks (which use this fallback) in line with Plex-normalized
/// tracks (~-14 LUFS). Peak safety clamp prevents clipping.
pub const FALLBACK_TARGET_DBFS: f32 = -15.0;

/// Fade-in duration in milliseconds applied at every Play command to prevent
/// audible pops from the silence → audio waveform discontinuity after a flush.
pub const FADE_IN_MS: u32 = 5;

/// Calculate the number of interleaved samples for the fade-in ramp.
pub fn fade_in_sample_count(device_rate: u32, channels: u32) -> usize {
    (FADE_IN_MS as usize * device_rate as usize * channels.max(1) as usize) / 1000
}

/// Parse a ReplayGain gain string like "-3.14 dB" or "+1.20 dB" → linear gain.
pub fn parse_rg_gain(s: &str) -> Option<f32> {
    let db: f32 = s.trim().trim_end_matches("dB").trim().parse().ok()?;
    Some(10f32.powf(db / 20.0).clamp(0.1, 4.0))
}

/// Extract REPLAYGAIN_TRACK_GAIN from the format reader's embedded metadata.
/// Returns a linear gain factor (1.0 = no change) if the tag is absent or unparseable.
pub fn try_extract_replaygain(fmt: &mut Box<dyn FormatReader>) -> f32 {
    let meta = fmt.metadata();
    let Some(rev) = meta.current() else { return 1.0 };

    for tag in rev.tags() {
        let is_rg = matches!(tag.std_key, Some(StandardTagKey::ReplayGainTrackGain))
            || tag.key.eq_ignore_ascii_case("REPLAYGAIN_TRACK_GAIN");

        if is_rg {
            if let Value::String(ref s) = tag.value {
                if let Some(g) = parse_rg_gain(s) {
                    return g;
                }
            }
        }
    }

    1.0
}

/// Compute a fallback normalization gain by scanning the first ~15 seconds of
/// a cached audio file. Returns a linear gain clamped to [0.1, 4.0].
pub fn compute_fallback_loudness(url: &str, shared: &Arc<DecoderShared>) -> f32 {
    let Some(ref cache_dir) = shared.cache_dir else {
        warn!("Fallback loudness: no cache dir available");
        return 1.0;
    };
    let cache_path = cache_dir.join(audio_cache_key(url));
    if !cache_path.exists() {
        warn!(url = %url, "Fallback loudness: cache file not found");
        return 1.0;
    }

    let file = match File::open(&cache_path) {
        Ok(f) => f,
        Err(e) => {
            warn!(error = %e, "Fallback loudness: failed to open cache file");
            return 1.0;
        }
    };

    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let (mut fmt, mut dec, tid, sr, _ch, _codec) = match probe_audio(mss, url) {
        Ok(t) => t,
        Err(e) => {
            warn!(error = %e, "Fallback loudness: failed to probe audio");
            return 1.0;
        }
    };

    let max_samples = sr as usize * 15; // 15 seconds worth of frames
    let mut sum_sq: f64 = 0.0;
    let mut peak: f32 = 0.0;
    let mut total_samples: usize = 0;
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
                for &sample in s.samples() {
                    let abs = sample.abs();
                    sum_sq += (sample as f64) * (sample as f64);
                    if abs > peak {
                        peak = abs;
                    }
                    total_samples += 1;
                }
                if total_samples >= max_samples {
                    break;
                }
            }
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(_) => break,
        }
    }

    if total_samples < 4410 {
        warn!(
            total_samples = total_samples,
            "Fallback loudness: too few samples, using unity gain"
        );
        return 1.0;
    }

    let rms = (sum_sq / total_samples as f64).sqrt() as f32;
    if rms < 1e-10 {
        warn!("Fallback loudness: track is near-silent, using unity gain");
        return 1.0;
    }

    let rms_dbfs = 20.0 * rms.log10();
    let mut gain_db = FALLBACK_TARGET_DBFS - rms_dbfs;

    // Peak safety: don't push peaks above -1 dBFS
    if peak > 1e-10 {
        let peak_after_db = 20.0 * peak.log10() + gain_db;
        let headroom_db = -1.0;
        if peak_after_db > headroom_db {
            gain_db -= peak_after_db - headroom_db;
        }
    }

    let linear = 10f32.powf(gain_db / 20.0).clamp(0.1, 4.0);
    warn!(
        rms_dbfs = format!("{:.1}", rms_dbfs),
        gain_db = format!("{:.2}", gain_db),
        linear_gain = format!("{:.3}", linear),
        peak = format!("{:.4}", peak),
        samples_scanned = total_samples,
        "Fallback loudness normalization computed"
    );

    linear
}

/// Resolve the normalization gain for a track. Priority:
/// 1. Plex API `gain_db` (server-side loudness analysis) — skipped for Opus
/// 2. Embedded ReplayGain tags in file metadata
/// 3. RMS-based loudness pre-scan of first 15 seconds
pub fn resolve_normalization_gain(
    meta: &TrackMeta,
    fmt: &mut Box<dyn FormatReader>,
    shared: &Arc<DecoderShared>,
    codec: CodecType,
) -> f32 {
    if let Some(db) = meta.gain_db {
        if codec == CODEC_TYPE_OPUS {
            warn!(
                rating_key = meta.rating_key,
                gain_db = db,
                "Normalization: skipping Plex API gain for Opus (libopus applies header output gain)"
            );
        } else {
            let gain = 10f32.powf(db / 20.0).clamp(0.1, 4.0);
            warn!(
                rating_key = meta.rating_key,
                gain_db = db,
                linear = format!("{:.3}", gain),
                "Normalization: using Plex API gain"
            );
            return gain;
        }
    }

    let rg = try_extract_replaygain(fmt);
    if (rg - 1.0).abs() > f32::EPSILON {
        warn!(
            rating_key = meta.rating_key,
            linear = format!("{:.3}", rg),
            "Normalization: using embedded ReplayGain tag"
        );
        return rg;
    }

    warn!(
        rating_key = meta.rating_key,
        "Normalization: no Plex gain or ReplayGain tag, running fallback RMS scan"
    );
    compute_fallback_loudness(&meta.url, shared)
}
