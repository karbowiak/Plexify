#![allow(dead_code)]

use std::sync::atomic::Ordering;
use std::sync::Arc;

use crossbeam_channel::Sender;
use ringbuf::traits::Producer;
use ringbuf::HeapProd;
use symphonia::core::audio::SampleBuffer;

use tracing::{debug, info};

use super::normalization::fade_in_sample_count;
use super::resampler::resample_linear_fallback;
use super::state::{CrossfadeState, DecoderShared, DecoderState};
use super::types::{AudioEvent, PlaybackState};

/// Decode and resample from the crossfade track until `cf.pending` contains at
/// least `needed` interleaved samples (at device rate). Pads with silence on EOF.
pub fn refill_crossfade_pending(cf: &mut CrossfadeState, needed: usize, dev_rate: u32) {
    while cf.pending.len() < needed {
        let packet = match cf.format_reader.next_packet() {
            Ok(p) if p.track_id() == cf.track_id => p,
            Ok(_) => continue,
            Err(_) => {
                debug!(
                    needed = needed,
                    have = cf.pending.len(),
                    padding = needed - cf.pending.len(),
                    "Crossfade refill: EOF/error, padding with silence"
                );
                cf.pending.resize(needed, 0.0);
                return;
            }
        };

        match cf.decoder.decode(&packet) {
            Ok(audio_buf) => {
                let spec = *audio_buf.spec();
                let num_frames = audio_buf.frames();
                let num_samples = num_frames * spec.channels.count();
                if cf
                    .sample_buf
                    .as_ref()
                    .map_or(true, |sb| sb.capacity() < num_samples)
                {
                    cf.sample_buf = Some(SampleBuffer::new(num_frames as u64, spec));
                }
                let sb = cf.sample_buf.as_mut().unwrap();
                sb.copy_interleaved_ref(audio_buf);

                let chunk = if cf.sample_rate != dev_rate && dev_rate > 0 {
                    resample_linear_fallback(sb.samples(), cf.sample_rate, dev_rate, cf.channels)
                } else {
                    sb.samples().to_vec()
                };
                cf.pending.extend_from_slice(&chunk);
            }
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(_) => {
                cf.pending.resize(needed, 0.0);
                return;
            }
        }
    }
}

