#![allow(dead_code)]

use std::f32::consts::FRAC_PI_2;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use crossbeam_channel::{Receiver, Sender};
use ringbuf::traits::{Observer, Producer};
use ringbuf::HeapProd;
use symphonia::core::audio::SampleBuffer;
use tracing::{debug, error, info, warn};

use super::cache::{audio_cache_key, open_for_decode, probe_audio};
use super::commands::handle_command;
use super::crossfade::{promote_crossfade, refill_crossfade_pending};
use super::normalization::resolve_normalization_gain;
use super::resampler::{remix_channels, resample};
use super::state::{CrossfadeState, DecoderShared, DecoderState};
use super::types::{AudioCommand, AudioEvent, PlaybackState};

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
                            let suppress_xfade = same_album
                                && !shared.same_album_crossfade.load(Ordering::Relaxed);

                            if cfade_ms > 0 && !suppress_xfade && state.crossfade.is_none() && state.next_meta.is_some() {
                                let duration_ms = state.current_track
                                    .as_ref()
                                    .map(|m| m.duration_ms)
                                    .unwrap_or(0);
                                let pos_ms = shared.position_ms();

                                // Beat-align the crossfade start if current BPM is known
                                let crossfade_start = {
                                    let bpm_fixed =
                                        shared.current_bpm.load(Ordering::Relaxed);
                                    if bpm_fixed > 0 {
                                        let bpm = bpm_fixed as f64 / 100.0;
                                        let beat_ms = 60_000.0 / bpm;
                                        let ideal =
                                            (duration_ms - cfade_ms).max(0) as f64;
                                        let offset = ideal % beat_ms;
                                        (ideal - offset) as i64
                                    } else {
                                        (duration_ms - cfade_ms).max(0)
                                    }
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
                                        info!(url = %next_url, pos_ms = pos_ms, crossfade_start = crossfade_start, "Starting crossfade");
                                        match open_for_decode(&next_url, &shared)
                                            .and_then(|(mss, u)| probe_audio(mss, &u))
                                        {
                                            Ok((mut nfmt, ndec, ntid, nsr, nch, ncodec)) => {
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
                                                let total_frames = cfade_ms as usize
                                                    * out_rate as usize
                                                    / 1000;
                                                info!(
                                                    cfade_ms = cfade_ms,
                                                    total_frames = total_frames,
                                                    out_rate = out_rate,
                                                    next_sample_rate = nsr,
                                                    next_channels = nch,
                                                    cur_norm_gain = format!("{:.4}", cur_norm),
                                                    next_norm_gain = format!("{:.4}", next_norm),
                                                    "Crossfade initialized"
                                                );
                                                let meta = state.next_meta.take().unwrap();
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
                            }

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
                    } else if let Some(nmeta) = state.next_meta.take() {
                        info!(rating_key = nmeta.rating_key, "Gapless: opening next track");
                        match open_for_decode(&nmeta.url, &shared)
                            .and_then(|(mss, u)| probe_audio(mss, &u))
                        {
                            Ok((mut fmt, dec, tid, sr, ch, codec)) => {
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

