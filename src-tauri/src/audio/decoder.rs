#![allow(dead_code)]

use std::f32::consts::FRAC_PI_2;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use crossbeam_channel::{Receiver, Sender};
use ringbuf::traits::{Observer, Producer};
use ringbuf::HeapProd;
use symphonia::core::audio::SampleBuffer;
use tracing::{debug, error, info, warn};

use super::analyzer;
use super::cache::{audio_cache_key, corrected_duration, open_for_decode, probe_audio};
use super::commands::handle_command;
use super::crossfade::{promote_crossfade, refill_crossfade_pending};
use super::normalization::resolve_normalization_gain;
use super::resampler::{remix_channels, resample};
use super::eq::{BiquadCoeffs, BiquadState};
use super::state::{CrossfadeState, DecoderShared, DecoderState, EchoDelayBuffer};
use super::types::{AudioCommand, AudioEvent, CrossfadeStyle, PlaybackState};

/// Computed crossfade parameters from smart analysis.
struct SmartCrossfadeParams {
    /// When to start the crossfade (ms from track start)
    crossfade_start_ms: i64,
    /// How long the crossfade lasts (ms)
    crossfade_duration_ms: i64,
    /// How far to seek into the next track to skip leading silence (ms)
    next_intro_skip_ms: i64,
}

/// Compute adaptive crossfade parameters using track analysis.
/// Returns None if smart crossfade is disabled or analysis isn't available.
fn compute_smart_crossfade(
    shared: &DecoderShared,
    current_rating_key: i64,
    next_rating_key: i64,
    duration_ms: i64,
    user_max_ms: i64,
) -> Option<SmartCrossfadeParams> {
    if !shared.smart_crossfade_enabled.load(Ordering::Relaxed) {
        return None;
    }

    let current_analysis = analyzer::get_analysis(current_rating_key)?;

    // Sanity check: if analysis says audio ends before half the track's known
    // duration, the analysis is likely from a partial decode (e.g. codec issue).
    // Fall back to fixed-window crossfade rather than using bad data.
    if current_analysis.audio_end_ms < duration_ms / 2 {
        warn!(
            rating_key = current_rating_key,
            audio_end_ms = current_analysis.audio_end_ms,
            duration_ms = duration_ms,
            "Smart crossfade: analysis audio_end_ms < 50% of duration — ignoring bad analysis"
        );
        return None;
    }

    // 1. Determine the effective end of audio (skip trailing silence)
    let audio_end = current_analysis.audio_end_ms.min(duration_ms);

    // 2. Determine outro length
    let outro_length = (audio_end - current_analysis.outro_start_ms).max(0);

    // 3. Check next track's intro length if available
    let next_analysis = analyzer::get_analysis(next_rating_key);
    let intro_length = next_analysis
        .as_ref()
        .map(|a| (a.intro_end_ms - a.audio_start_ms).max(0))
        .unwrap_or(0);

    // 4. Compute adaptive duration:
    //    - Use the shorter of outro and intro (if both available)
    //    - Clamp to [2000ms, user_max_ms]
    //    - If no clear outro/intro detected (very short), use 75% of user_max
    let adaptive_ms = if outro_length > 500 || intro_length > 500 {
        let candidates = [outro_length, intro_length]
            .iter()
            .copied()
            .filter(|&v| v > 0)
            .min()
            .unwrap_or(user_max_ms);
        candidates.clamp(2000, user_max_ms)
    } else {
        // No clear outro/intro — use 75% of user max for a generous blend
        (user_max_ms * 3 / 4).clamp(2000, user_max_ms)
    };

    // 5. Very short track protection: crossfade never exceeds half the track
    let max_half = duration_ms / 2;
    let final_duration = adaptive_ms.min(max_half).max(2000);
    let final_start = (audio_end - final_duration).max(0);

    // 7. Next track intro skip (skip leading silence > 50ms)
    let next_intro_skip = next_analysis
        .as_ref()
        .map(|a| if a.audio_start_ms > 50 { a.audio_start_ms } else { 0 })
        .unwrap_or(0);

    info!(
        current_key = current_rating_key,
        audio_end = audio_end,
        outro_start = current_analysis.outro_start_ms,
        outro_length = outro_length,
        intro_length = intro_length,
        adaptive_ms = adaptive_ms,
        final_duration = final_duration,
        final_start = final_start,
        next_intro_skip = next_intro_skip,
        "Smart crossfade computed"
    );

    Some(SmartCrossfadeParams {
        crossfade_start_ms: final_start,
        crossfade_duration_ms: final_duration,
        next_intro_skip_ms: next_intro_skip,
    })
}

