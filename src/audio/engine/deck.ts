import type { TrackRamps } from "../WebAudioEngine"

const DEBUG = import.meta.env.DEV
function log(...args: unknown[]): void {
  if (DEBUG) console.log("[Deck]", ...args)
}

export interface DeckEvents {
  onPlaying: () => void
  onWaiting: () => void
  onEnded: () => void
  onError: (message: string) => void
  onLoadedMetadata: (durationSec: number) => void
  onTimeUpdate: (currentTime: number, duration: number) => void
}

/**
 * Represents one audio source with its own normalization and fade gain nodes.
 *
 * Node graph:
 *   HTMLAudioElement → MediaElementSource → normGain → fadeGain (output)
 *
 * - normGain: per-track loudness normalization (never touched by crossfade)
 * - fadeGain: crossfade curves applied here (independent from normalization)
 */
export class Deck {
  readonly audio: HTMLAudioElement
  private sourceNode: MediaElementAudioSourceNode | null = null
  readonly normGain: GainNode
  readonly fadeGain: GainNode

  // Track metadata
  ratingKey = 0
  durationMs = 0
  parentKey = ""
  gainDb: number | null = null
  skipCrossfade = false
  ramps: TrackRamps | null = null

  // State
  hasStartedPlaying = false
  loaded = false
  private resetGeneration = 0

  private events: DeckEvents | null = null
  private cleanup: (() => void) | null = null
  private timeupdateHandler: (() => void) | null = null

  constructor(private ctx: AudioContext) {
    this.audio = new Audio()
    this.audio.crossOrigin = "anonymous"
    this.audio.preload = "auto"

    this.normGain = ctx.createGain()
    this.normGain.gain.value = 1
    this.fadeGain = ctx.createGain()
    this.fadeGain.gain.value = 1

    this.normGain.connect(this.fadeGain)
  }

  /**
   * Returns the output node for this deck (fadeGain).
   * Lazily creates the MediaElementSourceNode on first call.
   */
  getOutputNode(): AudioNode {
    if (!this.sourceNode) {
      this.sourceNode = this.ctx.createMediaElementSource(this.audio)
      this.sourceNode.connect(this.normGain)
    }
    return this.fadeGain
  }

  load(url: string): void {
    // Invalidate any pending deferred reset cleanup
    this.resetGeneration++

    // Cancel any in-flight fadeGain ramp from reset() and restore to 1
    const ctx = this.fadeGain.context as AudioContext
    const now = ctx.currentTime
    this.fadeGain.gain.cancelScheduledValues(now)
    this.fadeGain.gain.setValueAtTime(1, now)

    // Ensure source node exists
    this.getOutputNode()
    this.audio.src = url
    this.loaded = true
  }

  setNormGain(gainLinear: number): void {
    this.normGain.gain.value = gainLinear
  }

  attachEvents(events: DeckEvents): void {
    this.detachEvents()
    this.events = events

    const onPlaying = () => {
      if (!this.hasStartedPlaying) {
        this.hasStartedPlaying = true
        log("playing, ratingKey:", this.ratingKey)
      }
      events.onPlaying()
    }
    const onWaiting = () => events.onWaiting()
    const onEnded = () => events.onEnded()
    const onError = () => {
      const msg = this.audio.error?.message ?? "Audio playback error"
      events.onError(msg)
    }
    const onLoadedMetadata = () => {
      if (this.audio.duration && isFinite(this.audio.duration)) {
        events.onLoadedMetadata(this.audio.duration)
      }
    }
    const onTimeUpdate = () => {
      if (this.audio.duration && isFinite(this.audio.duration)) {
        events.onTimeUpdate(this.audio.currentTime, this.audio.duration)
      }
    }

    this.audio.addEventListener("playing", onPlaying)
    this.audio.addEventListener("waiting", onWaiting)
    this.audio.addEventListener("ended", onEnded)
    this.audio.addEventListener("error", onError)
    this.audio.addEventListener("loadedmetadata", onLoadedMetadata)
    this.audio.addEventListener("timeupdate", onTimeUpdate)

    this.timeupdateHandler = onTimeUpdate
    this.cleanup = () => {
      this.audio.removeEventListener("playing", onPlaying)
      this.audio.removeEventListener("waiting", onWaiting)
      this.audio.removeEventListener("ended", onEnded)
      this.audio.removeEventListener("error", onError)
      this.audio.removeEventListener("loadedmetadata", onLoadedMetadata)
      this.audio.removeEventListener("timeupdate", onTimeUpdate)
    }
  }

  detachEvents(): void {
    this.cleanup?.()
    this.cleanup = null
    this.events = null
    this.timeupdateHandler = null
  }

  /**
   * Reset deck for reuse: clear metadata, stop audio, reset gains.
   */
  reset(): void {
    this.detachEvents()

    const gen = ++this.resetGeneration

    // Ramp fadeGain to 0 over 5ms to avoid click from abrupt gain change
    const ctx = this.fadeGain.context as AudioContext
    const now = ctx.currentTime
    this.fadeGain.gain.cancelScheduledValues(now)
    this.fadeGain.gain.setValueAtTime(this.fadeGain.gain.value, now)
    this.fadeGain.gain.linearRampToValueAtTime(0, now + 0.005)

    // Defer cleanup until the ramp completes — skip if deck was reloaded since
    setTimeout(() => {
      if (this.resetGeneration !== gen) return

      this.audio.pause()
      this.audio.removeAttribute("src")
      this.audio.load() // Release network connection

      this.ratingKey = 0
      this.durationMs = 0
      this.parentKey = ""
      this.gainDb = null
      this.skipCrossfade = false
      this.ramps = null
      this.hasStartedPlaying = false
      this.loaded = false

      this.normGain.gain.cancelScheduledValues(0)
      this.normGain.gain.value = 1
      this.fadeGain.gain.cancelScheduledValues(0)
      this.fadeGain.gain.value = 1
    }, 10)
  }

  getCurrentTime(): number {
    return this.audio.currentTime
  }

  getDuration(): number {
    return this.audio.duration || this.durationMs / 1000
  }

  get paused(): boolean {
    return this.audio.paused
  }

  async play(): Promise<void> {
    await this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  seekTo(timeSec: number): void {
    this.audio.currentTime = Math.max(0, timeSec)
  }

  isFullyBuffered(): boolean {
    const audio = this.audio
    if (!audio.duration || !isFinite(audio.duration)) return false
    const buf = audio.buffered
    if (buf.length === 0) return false
    return buf.end(buf.length - 1) >= audio.duration - 0.5
  }

  dispose(): void {
    this.detachEvents()
    this.audio.pause()
    this.audio.removeAttribute("src")
    this.audio.load()
    if (this.sourceNode) {
      this.sourceNode.disconnect()
    }
    this.normGain.disconnect()
    this.fadeGain.disconnect()
  }
}
