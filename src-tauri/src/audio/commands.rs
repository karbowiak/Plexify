#![allow(dead_code)]

use std::fs::File;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use crossbeam_channel::{Receiver, Sender};
use ringbuf::HeapProd;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::formats::{SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use tracing::{debug, error, info, warn};

use super::bpm;
use super::cache::{audio_cache_key, open_for_decode, prefetch_url_bg, probe_audio};
use super::eq::compute_eq_coeffs;
use super::normalization::{fade_in_sample_count, resolve_normalization_gain};
use super::state::{DecoderShared, DecoderState};
use super::types::{AudioCommand, AudioEvent, PlaybackState};

/// Background BPM detection: decode the first 30 s of the cached audio file
/// and store the result in `shared.next_bpm` (BPM * 100 fixed-point).
fn detect_bpm_bg(url: &str, shared: &Arc<DecoderShared>) {
    let Some(ref cache_dir) = shared.cache_dir else { return };
    let cache_path = cache_dir.join(audio_cache_key(url));

    // Wait up to 10 s for the prefetch to write the cache file
    let mut waited_ms = 0u64;
    while !cache_path.exists() && waited_ms < 10_000 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        waited_ms += 500;
    }
    if !cache_path.exists() {
        return;
    }

    let file = match File::open(&cache_path) {
        Ok(f) => f,
        Err(_) => return,
    };

    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let Ok((mut fmt, mut dec, tid, sr, _ch, _codec)) = probe_audio(mss, url) else { return };

    // Decode first 30 s of mono samples for BPM analysis
    let max_frames = sr as usize * 30;
    let mut mono_samples: Vec<f32> = Vec::with_capacity(max_frames);
    let mut sb: Option<SampleBuffer<f32>> = None;

    'outer: loop {
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
                let ch = spec.channels.count().max(1);
                for frame_samples in s.samples().chunks(ch) {
                    let mono = frame_samples.iter().sum::<f32>() / ch as f32;
                    mono_samples.push(mono);
                    if mono_samples.len() >= max_frames {
                        break 'outer;
                    }
                }
            }
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(_) => break,
        }
    }

    if mono_samples.is_empty() {
        return;
    }

    let detected = bpm::detect(&mono_samples, sr);
    let bpm_fixed = (detected * 100.0) as u64;
    shared.next_bpm.store(bpm_fixed, Ordering::Relaxed);
    info!(bpm = detected, "BPM detected for next track");
}

