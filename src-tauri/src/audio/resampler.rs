#![allow(dead_code)]

use rubato::{FastFixedIn, PolynomialDegree, Resampler};
use tracing::warn;

/// Persistent polynomial resampler keyed by (in_rate, out_rate, channels).
/// Stored in DecoderState so it persists across packets for the same track.
pub struct SincResampler {
    inner: FastFixedIn<f32>,
    in_rate: u32,
    out_rate: u32,
    channels: usize,
    /// Interleaved leftover samples from the previous call that didn't fill a
    /// complete chunk. Carried over so we never zero-pad partial chunks (which
    /// corrupts the sinc filter state and causes crackling/stuttering).
    pending_input: Vec<f32>,
}

impl SincResampler {
    /// Create a new polynomial resampler for the given rate pair and channel count.
    pub fn new(in_rate: u32, out_rate: u32, channels: u32) -> Option<Self> {
        let ch = channels as usize;
        if ch == 0 || in_rate == 0 || out_rate == 0 || in_rate == out_rate {
            return None;
        }

        let ratio = out_rate as f64 / in_rate as f64;
        let chunk_size = 64;

        match FastFixedIn::new(ratio, 2.0, PolynomialDegree::Cubic, chunk_size, ch) {
            Ok(resampler) => Some(Self {
                inner: resampler,
                in_rate,
                out_rate,
                channels: ch,
                pending_input: Vec::new(),
            }),
            Err(e) => {
                warn!(error = %e, "Failed to create polynomial resampler, will use linear fallback");
                None
            }
        }
    }

    /// Check if this resampler matches the given parameters.
    pub fn matches(&self, in_rate: u32, out_rate: u32, channels: u32) -> bool {
        self.in_rate == in_rate && self.out_rate == out_rate && self.channels == channels as usize
    }

    /// Resample interleaved f32 audio. Returns interleaved output.
    ///
    /// Partial chunks (< chunk_size frames) are buffered in `pending_input` and
    /// carried over to the next call instead of being zero-padded. This prevents
    /// silence injection into the sinc filter state that causes crackling (OPUS)
    /// and stuttering (MP3).
    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        let ch = self.channels;

        // Combine leftover from previous call with new input
        let combined = if self.pending_input.is_empty() {
            input.to_vec()
        } else {
            let mut buf = std::mem::take(&mut self.pending_input);
            buf.extend_from_slice(input);
            buf
        };

        let total_frames = combined.len() / ch;
        if total_frames == 0 {
            return Vec::new();
        }

        let chunk_size = self.inner.input_frames_next();
        let full_chunks = total_frames / chunk_size;
        let leftover_frames = total_frames % chunk_size;

        // Save leftover frames for next call — never zero-pad
        if leftover_frames > 0 {
            let leftover_start = (total_frames - leftover_frames) * ch;
            self.pending_input = combined[leftover_start..].to_vec();
        }

        if full_chunks == 0 {
            return Vec::new();
        }

        // Deinterleave only the full-chunk portion into planar format
        let process_frames = full_chunks * chunk_size;
        let mut planar_in: Vec<Vec<f32>> = vec![Vec::with_capacity(process_frames); ch];
        for frame in 0..process_frames {
            for c in 0..ch {
                planar_in[c].push(combined[frame * ch + c]);
            }
        }

        // Process full chunks only
        let mut all_output: Vec<Vec<f32>> = vec![Vec::new(); ch];
        let mut offset = 0;

        for _ in 0..full_chunks {
            let chunk_planar: Vec<Vec<f32>> = (0..ch)
                .map(|c| planar_in[c][offset..offset + chunk_size].to_vec())
                .collect();

            match self.inner.process(&chunk_planar, None) {
                Ok(output) => {
                    for c in 0..ch {
                        all_output[c].extend_from_slice(&output[c]);
                    }
                }
                Err(e) => {
                    warn!(error = %e, "Sinc resample error, falling back to linear");
                    return resample_linear_fallback(input, self.in_rate, self.out_rate, ch as u32);
                }
            }

            offset += chunk_size;
        }