/// The main decoder thread loop
pub fn decoder_thread(
    cmd_rx: Receiver<AudioCommand>,
    event_tx: Sender<AudioEvent>,
    mut producer: HeapProd<f32>,
    shared: Arc<DecoderShared>,
) {
    info!("Decoder thread started");

    let mut state = DecoderState::new();

    loop {
        // If paused or no track, block on command channel
        if shared.paused.load(Ordering::Acquire) || state.format_reader.is_none() {
            match cmd_rx.recv() {
                Ok(cmd) => {
                    if handle_command(
                        cmd,
                        &cmd_rx,
                        &event_tx,
                        &mut producer,
                        &shared,
                        &mut state,
                    ) {
                        return;
                    }
                }
                Err(_) => {
                    info!("Command channel closed, decoder thread exiting");
                    return;
                }
            }
            continue;
        }

        // Check for commands (non-blocking)
        while let Ok(cmd) = cmd_rx.try_recv() {
            if handle_command(
                cmd,
                &cmd_rx,
                &event_tx,
                &mut producer,
                &shared,
                &mut state,
            ) {
                return;
            }
        }

        // Early crossfade completion: if the fade window has fully elapsed, promote the next
        // track now rather than waiting for the old HTTP stream to send EOF.
        if state.crossfade.as_ref().map_or(false, |cf| cf.elapsed_frames >= cf.total_frames) {
            if let Some(cf) = state.crossfade.take() {
                info!(
                    rating_key = cf.meta.rating_key,
                    "Crossfade window elapsed — promoting next track without waiting for EOF"
                );
                promote_crossfade(cf, &event_tx, &mut producer, &shared, &mut state);
            }
            continue;
        }

        // Decode next packet
        if let (Some(ref mut fmt), Some(ref mut dec)) = (&mut state.format_reader, &mut state.decoder) {
            match fmt.next_packet() {
                Ok(packet) => {
                    if packet.track_id() != state.current_track_id {
                        continue;
                    }

                    match dec.decode(&packet) {
                        Ok(audio_buf) => {
                            let spec = *audio_buf.spec();
                            let num_frames = audio_buf.frames();
                            let num_samples = num_frames * spec.channels.count();

                            // First-packet diagnostic: log once per track when sample_buf is unset
                            let is_first_packet = state.sample_buf.is_none();

                            if state.sample_buf
                                .as_ref()
                                .map_or(true, |sb| sb.capacity() < num_samples)
                            {
                                state.sample_buf = Some(SampleBuffer::new(num_frames as u64, spec));
                            }

                            let sb = state.sample_buf.as_mut().unwrap();
                            sb.copy_interleaved_ref(audio_buf);

                            let raw_samples: Vec<f32> = sb.samples().to_vec();
                            let raw_sample_count = raw_samples.len();

                            // Resample if source rate differs from output device rate
                            let src_rate =
                                shared.sample_rate.load(Ordering::Relaxed) as u32;
                            let dev_rate =
                                shared.device_sample_rate.load(Ordering::Relaxed) as u32;
                            let ch_val = shared.channels.load(Ordering::Relaxed) as u32;

                            if is_first_packet {
                                let resampling = src_rate != dev_rate && dev_rate > 0;
                                info!(
                                    decoded_rate = spec.rate,
                                    decoded_channels = spec.channels.count(),
                                    shared_rate = src_rate,
                                    shared_channels = ch_val,
                                    device_rate = dev_rate,
                                    frames = num_frames,
                                    resampling,
                                    "First packet decoded for track"
                                );
                            }

                            let resampled = if src_rate != dev_rate && dev_rate > 0 {
                                resample(&raw_samples, src_rate, dev_rate, ch_val, &mut state.resampler)
                            } else {
                                raw_samples
                            };

                            // ===============================================
                            // CROSSFADE TRIGGER
                            // ===============================================
                            let cfade_ms = shared
                                .crossfade_window_ms
                                .load(Ordering::Relaxed) as i64;

                            let same_album = state.current_track.as_ref()
                                .zip(state.next_meta.as_ref())
                                .map(|(c, n)| !c.parent_key.is_empty() && c.parent_key == n.parent_key)
                                .unwrap_or(false);
                            let suppress_xfade = (same_album
                                && !shared.same_album_crossfade.load(Ordering::Relaxed))
                                || state.current_track.as_ref().map_or(false, |m| m.skip_crossfade)
                                || state.next_meta.as_ref().map_or(false, |m| m.skip_crossfade);

                            if cfade_ms > 0 && !suppress_xfade && state.crossfade.is_none() && state.next_meta.is_some() {
                                let duration_ms = state.current_track
                                    .as_ref()
                                    .map(|m| m.duration_ms)
                                    .unwrap_or(0);
                                let pos_ms = shared.position_ms();

                                // Guard: never trigger crossfade too early in a track.
                                // This prevents premature skipping caused by wrong analysis,
                                // incorrect probed duration, or position inflation after
                                // crossfade promotion.
                                let min_play_ms = (duration_ms * 3 / 10).max(15_000).min(duration_ms - cfade_ms);
                                if pos_ms < min_play_ms {
                                    // Skip crossfade check this iteration — too early
                                } else {

                                // Try smart crossfade first, fall back to fixed window
                                let current_rk = state.current_track.as_ref().map(|m| m.rating_key).unwrap_or(0);
                                let next_rk = state.next_meta.as_ref().map(|m| m.rating_key).unwrap_or(0);
                                let smart = compute_smart_crossfade(
                                    &shared, current_rk, next_rk, duration_ms, cfade_ms,
                                );

                                let (crossfade_start, effective_cfade_ms, intro_skip_ms) = if let Some(ref sp) = smart {
                                    // Beat-align smart start
                                    let aligned = {
                                        let bpm_fixed = shared.current_bpm.load(Ordering::Relaxed);
                                        if bpm_fixed > 0 {
                                            let bpm = bpm_fixed as f64 / 100.0;
                                            let beat_ms = 60_000.0 / bpm;
                                            let ideal = sp.crossfade_start_ms as f64;
                                            let offset = ideal % beat_ms;
                                            (ideal - offset) as i64
                                        } else {
                                            sp.crossfade_start_ms
                                        }
                                    };
                                    (aligned, sp.crossfade_duration_ms, sp.next_intro_skip_ms)
                                } else {
                                    // Fixed window fallback with beat alignment
                                    let smart_enabled = shared.smart_crossfade_enabled.load(Ordering::Relaxed);
                                    let has_current = analyzer::get_analysis(current_rk).is_some();
                                    debug!(
                                        smart_enabled = smart_enabled,
                                        current_analysed = has_current,
                                        "Crossfade using fixed window (smart={}, analysis={})",
                                        if smart_enabled { "on" } else { "off" },
                                        if has_current { "available" } else { "pending" },
                                    );
                                    let start = {
                                        let bpm_fixed = shared.current_bpm.load(Ordering::Relaxed);
                                        if bpm_fixed > 0 {
                                            let bpm = bpm_fixed as f64 / 100.0;
                                            let beat_ms = 60_000.0 / bpm;
                                            let ideal = (duration_ms - cfade_ms).max(0) as f64;
                                            let offset = ideal % beat_ms;
                                            (ideal - offset) as i64
                                        } else {
                                            (duration_ms - cfade_ms).max(0)
                                        }
                                    };
                                    (start, cfade_ms, 0i64)
                                };

                                if pos_ms >= crossfade_start {
                                    let next_url =
                                        state.next_meta.as_ref().unwrap().url.clone();
                                    let is_cached = shared
                                        .cache_dir
                                        .as_ref()
                                        .map(|d| {
                                            d.join(audio_cache_key(&next_url)).exists()
                                        })
                                        .unwrap_or(false);

                                    if is_cached {
                                        let smart_label = if smart.is_some() { "smart" } else { "fixed" };
                                        info!(
                                            url = %next_url,
                                            pos_ms = pos_ms,
                                            crossfade_start = crossfade_start,
                                            effective_cfade_ms = effective_cfade_ms,
                                            intro_skip_ms = intro_skip_ms,
                                            mode = smart_label,
                                            "Starting crossfade"
                                        );
                                        match open_for_decode(&next_url, &shared)
                                            .and_then(|(mss, u)| probe_audio(mss, &u))
                                        {
                                            Ok((mut nfmt, mut ndec, ntid, nsr, nch, ncodec, probed_dur)) => {
                                                // Correct duration in next_meta if probed duration differs significantly
                                                if let Some(ref mut nm) = state.next_meta {
                                                    nm.duration_ms = corrected_duration(nm.duration_ms, probed_dur);
                                                }
                                                // Seek past leading silence in next track
                                                if intro_skip_ms > 0 {
                                                    let seek_secs = intro_skip_ms as f64 / 1000.0;
                                                    let seek_to = symphonia::core::formats::SeekTo::Time {
                                                        time: symphonia::core::units::Time {
                                                            seconds: seek_secs as u64,
                                                            frac: seek_secs.fract(),
                                                        },
                                                        track_id: Some(ntid),
                                                    };
                                                    match nfmt.seek(symphonia::core::formats::SeekMode::Coarse, seek_to) {
                                                        Ok(_) => {
                                                            ndec.reset();
                                                            debug!(intro_skip_ms = intro_skip_ms, "Seeked past intro silence in next track");
                                                        }
                                                        Err(e) => {
                                                            warn!(error = %e, "Failed to seek past intro silence — playing from start");
                                                        }
                                                    }
                                                }

                                                let next_meta_ref =
                                                    state.next_meta.as_ref().unwrap();
                                                let next_norm = resolve_normalization_gain(
                                                    next_meta_ref, &mut nfmt, &shared, ncodec,
                                                );
                                                shared.next_norm_gain_millths.store(
                                                    (next_norm * 1_000.0) as i64,
                                                    Ordering::Relaxed,
                                                );
                                                let cur_norm = shared.normalization_gain();
                                                let out_rate =
                                                    if dev_rate > 0 { dev_rate } else { src_rate };
                                                let total_frames = effective_cfade_ms as usize
                                                    * out_rate as usize
                                                    / 1000;
                                                info!(
                                                    effective_cfade_ms = effective_cfade_ms,
                                                    total_frames = total_frames,
                                                    out_rate = out_rate,
                                                    next_sample_rate = nsr,
                                                    next_channels = nch,
                                                    cur_norm_gain = format!("{:.4}", cur_norm),
                                                    next_norm_gain = format!("{:.4}", next_norm),
                                                    "Crossfade initialized"
                                                );
                                                let meta = state.next_meta.take().unwrap();
                                                // Snapshot crossfade style at transition start
                                                let style = CrossfadeStyle::from_u64(
                                                    shared.crossfade_style.load(Ordering::Relaxed),
                                                );
                                                // HardCut: override total_frames to ~50ms
                                                let total_frames = if style == CrossfadeStyle::HardCut {
                                                    (50 * out_rate as usize / 1000).max(1)
                                                } else {
                                                    total_frames
                                                };
                                                // Echo Out: allocate delay buffer based on current BPM
                                                let echo_buffer = if style == CrossfadeStyle::EchoOut {
                                                    let bpm_fixed = shared.current_bpm.load(Ordering::Relaxed);
                                                    let bpm = if bpm_fixed > 0 { bpm_fixed as f64 / 100.0 } else { 120.0 };
                                                    let mix_ch = ch_val.max(1) as usize;
                                                    Some(EchoDelayBuffer::new(bpm, out_rate, mix_ch))
                                                } else {
                                                    None
                                                };
                                                info!(
                                                    crossfade_style = ?style,
                                                    total_frames = total_frames,
                                                    "Crossfade style applied"
                                                );
                                                state.crossfade = Some(CrossfadeState {
                                                    format_reader: nfmt,
                                                    decoder: ndec,
                                                    track_id: ntid,
                                                    sample_rate: nsr,
                                                    channels: nch,
                                                    meta,
                                                    sample_buf: None,
                                                    elapsed_frames: 0,
                                                    total_frames,
                                                    pending: Vec::new(),
                                                    norm_gain: next_norm,
                                                    style,
                                                    lp_coeffs: BiquadCoeffs::identity(),
                                                    hp_coeffs: BiquadCoeffs::identity(),
                                                    lp_state: [BiquadState::default(); 8],
                                                    hp_state: [BiquadState::default(); 8],
                                                    echo_buffer,
                                                });
                                            }
                                            Err(e) => {
                                                warn!(
                                                    error = %e,
                                                    "Crossfade: failed to open next track"
                                                );
                                            }
                                        }
                                    }
                                }
                            } // end else (min_play_ms guard)
                            } // end crossfade trigger block

                            // ===============================================
                            // CROSSFADE MIXING (equal-power curves)
                            // ===============================================
                            let norm_enabled =
                                shared.normalization_enabled.load(Ordering::Relaxed);

                            let mut samples_to_push = if let Some(ref mut cf) = state.crossfade {
                                // Use device output channel count as common mix target
                                let mix_ch = ch_val.max(1);

                                // Remix next track's pending to common channel count if needed
                                let cf_ch = cf.channels;
                                let needed_cf_samples = if cf_ch != mix_ch {
                                    // We need enough cf source frames to produce the same
                                    // number of output frames as `resampled`
                                    let mix_frames = resampled.len() / mix_ch as usize;
                                    mix_frames * cf_ch as usize
                                } else {
                                    resampled.len()
                                };

                                refill_crossfade_pending(cf, needed_cf_samples, dev_rate);

                                // Remix cf.pending to match mix_ch if channel counts differ
                                let cf_remixed = if cf_ch != mix_ch {
                                    let consumed = needed_cf_samples.min(cf.pending.len());
                                    let slice = &cf.pending[..consumed];
                                    let remixed = remix_channels(slice, cf_ch, mix_ch);
                                    cf.pending.drain(..consumed);
                                    remixed
                                } else {
                                    let consumed = resampled.len().min(cf.pending.len());
                                    let drained: Vec<f32> = cf.pending.drain(..consumed).collect();
                                    drained
                                };

                                let ch = mix_ch as usize;
                                let frames = resampled.len() / ch;
                                let mut mixed = Vec::with_capacity(resampled.len());

                                let cur_gain =
                                    if norm_enabled { shared.normalization_gain() } else { 1.0 };
                                let next_gain = if norm_enabled { cf.norm_gain } else { 1.0 };

                                // Log at crossfade start (first mixing batch)
                                if cf.elapsed_frames == 0 {
                                    info!(
                                        cur_gain = format!("{:.4}", cur_gain),
                                        next_gain = format!("{:.4}", next_gain),
                                        frames = frames,
                                        total_frames = cf.total_frames,
                                        norm_enabled = norm_enabled,
                                        "Crossfade mixing: first batch"
                                    );
                                }

                                match cf.style {
                                    CrossfadeStyle::Smooth => {
                                        for frame in 0..frames {
                                            let t = ((cf.elapsed_frames + frame) as f32
                                                / cf.total_frames as f32)
                                                .min(1.0);
                                            let fade_out = (t * FRAC_PI_2).cos();
                                            let fade_in = (t * FRAC_PI_2).sin();
                                            for c in 0..ch {
                                                let old_s = resampled
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                                let new_s = cf_remixed
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                                mixed.push(
                                                    old_s * cur_gain * fade_out
                                                        + new_s * next_gain * fade_in,
                                                );
                                            }
                                        }
                                    }
                                    CrossfadeStyle::DjFilter => {
                                        // Update LP/HP coefficients once per packet (exponential freq sweep)
                                        let t_packet = ((cf.elapsed_frames + frames / 2) as f32
                                            / cf.total_frames as f32)
                                            .min(1.0);
                                        let sr = dev_rate as f32;
                                        let butterworth_q = 0.707f32;
                                        // LP: 20kHz → 200Hz (outgoing)
                                        let lp_freq = 20_000.0 * (200.0f32 / 20_000.0).powf(t_packet);
                                        cf.lp_coeffs = BiquadCoeffs::lowpass(lp_freq.max(20.0), butterworth_q, sr);
                                        // HP: 200Hz → 20Hz (incoming)
                                        let hp_freq = 200.0 * (20.0f32 / 200.0).powf(t_packet);
                                        cf.hp_coeffs = BiquadCoeffs::highpass(hp_freq.max(20.0), butterworth_q, sr);

                                        for frame in 0..frames {
                                            let t = ((cf.elapsed_frames + frame) as f32
                                                / cf.total_frames as f32)
                                                .min(1.0);
                                            // S-curve volume: 3t² − 2t³
                                            let s = t * t * (3.0 - 2.0 * t);
                                            let vol_out = 1.0 - s;
                                            let vol_in = s;
                                            for c in 0..ch {
                                                let ci = c.min(7);
                                                let old_s = resampled
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                                let new_s = cf_remixed
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                                let old_filtered = cf.lp_state[ci].process(old_s, &cf.lp_coeffs);
                                                let new_filtered = cf.hp_state[ci].process(new_s, &cf.hp_coeffs);
                                                mixed.push(
                                                    old_filtered * cur_gain * vol_out
                                                        + new_filtered * next_gain * vol_in,
                                                );
                                            }
                                        }
                                    }
                                    CrossfadeStyle::EchoOut => {
                                        for frame in 0..frames {
                                            let t = ((cf.elapsed_frames + frame) as f32
                                                / cf.total_frames as f32)
                                                .min(1.0);
                                            // Fade in new track with equal-power sin curve
                                            let fade_in = (t * FRAC_PI_2).sin();
                                            // Fade out dry signal, feedback decays 0.6 → 0.1
                                            let dry_fade = 1.0 - t;
                                            let feedback = 0.6 - 0.5 * t; // 0.6 → 0.1
                                            let wet_fade = (1.0 - t) * 0.7;

                                            // Collect input frame for echo
                                            let mut input_frame = [0.0f32; 8];
                                            for c in 0..ch.min(8) {
                                                input_frame[c] = resampled
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                            }

                                            // Process through echo delay buffer
                                            let echo_out = if let Some(ref mut eb) = cf.echo_buffer {
                                                eb.process_frame(&input_frame[..ch.min(8)], feedback)
                                            } else {
                                                [0.0f32; 8]
                                            };

                                            for c in 0..ch {
                                                let old_s = resampled
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                                let new_s = cf_remixed
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                                let echo_s = echo_out[c.min(7)];
                                                mixed.push(
                                                    (old_s * dry_fade + echo_s * wet_fade) * cur_gain
                                                        + new_s * next_gain * fade_in,
                                                );
                                            }
                                        }
                                    }
                                    CrossfadeStyle::HardCut => {
                                        // Simple linear crossfade over the ~50ms window
                                        for frame in 0..frames {
                                            let t = ((cf.elapsed_frames + frame) as f32
                                                / cf.total_frames as f32)
                                                .min(1.0);
                                            for c in 0..ch {
                                                let old_s = resampled
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                                let new_s = cf_remixed
                                                    .get(frame * ch + c)
                                                    .copied()
                                                    .unwrap_or(0.0);
                                                mixed.push(
                                                    old_s * cur_gain * (1.0 - t)
                                                        + new_s * next_gain * t,
                                                );
                                            }
                                        }
                                    }
                                }

                                // Log boundary values at the end of this mixing batch
                                let t_end = ((cf.elapsed_frames + frames) as f32
                                    / cf.total_frames as f32)
                                    .min(1.0);
                                let will_promote = cf.elapsed_frames + frames >= cf.total_frames;
                                if will_promote {
                                    let last_4: Vec<f32> = mixed.iter().rev().take(4).rev().copied().collect();
                                    info!(
                                        elapsed = cf.elapsed_frames + frames,
                                        total = cf.total_frames,
                                        t_end = format!("{:.6}", t_end),
                                        fade_out_end = format!("{:.6}", (t_end * FRAC_PI_2).cos()),
                                        fade_in_end = format!("{:.6}", (t_end * FRAC_PI_2).sin()),
                                        cur_gain = format!("{:.4}", cur_gain),
                                        next_gain = format!("{:.4}", next_gain),
                                        last_mixed_samples = ?last_4,
                                        pending_remaining = cf.pending.len(),
                                        "Crossfade mixing: FINAL batch (will promote)"
                                    );
                                } else {
                                    // Periodic progress log (every ~1 second)
                                    let progress_pct = ((cf.elapsed_frames + frames) as f32
                                        / cf.total_frames as f32 * 100.0) as u32;
                                    let prev_pct = (cf.elapsed_frames as f32
                                        / cf.total_frames as f32 * 100.0) as u32;
                                    if progress_pct / 10 != prev_pct / 10 {
                                        debug!(
                                            progress = format!("{}%", progress_pct),
                                            elapsed = cf.elapsed_frames + frames,
                                            total = cf.total_frames,
                                            t = format!("{:.4}", t_end),
                                            "Crossfade mixing progress"
                                        );
                                    }
                                }

                                cf.elapsed_frames += frames;
                                mixed
                            } else {
                                let mut s = resampled;
                                if norm_enabled {
                                    let gain = shared.normalization_gain();
                                    s.iter_mut().for_each(|x| *x *= gain);
                                }
                                s
                            };

                            // Apply micro fade-in ramp to prevent silence→audio pop
                            if state.fade_in_remaining > 0 && state.fade_in_total > 0 {
                                let apply = state.fade_in_remaining.min(samples_to_push.len());
                                for i in 0..apply {
                                    let progress = 1.0
                                        - (state.fade_in_remaining - i) as f32
                                            / state.fade_in_total as f32;
                                    samples_to_push[i] *= progress;
                                }
                                state.fade_in_remaining =
                                    state.fade_in_remaining.saturating_sub(apply);
                            }

                            // ===============================================
                            // PUSH TO RING BUFFER
                            // ===============================================
                            let mut written = 0;
                            while written < samples_to_push.len() {
                                if let Ok(cmd) = cmd_rx.try_recv() {
                                    if handle_command(
                                        cmd,
                                        &cmd_rx,
                                        &event_tx,
                                        &mut producer,
                                        &shared,
                                        &mut state,
                                    ) {
                                        return;
                                    }
                                    if state.format_reader.is_none() || state.sample_buf.is_none() {
                                        break;
                                    }
                                }

                                let n = producer.push_slice(&samples_to_push[written..]);
                                written += n;
                                if n == 0 {
                                    std::thread::sleep(std::time::Duration::from_millis(5));
                                }
                            }

                            // Clear pre-buffering gate once ring buffer has enough runway
                            if shared.prebuffering.load(Ordering::Acquire) {
                                let flush_done = !shared.flush_pending.load(Ordering::Acquire)
                                    && !shared.seek_flush_pending.load(Ordering::Acquire);
                                if flush_done {
                                    let sr = shared.device_sample_rate.load(Ordering::Relaxed) as usize;
                                    let ch = shared.channels.load(Ordering::Relaxed).max(1) as usize;
                                    let threshold = sr * ch / 10; // 100ms of audio
                                    if producer.occupied_len() >= threshold {
                                        shared.prebuffering.store(false, Ordering::Release);
                                    }
                                }
                            }

                            // Track position using raw (pre-resample) sample count
                            shared
                                .position_samples
                                .fetch_add(raw_sample_count as i64, Ordering::Relaxed);
                        }
                        Err(symphonia::core::errors::Error::DecodeError(e)) => {
                            warn!(error = %e, "Decode error (skipping packet)");
                        }
                        Err(e) => {
                            error!(error = %e, "Fatal decode error");
                            let _ = event_tx.send(AudioEvent::Error {
                                message: format!("Decode error: {e}"),
                            });
                            state.format_reader = None;
                            state.decoder = None;
                        }
                    }
                }

                // ===============================================================
                // END OF STREAM — gapless / crossfade completion / normal stop
                // ===============================================================
                Err(symphonia::core::errors::Error::IoError(ref e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    info!("Track decode complete (EOF)");

                    if let Some(cf) = state.crossfade.take() {
                        info!(
                            rating_key = cf.meta.rating_key,
                            "Crossfade complete — swapping to next track"
                        );
                        promote_crossfade(cf, &event_tx, &mut producer, &shared, &mut state);
                    } else if let Some(mut nmeta) = state.next_meta.take() {
                        info!(rating_key = nmeta.rating_key, "Gapless: opening next track");
                        match open_for_decode(&nmeta.url, &shared)
                            .and_then(|(mss, u)| probe_audio(mss, &u))
                        {
                            Ok((mut fmt, dec, tid, sr, ch, codec, probed_dur)) => {
                                nmeta.duration_ms = corrected_duration(nmeta.duration_ms, probed_dur);
                                let norm_gain = {
                                    let next_g =
                                        shared.next_norm_gain_millths.load(Ordering::Relaxed);
                                    if next_g != 1_000 {
                                        next_g as f32 / 1_000.0
                                    } else {
                                        resolve_normalization_gain(&nmeta, &mut fmt, &shared, codec)
                                    }
                                };
                                if let Some(ref old) = state.current_track {
                                    let _ = event_tx.send(AudioEvent::TrackEnded {
                                        rating_key: old.rating_key,
                                    });
                                }
                                let nb = shared.next_bpm.swap(0, Ordering::Relaxed);
                                shared.current_bpm.store(nb, Ordering::Relaxed);
                                shared.normalization_gain_millths.store(
                                    (norm_gain * 1_000.0) as i64,
                                    Ordering::Relaxed,
                                );
                                shared.next_norm_gain_millths.store(1_000, Ordering::Relaxed);

                                state.format_reader = Some(fmt);
                                state.decoder = Some(dec);
                                state.current_track_id = tid;
                                state.sample_buf = None;
                                state.resampler = None;
                                shared.sample_rate.store(sr as i64, Ordering::Relaxed);
                                shared.channels.store(ch as i64, Ordering::Relaxed);
                                shared.position_samples.store(0, Ordering::Relaxed);
                                shared.finished.store(false, Ordering::Release);
                                state.current_track = Some(nmeta.clone());
                                let _ = event_tx.send(AudioEvent::TrackStarted {
                                    rating_key: nmeta.rating_key,
                                    duration_ms: nmeta.duration_ms,
                                });
                                let _ = event_tx.send(AudioEvent::State {
                                    state: PlaybackState::Playing,
                                });
                            }
                            Err(e) => {
                                warn!(
                                    error = %e,
                                    "Gapless: failed to open next track — ending playback"
                                );
                                if let Some(ref meta) = state.current_track {
                                    let _ = event_tx.send(AudioEvent::TrackEnded {
                                        rating_key: meta.rating_key,
                                    });
                                }
                                shared.finished.store(true, Ordering::Release);
                                state.format_reader = None;
                                state.decoder = None;
                                state.current_track = None;
                            }
                        }
                    } else {
                        // Normal end of playback — no queued next track
                        if let Some(ref meta) = state.current_track {
                            let _ = event_tx.send(AudioEvent::TrackEnded {
                                rating_key: meta.rating_key,
                            });
                        }
                        shared.finished.store(true, Ordering::Release);
                        state.format_reader = None;
                        state.decoder = None;
                        state.current_track = None;
                    }
                }
                Err(e) => {
                    error!(error = %e, "Format reader error");
                    let _ = event_tx.send(AudioEvent::Error {
                        message: format!("Read error: {e}"),
                    });
                    state.format_reader = None;
                    state.decoder = None;
                }
            }
        }
    }
}