/// Handle a single command. Returns true if the thread should shut down.
pub(super) fn handle_command(
    cmd: AudioCommand,
    _cmd_rx: &Receiver<AudioCommand>,
    event_tx: &Sender<AudioEvent>,
    _producer: &mut HeapProd<f32>,
    shared: &Arc<DecoderShared>,
    state: &mut DecoderState,
) -> bool {
    match cmd {
        AudioCommand::Play(meta) => {
            info!(rating_key = meta.rating_key, url = %meta.url, "Play command received");

            state.next_meta = None;
            state.crossfade = None;
            state.resampler = None;

            shared.flush_pending.store(true, Ordering::Release);
            shared.prebuffering.store(true, Ordering::Release);

            let _ = event_tx.send(AudioEvent::State {
                state: PlaybackState::Buffering,
            });

            match open_for_decode(&meta.url, shared) {
                Ok((mss, url)) => match probe_audio(mss, &url) {
                    Ok((mut fmt, dec, tid, sr, ch, codec)) => {
                        let norm_gain = resolve_normalization_gain(&meta, &mut fmt, shared, codec);
                        state.format_reader = Some(fmt);
                        state.decoder = Some(dec);
                        state.current_track_id = tid;
                        state.sample_buf = None;

                        shared.sample_rate.store(sr as i64, Ordering::Relaxed);
                        shared.channels.store(ch as i64, Ordering::Relaxed);
                        shared.position_samples.store(0, Ordering::Relaxed);
                        shared.paused.store(false, Ordering::Release);
                        shared.finished.store(false, Ordering::Release);
                        shared.current_bpm.store(0, Ordering::Relaxed);
                        shared.next_bpm.store(0, Ordering::Relaxed);
                        shared.normalization_gain_millths
                            .store((norm_gain * 1_000.0) as i64, Ordering::Relaxed);
                        shared.next_norm_gain_millths.store(1_000, Ordering::Relaxed);

                        state.current_track = Some(meta.clone());

                        let dev_rate = shared.device_sample_rate.load(Ordering::Relaxed) as u32;
                        state.fade_in_total = fade_in_sample_count(dev_rate, ch);
                        state.fade_in_remaining = state.fade_in_total;

                        let _ = event_tx.send(AudioEvent::TrackStarted {
                            rating_key: meta.rating_key,
                            duration_ms: meta.duration_ms,
                        });
                        let _ = event_tx.send(AudioEvent::State {
                            state: PlaybackState::Playing,
                        });
                    }
                    Err(e) => {
                        error!(error = %e, "Failed to probe audio");
                        shared.prebuffering.store(false, Ordering::Release);
                        let _ = event_tx.send(AudioEvent::Error { message: e });
                        let _ = event_tx.send(AudioEvent::State {
                            state: PlaybackState::Stopped,
                        });
                    }
                },
                Err(e) => {
                    error!(error = %e, "Failed to fetch audio");
                    shared.prebuffering.store(false, Ordering::Release);
                    let _ = event_tx.send(AudioEvent::Error { message: e });
                    let _ = event_tx.send(AudioEvent::State {
                        state: PlaybackState::Stopped,
                    });
                }
            }
        }

        AudioCommand::Pause => {
            shared.paused.store(true, Ordering::Release);
            let _ = event_tx.send(AudioEvent::State {
                state: PlaybackState::Paused,
            });
        }

        AudioCommand::Resume => {
            shared.paused.store(false, Ordering::Release);
            if state.format_reader.is_some() {
                let _ = event_tx.send(AudioEvent::State {
                    state: PlaybackState::Playing,
                });
            }
        }

        AudioCommand::Stop => {
            state.format_reader = None;
            state.decoder = None;
            state.current_track = None;
            state.next_meta = None;
            state.crossfade = None;
            shared.paused.store(false, Ordering::Release);
            shared.finished.store(true, Ordering::Release);
            shared.prebuffering.store(false, Ordering::Release);
            shared.position_samples.store(0, Ordering::Relaxed);
            let _ = event_tx.send(AudioEvent::State {
                state: PlaybackState::Stopped,
            });
        }

        AudioCommand::Seek(ms) => {
            if let Some(ref mut fmt) = state.format_reader {
                let time_secs = ms as f64 / 1000.0;
                let seek_to = SeekTo::Time {
                    time: symphonia::core::units::Time {
                        seconds: time_secs as u64,
                        frac: time_secs.fract(),
                    },
                    track_id: Some(state.current_track_id),
                };
                match fmt.seek(SeekMode::Coarse, seek_to) {
                    Ok(seeked) => {
                        if let Some(ref mut dec) = state.decoder {
                            dec.reset();
                        }
                        let ch = shared.channels.load(Ordering::Relaxed);
                        shared.position_samples.store(
                            (seeked.actual_ts as i64) * ch,
                            Ordering::Relaxed,
                        );
                        state.crossfade = None;
                        if let Some(ref mut r) = state.resampler {
                            r.reset();
                        }
                        shared.seek_flush_pending.store(true, Ordering::Release);
                        shared.prebuffering.store(true, Ordering::Release);
                        debug!(seeked_to_ms = ms, actual_ts = seeked.actual_ts, "Seek complete");
                    }
                    Err(e) => {
                        warn!(error = %e, "Seek failed");
                    }
                }
            }
        }

        AudioCommand::SetVolume(vol) => {
            shared.set_volume(vol);
        }

        AudioCommand::PreloadNext(meta) => {
            debug!(
                rating_key = meta.rating_key,
                url = %meta.url,
                "PreloadNext: warming cache + queueing for gapless"
            );
            prefetch_url_bg(meta.url.clone(), Arc::clone(shared));
            state.next_meta = Some(meta.clone());

            let shared_bpm = Arc::clone(shared);
            let url_bpm = meta.url.clone();
            std::thread::Builder::new()
                .name("bpm-detect".into())
                .spawn(move || {
                    detect_bpm_bg(&url_bpm, &shared_bpm);
                })
                .ok();
        }

        AudioCommand::SetCrossfadeWindow(ms) => {
            shared.crossfade_window_ms.store(ms, Ordering::Relaxed);
            info!(ms = ms, "Crossfade window updated");
        }

        AudioCommand::SetNormalizationEnabled(enabled) => {
            shared.normalization_enabled.store(enabled, Ordering::Relaxed);
            info!(enabled = enabled, "Audio normalization toggled");
        }

        AudioCommand::SetEqEnabled(enabled) => {
            shared.eq_enabled.store(enabled, Ordering::Relaxed);
            info!(enabled = enabled, "EQ toggled");
        }

        AudioCommand::SetEq { gains_db } => {
            let sr = shared.device_sample_rate.load(Ordering::Relaxed) as f32;
            let coeffs = compute_eq_coeffs(&gains_db, sr);
            if let Ok(mut lock) = shared.eq_coeffs.lock() {
                *lock = coeffs;
            }
            if let Ok(mut gains_lock) = shared.eq_gains_millths.lock() {
                for (i, &g) in gains_db.iter().enumerate() {
                    gains_lock[i] = (g * 1000.0) as i32;
                }
            }
            shared.eq_sample_rate.store(sr as i64, Ordering::Relaxed);

            let max_boost_db = gains_db.iter().cloned().fold(0.0f32, f32::max);
            let pregain = if max_boost_db > 0.01 {
                10f32.powf(-max_boost_db / 20.0)
            } else {
                1.0
            };
            shared.eq_pregain_millths.store((pregain * 1_000.0) as i64, Ordering::Relaxed);

            // Auto-compute postgain when in auto mode: postgain = 1/pregain
            if shared.eq_postgain_auto.load(Ordering::Relaxed) {
                let postgain = if pregain > 0.001 { 1.0 / pregain } else { 1.0 };
                shared.eq_postgain_millths.store((postgain * 1_000.0) as i64, Ordering::Relaxed);
                debug!("EQ coefficients recomputed at {}Hz, pregain={:.3}, auto-postgain={:.3}", sr as i32, pregain, postgain);
            } else {
                debug!("EQ coefficients recomputed at {}Hz, pregain={:.3}", sr as i32, pregain);
            }
        }

        AudioCommand::SetPreampGain(db) => {
            let linear = 10f32.powf(db.clamp(-24.0, 6.0) / 20.0);
            shared.preamp_gain_millths.store((linear * 1_000.0) as i64, Ordering::Relaxed);
            debug!(db = db, linear = linear, "Pre-amp gain updated");
        }

        AudioCommand::SetSameAlbumCrossfade(enabled) => {
            shared.same_album_crossfade.store(enabled, Ordering::Relaxed);
            info!(enabled = enabled, "Same-album crossfade toggled");
        }

        AudioCommand::SetVisualizerEnabled(enabled) => {
            shared.vis_enabled.store(enabled, Ordering::Relaxed);
            debug!(enabled = enabled, "Visualizer PCM bridge toggled");
        }

        AudioCommand::SetEqPostgain(db) => {
            let linear = 10f32.powf(db.clamp(0.0, 18.0) / 20.0);
            shared.eq_postgain_millths.store((linear * 1_000.0) as i64, Ordering::Relaxed);
            debug!(db = db, linear = linear, "EQ postgain updated");
        }

        AudioCommand::SetEqPostgainAuto(auto) => {
            shared.eq_postgain_auto.store(auto, Ordering::Relaxed);
            if auto {
                // Recompute postgain from current pregain: postgain = 1/pregain
                let pregain = shared.eq_pregain_millths.load(Ordering::Relaxed) as f32 / 1_000.0;
                let postgain = if pregain > 0.001 { 1.0 / pregain } else { 1.0 };
                shared.eq_postgain_millths.store((postgain * 1_000.0) as i64, Ordering::Relaxed);
                debug!(postgain = postgain, "EQ postgain auto-computed from pregain");
            }
        }

        AudioCommand::SetPreferredDevice(name) => {
            *shared.preferred_device_name.lock().unwrap() = name.clone();
            debug!(?name, "Preferred output device updated");
        }

        AudioCommand::SwapProducer(new_producer) => {
            *_producer = new_producer;
            info!("Ring buffer producer swapped (device switch)");
        }

        AudioCommand::Shutdown => {
            info!("Decoder thread shutting down");
            return true;
        }
    }

    false
}