        // Reinterleave
        let out_frames = all_output[0].len();
        let mut interleaved = Vec::with_capacity(out_frames * ch);
        for f in 0..out_frames {
            for c in 0..ch {
                interleaved.push(all_output[c][f]);
            }
        }
        interleaved
    }

    /// Reset the resampler state (e.g. after seek).
    pub fn reset(&mut self) {
        self.inner.reset();
        self.pending_input.clear();
    }
}

/// Resample using the persistent sinc resampler if available, otherwise linear fallback.
/// The `resampler` slot is created/reused based on rate pair matching.
pub fn resample(
    input: &[f32],
    in_rate: u32,
    out_rate: u32,
    channels: u32,
    resampler: &mut Option<SincResampler>,
) -> Vec<f32> {
    if in_rate == out_rate || input.is_empty() || channels == 0 {
        return input.to_vec();
    }

    // Create or reuse the sinc resampler
    let needs_new = resampler
        .as_ref()
        .map_or(true, |r| !r.matches(in_rate, out_rate, channels));

    if needs_new {
        *resampler = SincResampler::new(in_rate, out_rate, channels);
    }

    if let Some(ref mut r) = resampler {
        r.process(input)
    } else {
        resample_linear_fallback(input, in_rate, out_rate, channels)
    }
}

