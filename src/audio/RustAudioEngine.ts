/**
 * Audio engine — Tauri IPC bridge to the Rust audio engine.
 *
 * Maps the public API to Tauri invoke() commands and listen() events.
 * The Rust engine handles all audio processing: fetch, decode (symphonia),
 * DSP (EQ, limiter, volume), crossfade, and output (cpal → CoreAudio).
 *
 * Module-level singleton: `import { engine } from "../audio/RustAudioEngine"`
 */

import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioEngineCallbacks {
  onPosition(positionMs: number, durationMs: number): void
  onState(state: "playing" | "paused" | "buffering" | "stopped"): void
  onTrackStarted(ratingKey: number, durationMs?: number): void
  onTrackEnded(ratingKey: number): void
  onError(message: string): void
  onVisFrame?(samples: Float32Array): void
}

export interface RampPoint { db: number; timeSec: number }
export interface TrackRamps { startRamp: RampPoint[]; endRamp: RampPoint[] }

export function parseRamp(raw: string | null | undefined): RampPoint[] {
  if (!raw) return []
  return raw.split(";").filter(Boolean).map(pair => {
    const [db, time] = pair.trim().split(" ").map(Number)
    return { db, timeSec: time }
  })
}

// ---------------------------------------------------------------------------
// Event payloads from Rust
// ---------------------------------------------------------------------------

