#![allow(dead_code)]

use std::sync::atomic::Ordering;
use std::sync::Arc;

use crossbeam_channel::{Receiver, Sender};
use ringbuf::HeapProd;
use symphonia::core::formats::{SeekMode, SeekTo};
use tracing::{debug, error, info, warn};

use super::analyzer;
use super::cache::{corrected_duration, open_for_decode, prefetch_url_bg, probe_audio};
use super::eq::compute_eq_coeffs;
use super::normalization::{fade_in_sample_count, resolve_normalization_gain};
use super::state::{DecoderShared, DecoderState};
use super::types::{AudioCommand, AudioEvent, PlaybackState};

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
                    Ok((mut fmt, dec, tid, sr, ch, codec, probed_dur)) => {
                        let mut meta = meta;
                        meta.duration_ms = corrected_duration(meta.duration_ms, probed_dur);
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

                        // Analyze current track in background (for smart crossfade)
                        analyzer::analyze_current_bg(
                            meta.url.clone(),
                            meta.rating_key,
                            meta.duration_ms,
                            Arc::clone(shared),
                        );
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

            // Full track analysis (silence, energy, outro/intro, BPM) replaces detect_bpm_bg
            analyzer::analyze_bg(
                meta.url.clone(),
                meta.rating_key,
                meta.duration_ms,
                Arc::clone(shared),
            );
        }

        AudioCommand::SetCrossfadeWindow(ms) => {
            shared.crossfade_window_ms.store(ms, Ordering::Relaxed);
            info!(ms = ms, "Crossfade window updated");
        }

        AudioCommand::SetCrossfadeStyle(style) => {
            shared.crossfade_style.store(style, Ordering::Relaxed);
            info!(style = style, "Crossfade style updated");
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

        AudioCommand::SetSmartCrossfade(enabled) => {
            shared.smart_crossfade_enabled.store(enabled, Ordering::Relaxed);
            info!(enabled = enabled, "Smart crossfade toggled");
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
            if let Ok(mut guard) = shared.preferred_device_name.lock() {
                *guard = name.clone();
            } else {
                warn!("Failed to lock preferred_device_name (mutex poisoned)");
            }
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