/// Linear interpolation resampler — kept as fallback if rubato fails.
pub fn resample_linear_fallback(input: &[f32], in_rate: u32, out_rate: u32, channels: u32) -> Vec<f32> {
    if in_rate == out_rate || input.is_empty() || channels == 0 {
        return input.to_vec();
    }

    let ch = channels as usize;
    let in_frames = input.len() / ch;
    let ratio = in_rate as f64 / out_rate as f64;
    let out_frames = ((in_frames as f64) / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(out_frames * ch);

    for i in 0..out_frames {
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos.floor() as usize;
        let frac = (src_pos - src_idx as f64) as f32;

        for c in 0..ch {
            let s0 = input.get(src_idx * ch + c).copied().unwrap_or(0.0);
            let s1 = input
                .get((src_idx + 1) * ch + c)
                .copied()
                .unwrap_or(s0);
            output.push(s0 + (s1 - s0) * frac);
        }
    }

    output
}

/// Convert interleaved audio between different channel counts.
#[allow(dead_code)]
pub fn remix_channels(input: &[f32], src_ch: u32, dst_ch: u32) -> Vec<f32> {
    if src_ch == dst_ch || src_ch == 0 || dst_ch == 0 || input.is_empty() {
        return input.to_vec();
    }

    let src = src_ch as usize;
    let dst = dst_ch as usize;
    let frames = input.len() / src;
    let mut output = Vec::with_capacity(frames * dst);

    for f in 0..frames {
        let frame_start = f * src;
        if src == 1 && dst == 2 {
            let s = input[frame_start];
            output.push(s);
            output.push(s);
        } else if src == 2 && dst == 1 {
            let l = input[frame_start];
            let r = input[frame_start + 1];
            output.push((l + r) * 0.5);
        } else if dst > src {
            for c in 0..dst {
                let sc = if c < src { c } else { src - 1 };
                output.push(input[frame_start + sc]);
            }
        } else {
            for c in 0..dst {
                output.push(input[frame_start + c]);
            }
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    /// Generate an interleaved sine wave at `freq_hz` sampled at `sample_rate`.
    fn generate_sine(freq_hz: f32, sample_rate: u32, num_frames: usize, channels: usize) -> Vec<f32> {
        let mut samples = Vec::with_capacity(num_frames * channels);
        for i in 0..num_frames {
            let t = i as f32 / sample_rate as f32;
            let val = (2.0 * PI * freq_hz * t).sin();
            for _ in 0..channels {
                samples.push(val);
            }
        }
        samples
    }

    /// Fit a sine at `freq_hz` to `output` (channel 0) and return SNR in dB.
    /// Skips initial frames to avoid resampler startup transient.
    fn compute_snr_db(output: &[f32], freq_hz: f32, sample_rate: u32, channels: usize) -> f64 {
        let skip_frames = 512;
        let skip_samples = skip_frames * channels;
        if output.len() <= skip_samples + channels {
            return 0.0;
        }
        let output = &output[skip_samples..];
        let num_frames = output.len() / channels;

        // Project onto sin(ωt) and cos(ωt) to find amplitude & phase
        let omega = 2.0 * std::f64::consts::PI * freq_hz as f64;
        let mut sum_sin = 0.0f64;
        let mut sum_cos = 0.0f64;
        for i in 0..num_frames {
            let val = output[i * channels] as f64;
            let t = i as f64 / sample_rate as f64;
            sum_sin += val * (omega * t).sin();
            sum_cos += val * (omega * t).cos();
        }
        let a = 2.0 * sum_sin / num_frames as f64;
        let b = 2.0 * sum_cos / num_frames as f64;

        // Compute signal power (fitted sine) and noise power (residual)
        let mut signal_power = 0.0f64;
        let mut noise_power = 0.0f64;
        for i in 0..num_frames {
            let val = output[i * channels] as f64;
            let t = i as f64 / sample_rate as f64;
            let fitted = a * (omega * t).sin() + b * (omega * t).cos();
            signal_power += fitted * fitted;
            noise_power += (val - fitted) * (val - fitted);
        }

        if noise_power < 1e-20 {
            return 120.0;
        }
        10.0 * (signal_power / noise_power).log10()
    }

    /// Resample a sine wave in MP3-sized chunks and check SNR is high (no artifacts).
    #[test]
    fn resample_44100_to_48000_snr() {
        let in_rate = 44100u32;
        let out_rate = 48000u32;
        let freq = 440.0f32;
        let channels = 2usize;
        let num_frames = (in_rate as f32 * 5.0) as usize; // 5 seconds

        let input = generate_sine(freq, in_rate, num_frames, channels);

        let mut resampler = SincResampler::new(in_rate, out_rate, channels as u32)
            .expect("Should create resampler for 44100→48000");

        // Process in MP3-sized chunks (1152 frames)
        let mut output = Vec::new();
        for chunk in input.chunks(1152 * channels) {
            output.extend_from_slice(&resampler.process(chunk));
        }

        let snr = compute_snr_db(&output, freq, out_rate, channels);
        eprintln!("440Hz sine 44100→48000 (MP3 chunks): SNR = {:.1} dB", snr);

        // Cubic polynomial should easily exceed 40 dB
        assert!(snr > 40.0, "SNR {:.1} dB too low — resampler artifacts detected", snr);
    }

    /// Sliding-window RMS check: no window should drop below 50% of median (6 dB).
    /// A stuttering resampler produces periodic amplitude dips.
    #[test]
    fn no_amplitude_dropouts() {
        let in_rate = 44100u32;
        let out_rate = 48000u32;
        let freq = 440.0f32;
        let channels = 2usize;
        let num_frames = 44100 * 3; // 3 seconds

        let input = generate_sine(freq, in_rate, num_frames, channels);

        let mut resampler = SincResampler::new(in_rate, out_rate, channels as u32).unwrap();
        let mut output = Vec::new();
        for chunk in input.chunks(1152 * channels) {
            output.extend_from_slice(&resampler.process(chunk));
        }

        // Sliding window RMS (256 frames per window, skip startup)
        let window_frames = 256;
        let window_samples = window_frames * channels;
        let skip = 512 * channels;

        let mut rms_values: Vec<f64> = Vec::new();
        let mut pos = skip;
        while pos + window_samples <= output.len() {
            let window = &output[pos..pos + window_samples];
            let rms = (window.iter().map(|s| (*s as f64).powi(2)).sum::<f64>()
                / window.len() as f64)
                .sqrt();
            rms_values.push(rms);
            pos += window_samples;
        }

        assert!(!rms_values.is_empty(), "No RMS windows computed");

        let mut sorted = rms_values.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median = sorted[sorted.len() / 2];
        let min_rms = sorted[0];
        let max_rms = sorted[sorted.len() - 1];

        eprintln!("RMS: min={:.4}, median={:.4}, max={:.4}, ratio={:.2}",
            min_rms, median, max_rms, min_rms / median);

        let threshold = median * 0.5;
        for (i, &rms) in rms_values.iter().enumerate() {
            assert!(
                rms > threshold,
                "Window {} RMS {:.4} < threshold {:.4} (median {:.4}) — amplitude dropout",
                i, rms, threshold, median
            );
        }
    }

    /// Different chunk sizes should produce consistent output (no chunk-boundary glitches).
    #[test]
    fn chunk_size_consistency() {
        let in_rate = 44100u32;
        let out_rate = 48000u32;
        let channels = 2usize;
        let freq = 1000.0f32;
        let num_frames = 44100; // 1 second

        let input = generate_sine(freq, in_rate, num_frames, channels);

        // Small chunks (MP3: 1152 frames)
        let mut r_small = SincResampler::new(in_rate, out_rate, channels as u32).unwrap();
        let mut out_small = Vec::new();
        for chunk in input.chunks(1152 * channels) {
            out_small.extend_from_slice(&r_small.process(chunk));
        }

        // Large chunks (4x MP3: 4608 frames)
        let mut r_large = SincResampler::new(in_rate, out_rate, channels as u32).unwrap();
        let mut out_large = Vec::new();
        for chunk in input.chunks(4608 * channels) {
            out_large.extend_from_slice(&r_large.process(chunk));
        }

        // Both should have similar SNR for the same signal
        let snr_small = compute_snr_db(&out_small, freq, out_rate, channels);
        let snr_large = compute_snr_db(&out_large, freq, out_rate, channels);

        eprintln!("1000Hz SNR: small_chunks={:.1} dB, large_chunks={:.1} dB", snr_small, snr_large);

        assert!(snr_small > 40.0, "Small-chunk SNR {:.1} dB too low", snr_small);
        assert!(snr_large > 40.0, "Large-chunk SNR {:.1} dB too low", snr_large);

        // SNR difference should be small (within 10 dB)
        let diff = (snr_small - snr_large).abs();
        assert!(diff < 10.0, "SNR differs by {:.1} dB between chunk sizes", diff);
    }

    /// Test multiple frequencies to catch frequency-dependent artifacts.
    /// Cubic polynomial has lower precision at high frequencies — thresholds
    /// are frequency-aware. Music-critical range (≤4kHz) must be >50 dB;
    /// high frequencies (>4kHz) must be >25 dB.
    #[test]
    fn multi_frequency_quality() {
        let in_rate = 44100u32;
        let out_rate = 48000u32;
        let channels = 2usize;
        let test_freqs: [(f32, f64); 5] = [
            (100.0, 50.0),
            (440.0, 50.0),
            (1000.0, 50.0),
            (4000.0, 50.0),
            (10000.0, 25.0), // cubic roll-off at high freq is expected
        ];

        for &(freq, min_snr) in &test_freqs {
            let num_frames = 44100 * 2; // 2 seconds
            let input = generate_sine(freq, in_rate, num_frames, channels);

            let mut resampler = SincResampler::new(in_rate, out_rate, channels as u32).unwrap();
            let mut output = Vec::new();
            for chunk in input.chunks(1152 * channels) {
                output.extend_from_slice(&resampler.process(chunk));
            }

            let snr = compute_snr_db(&output, freq, out_rate, channels);
            eprintln!("{:.0}Hz: SNR = {:.1} dB (min: {:.0} dB)", freq, snr, min_snr);

            assert!(
                snr > min_snr,
                "{:.0}Hz SNR {:.1} dB < {:.0} dB — resampler artifacts at this frequency",
                freq, snr, min_snr
            );
        }
    }

    /// After reset() (simulating seek), output should still be clean.
    #[test]
    fn clean_after_reset() {
        let in_rate = 44100u32;
        let out_rate = 48000u32;
        let freq = 440.0f32;
        let channels = 2usize;
        let num_frames = 44100; // 1 second

        let input = generate_sine(freq, in_rate, num_frames, channels);

        let mut resampler = SincResampler::new(in_rate, out_rate, channels as u32).unwrap();

        // Process some audio, then reset (simulates seek)
        for chunk in input.chunks(1152 * channels).take(10) {
            let _ = resampler.process(chunk);
        }
        resampler.reset();

        // Process a fresh signal after reset
        let mut output = Vec::new();
        for chunk in input.chunks(1152 * channels) {
            output.extend_from_slice(&resampler.process(chunk));
        }

        let snr = compute_snr_db(&output, freq, out_rate, channels);
        eprintln!("After reset: SNR = {:.1} dB", snr);

        assert!(snr > 40.0, "Post-reset SNR {:.1} dB too low — state corruption", snr);
    }
}