// Payload field names are snake_case from Rust serde (rename_all only affects
// the enum tag, not struct fields in internally-tagged enums).
interface PositionPayload { position_ms: number; duration_ms: number }
interface StatePayload { state: string }
interface TrackStartedPayload { rating_key: number; duration_ms: number }
interface TrackEndedPayload { rating_key: number }
interface ErrorPayload { message: string }
interface VisFramePayload { samples: number[]; frequency_bins: number[] }

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class RustAudioEngine {
  private cb: AudioEngineCallbacks | null = null
  private unlisteners: UnlistenFn[] = []

  // Ramp cache
  private rampCache = new Map<number, TrackRamps>()

  // Cached visualizer data (pushed from Rust, read synchronously by components)
  private lastFrequencyBins: Float32Array | null = null
  private cachedSampleRate = 44100

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  init(callbacks: AudioEngineCallbacks): void {
    this.cb = callbacks
    this.setupEventListeners()
  }

  private async setupEventListeners(): Promise<void> {
    // Clean up any existing listeners
    for (const unlisten of this.unlisteners) {
      unlisten()
    }
    this.unlisteners = []

    this.unlisteners.push(
      await listen<PositionPayload>("audio://position", (e) => {
        this.cb?.onPosition(e.payload.position_ms, e.payload.duration_ms)
      }),
      await listen<StatePayload>("audio://state", (e) => {
        this.cb?.onState(e.payload.state as "playing" | "paused" | "buffering" | "stopped")
      }),
      await listen<TrackStartedPayload>("audio://track-started", (e) => {
        this.cb?.onTrackStarted(e.payload.rating_key, e.payload.duration_ms)
      }),
      await listen<TrackEndedPayload>("audio://track-ended", (e) => {
        this.cb?.onTrackEnded(e.payload.rating_key)
      }),
      await listen<ErrorPayload>("audio://error", (e) => {
        this.cb?.onError(e.payload.message)
      }),
      await listen<VisFramePayload>("audio://vis-frame", (e) => {
        const samples = new Float32Array(e.payload.samples)
        this.lastFrequencyBins = new Float32Array(e.payload.frequency_bins)
        this.cb?.onVisFrame?.(samples)
      }),
    )
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  async play(
    url: string,
    ratingKey: number,
    durationMs: number,
    parentKey: string,
    gainDb: number | null,
    skipCrossfade?: boolean,
    startRamp?: string | null,
    endRamp?: string | null,
  ): Promise<void> {
    // Cache ramps
    if (startRamp || endRamp) {
      this.parseAndCacheRamps(ratingKey, startRamp ?? null, endRamp ?? null)
    }

    await invoke("audio_play", {
      url,
      ratingKey,
      durationMs,
      parentKey,
      gainDb,
      skipCrossfade: skipCrossfade ?? false,
      startRamp: startRamp ?? null,
      endRamp: endRamp ?? null,
    })
  }

  async preloadNext(
    url: string,
    ratingKey: number,
    durationMs: number,
    parentKey: string,
    gainDb: number | null,
    skipCrossfade?: boolean,
    startRamp?: string | null,
    endRamp?: string | null,
  ): Promise<void> {
    if (startRamp || endRamp) {
      this.parseAndCacheRamps(ratingKey, startRamp ?? null, endRamp ?? null)
    }

    await invoke("audio_preload_next", {
      url,
      ratingKey,
      durationMs,
      parentKey,
      gainDb,
      skipCrossfade: skipCrossfade ?? false,
      startRamp: startRamp ?? null,
      endRamp: endRamp ?? null,
    })
  }

  pause(): void {
    invoke("audio_pause")
  }

  resume(): void {
    invoke("audio_resume")
  }

  stop(): void {
    invoke("audio_stop")
  }

  seek(positionMs: number): void {
    invoke("audio_seek", { positionMs })
  }

  // Alias for seekTo (playerStore uses this name)
  seekTo(ms: number): void {
    this.seek(ms)
  }

  setVolume(gain: number): void {
    invoke("audio_set_volume", { gain })
  }

  // ---------------------------------------------------------------------------
  // EQ / DSP
  // ---------------------------------------------------------------------------

  setEq(gainsDb: number[]): void {
    invoke("audio_set_eq", { gainsDb })
  }

  setEqEnabled(enabled: boolean): void {
    invoke("audio_set_eq_enabled", { enabled })
  }

  setPreampGain(db: number): void {
    invoke("audio_set_preamp_gain", { db })
  }

  setEqPostgain(db: number): void {
    invoke("audio_set_eq_postgain", { db })
  }

  /**
   * Brief volume duck to mask EQ filter transients.
   * The Rust engine ramps volume to 0, waits duckMs, then ramps back.
   */
  duckAndApply(fn_: () => void, duckMs = 30): void {
    invoke("audio_duck_and_apply", { duckMs }).then(() => {
      fn_()
    })
  }

  // ---------------------------------------------------------------------------
  // Crossfade settings
  // ---------------------------------------------------------------------------

  setCrossfadeWindow(ms: number): void {
    invoke("audio_set_crossfade_window", { ms })
  }

  setSameAlbumCrossfade(enabled: boolean): void {
    invoke("audio_set_same_album_crossfade", { enabled })
  }

  setSmartCrossfade(enabled: boolean): void {
    invoke("audio_set_smart_crossfade", { enabled })
  }

  setSmartCrossfadeMax(ms: number): void {
    invoke("audio_set_smart_crossfade_max", { ms })
  }

  setMixrampDb(db: number): void {
    invoke("audio_set_mixramp_db", { db })
  }

  setNormalizationEnabled(enabled: boolean): void {
    invoke("audio_set_normalization", { enabled })
  }

  // ---------------------------------------------------------------------------
  // Visualizer
  // ---------------------------------------------------------------------------

  setVisualizerEnabled(enabled: boolean): void {
    invoke("audio_set_visualizer_enabled", { enabled })
  }

  /** Return cached FFT frequency data (pushed from Rust via vis-frame events). */
  getFrequencyData(): Float32Array | null {
    return this.lastFrequencyBins
  }

  /** Return the audio device sample rate. */
  getSampleRate(): number {
    return this.cachedSampleRate
  }

  // ---------------------------------------------------------------------------
  // Audio file cache
  // ---------------------------------------------------------------------------

  setCacheMaxBytes(bytes: number): void {
    invoke("audio_set_cache_max_bytes", { bytes })
  }

  clearCache(): void {
    invoke("audio_clear_cache")
  }

  async getCacheStats(): Promise<{ total_bytes: number; file_count: number; max_bytes: number }> {
    return invoke("audio_get_cache_stats")
  }

  // ---------------------------------------------------------------------------
  // Ramp cache
  // ---------------------------------------------------------------------------

  private parseAndCacheRamps(ratingKey: number, startRamp: string | null, endRamp: string | null): TrackRamps | null {
    if (!startRamp && !endRamp) return null
    const cached = this.rampCache.get(ratingKey)
    if (cached) return cached
    const ramps: TrackRamps = {
      startRamp: parseRamp(startRamp),
      endRamp: parseRamp(endRamp),
    }
    this.rampCache.set(ratingKey, ramps)
    if (this.rampCache.size > 500) {
      const firstKey = this.rampCache.keys().next().value
      if (firstKey !== undefined) this.rampCache.delete(firstKey)
    }
    return ramps
  }

  getTrackRamps(ratingKey: number): TrackRamps | null {
    return this.rampCache.get(ratingKey) ?? null
  }

  getMixrampOverlap(_endRamp: RampPoint[], _startRamp: RampPoint[]): { endOverlapSec: number; startOverlapSec: number } | null {
    // MixRamp interpolation is now handled entirely in Rust.
    // This method is kept for API compatibility but returns null.
    return null
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    this.stop()
    for (const unlisten of this.unlisteners) {
      unlisten()
    }
    this.unlisteners = []
    this.cb = null
  }
}

export const engine = new RustAudioEngine()