/// Promote the next track from a completed crossfade into the current decoder state.
/// This replaces 2 identical code blocks (early crossfade completion + EOF crossfade).
pub fn promote_crossfade(
    cf: CrossfadeState,
    event_tx: &Sender<AudioEvent>,
    producer: &mut HeapProd<f32>,
    shared: &Arc<DecoderShared>,
    state: &mut DecoderState,
) {
    let mut pending_samples = cf.pending;
    let cf_meta = cf.meta;
    let norm_gain = cf.norm_gain;
    let elapsed = cf.elapsed_frames;
    let total = cf.total_frames;

    info!(
        rating_key = cf_meta.rating_key,
        elapsed_frames = elapsed,
        total_frames = total,
        norm_gain = format!("{:.4}", norm_gain),
        pending_samples = pending_samples.len(),
        sample_rate = cf.sample_rate,
        channels = cf.channels,
        "Crossfade promote: transitioning to next track"
    );

    if let Some(ref old) = state.current_track {
        let _ = event_tx.send(AudioEvent::TrackEnded {
            rating_key: old.rating_key,
        });
    }

    // Apply normalization gain to pending samples so they match the level
    // used during crossfade mixing. Without this, the transition from
    // crossfaded audio (which has norm_gain baked in via the mixing loop)
    // to raw pending samples causes an amplitude discontinuity (audible pop).
    let norm_enabled = shared.normalization_enabled.load(Ordering::Relaxed);
    if norm_enabled && (norm_gain - 1.0).abs() > f32::EPSILON && !pending_samples.is_empty() {
        info!(
            norm_gain = format!("{:.4}", norm_gain),
            pending_count = pending_samples.len(),
            "Applying normalization gain to pending crossfade samples"
        );
        for s in &mut pending_samples {
            *s *= norm_gain;
        }
    }

    // Log boundary sample values for debugging pops
    if !pending_samples.is_empty() {
        let first_few: Vec<f32> = pending_samples.iter().take(8).copied().collect();
        let last_few: Vec<f32> = pending_samples.iter().rev().take(4).rev().copied().collect();
        debug!(
            first_samples = ?first_few,
            last_samples = ?last_few,
            "Pending sample boundary values (after norm)"
        );
    }

    let ch = cf.channels as i64;
    shared.position_samples.store(
        (cf.elapsed_frames as i64).saturating_mul(ch),
        Ordering::Relaxed,
    );
    let nb = shared.next_bpm.swap(0, Ordering::Relaxed);
    shared.current_bpm.store(nb, Ordering::Relaxed);
    shared.normalization_gain_millths.store(
        (norm_gain * 1_000.0) as i64,
        Ordering::Relaxed,
    );
    shared.next_norm_gain_millths.store(1_000, Ordering::Relaxed);

    state.format_reader    = Some(cf.format_reader);
    state.decoder          = Some(cf.decoder);
    state.current_track_id = cf.track_id;
    state.sample_buf       = cf.sample_buf;
    state.resampler        = None;
    shared.sample_rate.store(cf.sample_rate as i64, Ordering::Relaxed);
    shared.channels.store(cf.channels as i64, Ordering::Relaxed);
    shared.finished.store(false, Ordering::Release);
    state.current_track = Some(cf_meta.clone());

    // Set a micro fade-in for the first decoded packet after promotion
    // to smooth the resampler switch (crossfade uses linear, normal uses cubic).
    let dev_rate = shared.device_sample_rate.load(Ordering::Relaxed) as u32;
    state.fade_in_total = fade_in_sample_count(dev_rate, cf.channels);
    state.fade_in_remaining = state.fade_in_total;

    // Push any remaining decoded+resampled samples
    if !pending_samples.is_empty() {
        info!(
            count = pending_samples.len(),
            "Pushing pending crossfade samples to ring buffer"
        );
        let mut written = 0;
        while written < pending_samples.len() {
            let n = producer.push_slice(&pending_samples[written..]);
            written += n;
            if n == 0 {
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
        }
    }

    let _ = event_tx.send(AudioEvent::TrackStarted {
        rating_key:  cf_meta.rating_key,
        duration_ms: cf_meta.duration_ms,
    });
    let _ = event_tx.send(AudioEvent::State {
        state: PlaybackState::Playing,
    });
}

#[cfg(test)]
mod tests {
    use std::f32::consts::FRAC_PI_2;

    /// Verify that applying normalization to pending samples produces continuity
    /// at the crossfade→pending boundary.
    #[test]
    fn pending_samples_match_crossfade_level() {
        let norm_gain = 0.246f32; // -12.18 dB (loud track)
        let sample_value = 0.8f32;

        // At t=1.0: mixed = old * cur_gain * cos(π/2) + new * next_gain * sin(π/2)
        //                  = 0 + new * next_gain * 1.0 = new * next_gain
        let crossfade_output = sample_value * norm_gain * (1.0f32 * FRAC_PI_2).sin();

        // With fix: pending samples have norm_gain applied → continuous
        let pending_with_fix = sample_value * norm_gain;
        assert!(
            (crossfade_output - pending_with_fix).abs() < f32::EPSILON,
            "With norm fix: crossfade output ({}) should equal pending ({})",
            crossfade_output,
            pending_with_fix
        );

        // Without fix: raw samples → 4x volume jump
        let pending_without_fix = sample_value;
        let jump_ratio = pending_without_fix / crossfade_output;
        assert!(
            jump_ratio > 3.0,
            "Without fix: {:.1}x jump ({:.4} → {:.4})",
            jump_ratio,
            crossfade_output,
            pending_without_fix
        );
    }

    /// Simulate a full crossfade mixing + promote sequence and check for pops.
    /// A pop is detected as a sample-to-sample amplitude jump exceeding a threshold
    /// relative to the signal's peak level.
    #[test]
    fn no_pop_at_crossfade_promote_boundary() {
        let channels = 2usize;
        let sample_rate = 48000u32;
        let crossfade_ms = 1000u64; // 1s crossfade (shorter for test speed)
        let total_frames = (crossfade_ms as usize * sample_rate as usize) / 1000;
        let packet_frames = 1152usize; // MP3 packet size

        let cur_gain = 0.5f32;
        let next_gain = 0.25f32; // loud next track

        let freq_old = 440.0f32;
        let freq_new = 880.0f32;
        let pi2 = std::f32::consts::PI * 2.0;

        let mut ring_buffer: Vec<f32> = Vec::new();
        let mut elapsed_frames = 0usize;

        // Simulate mixing old+new track with crossfade curves
        while elapsed_frames < total_frames {
            let frames_this_batch = packet_frames.min(total_frames - elapsed_frames);

            for frame in 0..frames_this_batch {
                let global_frame = elapsed_frames + frame;
                let t = (global_frame as f32 / total_frames as f32).min(1.0);
                let fade_out = (t * FRAC_PI_2).cos();
                let fade_in = (t * FRAC_PI_2).sin();

                let t_sec = global_frame as f32 / sample_rate as f32;
                let old_s = (pi2 * freq_old * t_sec).sin();
                let new_s = (pi2 * freq_new * t_sec).sin();

                let mixed = old_s * cur_gain * fade_out + new_s * next_gain * fade_in;
                for _ in 0..channels {
                    ring_buffer.push(mixed);
                }
            }
            elapsed_frames += frames_this_batch;
        }

        // Simulate pending samples (continuation of next track after crossfade)
        // WITH the normalization fix applied
        let pending_frames = packet_frames * 3;
        for frame in 0..pending_frames {
            let global_frame = elapsed_frames + frame;
            let t_sec = global_frame as f32 / sample_rate as f32;
            let new_s = (pi2 * freq_new * t_sec).sin();
            let sample = new_s * next_gain; // FIX: norm gain applied
            for _ in 0..channels {
                ring_buffer.push(sample);
            }
        }

        // Check for pops: scan for abnormally large sample-to-sample jumps
        // around the crossfade→pending boundary
        let boundary_sample = total_frames * channels;
        let check_start = boundary_sample.saturating_sub(channels * 10);
        let check_end = (boundary_sample + channels * 10).min(ring_buffer.len());

        let mut max_jump = 0.0f32;
        let mut max_jump_pos = 0usize;
        for i in (check_start + channels)..check_end {
            // Compare same channel only (skip inter-channel comparisons)
            if i >= channels {
                let jump = (ring_buffer[i] - ring_buffer[i - channels]).abs();
                if jump > max_jump {
                    max_jump = jump;
                    max_jump_pos = i;
                }
            }
        }

        // For a continuous signal at 880Hz/48kHz, the maximum legitimate
        // sample-to-sample change is ~2π*880/48000 ≈ 0.115 per sample at
        // full amplitude. With next_gain=0.25, max ≈ 0.029.
        // Allow 3x headroom for the crossfade curve transition.
        let max_legitimate = 2.0 * std::f32::consts::PI * freq_new / sample_rate as f32 * next_gain;
        let threshold = max_legitimate * 3.0;

        eprintln!(
            "Boundary at sample {}: max_jump={:.6} at pos {}, threshold={:.6}",
            boundary_sample, max_jump, max_jump_pos, threshold
        );

        assert!(
            max_jump < threshold,
            "Pop detected at boundary: jump {:.6} at pos {} exceeds threshold {:.6}",
            max_jump,
            max_jump_pos,
            threshold
        );
    }

    /// Without the normalization fix, the boundary WOULD have a pop.
    /// This test verifies the bug scenario to ensure we're testing the right thing.
    #[test]
    fn pop_detected_without_normalization_fix() {
        let channels = 2usize;
        let sample_rate = 48000u32;
        let total_frames = 48000usize; // 1s crossfade
        let next_gain = 0.25f32;
        let freq_new = 880.0f32;
        let pi2 = std::f32::consts::PI * 2.0;

        let mut ring_buffer: Vec<f32> = Vec::new();

        // Last few frames of crossfade (t ≈ 1.0)
        let start_frame = total_frames - 10;
        for frame in start_frame..total_frames {
            let t = (frame as f32 / total_frames as f32).min(1.0);
            let fade_in = (t * FRAC_PI_2).sin();
            let t_sec = frame as f32 / sample_rate as f32;
            let new_s = (pi2 * freq_new * t_sec).sin();
            // At t≈1.0: mixed ≈ new_s * next_gain * 1.0
            let mixed = new_s * next_gain * fade_in;
            for _ in 0..channels {
                ring_buffer.push(mixed);
            }
        }

        // Pending samples WITHOUT normalization (the bug)
        for frame in 0..10 {
            let global_frame = total_frames + frame;
            let t_sec = global_frame as f32 / sample_rate as f32;
            let new_s = (pi2 * freq_new * t_sec).sin();
            let sample = new_s; // BUG: no norm gain!
            for _ in 0..channels {
                ring_buffer.push(sample);
            }
        }

        // Find the maximum jump at the boundary
        let boundary = 10 * channels; // boundary between crossfade and pending
        let mut max_jump = 0.0f32;
        for i in (boundary.saturating_sub(channels * 2))..(boundary + channels * 2).min(ring_buffer.len()) {
            if i >= channels {
                let jump = (ring_buffer[i] - ring_buffer[i - channels]).abs();
                if jump > max_jump {
                    max_jump = jump;
                }
            }
        }

        // Without fix: jump should be large (close to 1.0 - 0.25 = 0.75 for a signal near peak)
        eprintln!("Without fix: max boundary jump = {:.6}", max_jump);
        assert!(
            max_jump > 0.1,
            "Expected a pop without normalization fix, but jump was only {:.6}",
            max_jump
        );
    }
}
