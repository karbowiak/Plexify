//! Audio resampler — converts between sample rates (e.g., 44100 → 48000).
//!
//! Simple linear interpolation resampler. Quality is good enough for playback
//! and avoids the complex `audioadapter` trait dependency of rubato 2.0.
//! Can be replaced with a higher-quality sinc resampler later if needed.

/// Resample an entire buffer of interleaved samples at once (batch mode).
///
/// Returns `None` if no resampling is needed (rates match).
pub fn resample_buffer(
    samples: &[f32],
    channels: u16,
    source_rate: u32,
    target_rate: u32,
) -> Option<Vec<f32>> {
    if source_rate == target_rate {
        return None;
    }

    let ch = channels as usize;
    if ch == 0 || samples.is_empty() {
        return None;
    }

    let total_in_frames = samples.len() / ch;
    let ratio = target_rate as f64 / source_rate as f64;
    let total_out_frames = (total_in_frames as f64 * ratio).ceil() as usize;

    let mut output = Vec::with_capacity(total_out_frames * ch);

    for out_frame in 0..total_out_frames {
        let in_pos = out_frame as f64 / ratio;
        let in_frame = in_pos.floor() as usize;
        let frac = (in_pos - in_frame as f64) as f32;

        let frame_a = in_frame.min(total_in_frames - 1);
        let frame_b = (in_frame + 1).min(total_in_frames - 1);

        for c in 0..ch {
            let a = samples[frame_a * ch + c];
            let b = samples[frame_b * ch + c];
            output.push(a + (b - a) * frac);
        }
    }

    Some(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_resampling_when_rates_match() {
        assert!(resample_buffer(&[0.0; 100], 2, 44100, 44100).is_none());
    }

    #[test]
    fn resample_44100_to_48000() {
        let n = 44100;
        let mut samples = Vec::with_capacity(n * 2);
        for i in 0..n {
            let t = i as f32 / 44100.0;
            let s = (2.0 * std::f32::consts::PI * 440.0 * t).sin();
            samples.push(s);
            samples.push(s);
        }

        let resampled = resample_buffer(&samples, 2, 44100, 48000).expect("should resample");
        let out_frames = resampled.len() / 2;
        let expected = 48000;
        assert!(
            (out_frames as i64 - expected as i64).unsigned_abs() < 10,
            "expected ~{} frames, got {}",
            expected,
            out_frames
        );
    }

    #[test]
    fn resample_preserves_dc() {
        // Constant signal should remain constant after resampling
        let samples = vec![0.5f32; 44100 * 2]; // 1 second stereo
        let resampled = resample_buffer(&samples, 2, 44100, 48000).unwrap();
        for &s in &resampled {
            assert!((s - 0.5).abs() < 0.01, "DC signal should be preserved, got {}", s);
        }
    }

    #[test]
    fn downsample_48000_to_44100() {
        let n = 48000;
        let mut samples = Vec::with_capacity(n * 2);
        for i in 0..n {
            let t = i as f32 / 48000.0;
            let s = (2.0 * std::f32::consts::PI * 440.0 * t).sin();
            samples.push(s);
            samples.push(s);
        }

        let resampled = resample_buffer(&samples, 2, 48000, 44100).expect("should resample");
        let out_frames = resampled.len() / 2;
        let expected = 44100;
        assert!(
            (out_frames as i64 - expected as i64).unsigned_abs() < 10,
            "expected ~{} frames, got {}",
            expected,
            out_frames
        );
    }
}
