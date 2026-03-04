/**
 * Web Audio API engine — replaces the Rust audio engine.
 *
 * Uses HTMLAudioElement for streaming playback (instant start, no full-file download)
 * connected via MediaElementAudioSourceNode into the processing chain.
 *
 * Module-level singleton: `import { engine } from "../audio/WebAudioEngine"`
 *
 * Node graph (per deck):
 *   HTMLAudioElement → MediaElementSource → GainNode (norm)
 *
 * Shared chain:
 *   [deck norm gains] → preamp → EQ×10 → postgain → limiter → analyser → master → destination
 */

import AnalyzerWorker from "./analyzer.worker?worker"

// ---------------------------------------------------------------------------
// Debug logging — only in dev mode
// ---------------------------------------------------------------------------

const DEBUG = import.meta.env.DEV

function log(...args: unknown[]): void {
  if (DEBUG) console.log("[WebAudio]", ...args)
}

function warn(...args: unknown[]): void {
  if (DEBUG) console.warn("[WebAudio]", ...args)
}

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

export interface TrackAnalysis {
  rating_key: number
  audio_start_ms: number
  audio_end_ms: number
  outro_start_ms: number
  intro_end_ms: number
  median_energy: number
  bpm: number
}

// EQ band center frequencies (Hz)
const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

// ---------------------------------------------------------------------------
// Deck — represents one audio source (current or preloaded next)
// ---------------------------------------------------------------------------

interface Deck {
  audio: HTMLAudioElement
  sourceNode: MediaElementAudioSourceNode
  normGain: GainNode
  ratingKey: number
  durationMs: number
  parentKey: string
  gainDb: number | null
  skipCrossfade: boolean
  /** True once the audio element has fired 'playing' at least once. */
  hasStartedPlaying: boolean
  /** Cleanup function for event listeners. */
  cleanup: () => void
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class WebAudioEngine {
  // AudioContext & shared processing chain
  private ctx: AudioContext | null = null
  private preampNode: GainNode | null = null
  private eqNodes: BiquadFilterNode[] = []
  private postgainNode: GainNode | null = null
  private limiterNode: DynamicsCompressorNode | null = null
  private analyserNode: AnalyserNode | null = null
  private masterNode: GainNode | null = null

  // Decks
  private activeDeck: Deck | null = null
  private preloadedDeck: Deck | null = null

  // Callbacks
  private cb: AudioEngineCallbacks | null = null

  // Position polling
  private positionTimer: ReturnType<typeof setInterval> | null = null

  // Visualizer RAF
  private visEnabled = false
  private visRafId: number | null = null
  private visSamples: Float32Array<ArrayBuffer> | null = null

  // Settings
  private eqEnabled = false
  private eqGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  private preampDb = 0
  private postgainDb = 0
  private postgainAuto = false
  private normalizationEnabled = true
  private crossfadeWindowMs = 8000
  private sameAlbumCrossfade = false
  private smartCrossfadeEnabled = true
  private volume = 1.0 // 0–1 (already cubic-curved by caller)

  // Crossfade scheduling
  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null
  private isCrossfading = false

  // Track analysis (from Web Worker)
  private analysisCache = new Map<number, TrackAnalysis>()
  private worker: Worker | null = null
  private pendingAnalyses = new Map<number, (a: TrackAnalysis) => void>()
  private analysisQueue: Array<{ url: string; ratingKey: number; durationMs: number }> = []
  private analysisRunning = false

  // Deferred preload — waits for active deck to start playing before fetching
  private pendingPreload: { url: string; ratingKey: number; durationMs: number; parentKey: string; gainDb: number | null; skipCrossfade: boolean } | null = null

  // Preload retry tracking
  private preloadRetried = false

  // Monotonic play generation — prevents stale async callbacks from interfering
  private playGeneration = 0

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  init(callbacks: AudioEngineCallbacks): void {
    log("init()")
    this.cb = callbacks
    try {
      this.worker = new AnalyzerWorker()
      this.worker.onmessage = (e: MessageEvent) => {
        const data = e.data as TrackAnalysis
        log("analysis complete for ratingKey:", data.rating_key, "bpm:", data.bpm)
        this.analysisCache.set(data.rating_key, data)
        if (this.analysisCache.size > 200) {
          const firstKey = this.analysisCache.keys().next().value
          if (firstKey !== undefined) this.analysisCache.delete(firstKey)
        }
        const resolver = this.pendingAnalyses.get(data.rating_key)
        if (resolver) {
          resolver(data)
          this.pendingAnalyses.delete(data.rating_key)
        }
      }
      log("analyzer worker created")
    } catch (err) {
      warn("failed to create analyzer worker:", err)
    }
  }

  private ensureContext(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        log("resuming suspended AudioContext")
        void this.ctx.resume()
      }
      return this.ctx
    }

    log("creating new AudioContext")
    this.ctx = new AudioContext()

    // Build shared processing chain
    this.preampNode = this.ctx.createGain()
    this.preampNode.gain.value = this.dbToGain(this.preampDb)

    // 10-band EQ
    this.eqNodes = EQ_FREQS.map((freq, i) => {
      const filter = this.ctx!.createBiquadFilter()
      if (i === 0) filter.type = "lowshelf"
      else if (i === 9) filter.type = "highshelf"
      else filter.type = "peaking"
      filter.frequency.value = freq
      filter.Q.value = i === 0 || i === 9 ? 0.7 : 1.4
      filter.gain.value = this.eqEnabled ? this.eqGains[i] : 0
      return filter
    })

    this.postgainNode = this.ctx.createGain()
    this.postgainNode.gain.value = this.dbToGain(this.eqEnabled ? this.postgainDb : 0)

    this.limiterNode = this.ctx.createDynamicsCompressor()
    this.limiterNode.threshold.value = -1
    this.limiterNode.knee.value = 0
    this.limiterNode.ratio.value = 20
    this.limiterNode.attack.value = 0.003
    this.limiterNode.release.value = 0.25

    this.analyserNode = this.ctx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8

    this.masterNode = this.ctx.createGain()
    this.masterNode.gain.value = this.volume

    // Connect chain: preamp → eq[0..9] → postgain → limiter → analyser → master → dest
    this.preampNode.connect(this.eqNodes[0])
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1])
    }
    this.eqNodes[this.eqNodes.length - 1].connect(this.postgainNode)
    this.postgainNode.connect(this.limiterNode)
    this.limiterNode.connect(this.analyserNode)
    this.analyserNode.connect(this.masterNode)
    this.masterNode.connect(this.ctx.destination)

    // Start position polling
    this.positionTimer = setInterval(() => this.pollPosition(), 250)

    log("AudioContext created, sample rate:", this.ctx.sampleRate)
    return this.ctx
  }

  // ---------------------------------------------------------------------------
  // Deck creation
  // ---------------------------------------------------------------------------

  private createDeck(
    url: string,
    ratingKey: number,
    durationMs: number,
    parentKey: string,
    gainDb: number | null,
    skipCrossfade: boolean,
  ): Deck {
    const ctx = this.ensureContext()

    const audio = new Audio()
    audio.crossOrigin = "anonymous"
    audio.preload = "auto"

    const sourceNode = ctx.createMediaElementSource(audio)
    const normGain = ctx.createGain()
    normGain.gain.value = this.normalizationEnabled && gainDb != null ? this.dbToGain(gainDb) : 1
    sourceNode.connect(normGain)
    normGain.connect(this.preampNode!)

    // Set src to start streaming immediately
    audio.src = url

    const deck: Deck = {
      audio,
      sourceNode,
      normGain,
      ratingKey,
      durationMs,
      parentKey,
      gainDb,
      skipCrossfade,
      hasStartedPlaying: false,
      cleanup: () => {},
    }

    return deck
  }

  private attachDeckListeners(deck: Deck, gen: number): void {
    const onPlaying = () => {
      if (this.playGeneration !== gen) return
      if (!deck.hasStartedPlaying) {
        deck.hasStartedPlaying = true
        log("deck playing, ratingKey:", deck.ratingKey)

        // Update duration from audio element if available (more accurate)
        if (deck.audio.duration && isFinite(deck.audio.duration)) {
          const realDurMs = deck.audio.duration * 1000
          if (Math.abs(realDurMs - deck.durationMs) > 500) {
            log("duration corrected:", deck.durationMs, "→", realDurMs)
            deck.durationMs = realDurMs
            // Reschedule crossfade with corrected duration
            if (this.activeDeck === deck) {
              this.scheduleCrossfade()
            }
          }
        }
      }
      if (this.activeDeck === deck) {
        this.cb?.onState("playing")
        // Defer preload + analysis until the active deck is fully buffered.
        // Plex servers can't handle multiple concurrent stream connections reliably.
        this.waitForBufferThenPreloadAndAnalyze()
      }
    }

    const onWaiting = () => {
      if (this.playGeneration !== gen) return
      if (this.activeDeck === deck) {
        log("deck buffering, ratingKey:", deck.ratingKey)
        this.cb?.onState("buffering")
      }
    }

    const onEnded = () => {
      if (this.playGeneration !== gen) return
      log("deck ended, ratingKey:", deck.ratingKey)
      this.handleDeckEnded(deck)
    }

    const onLoadedMetadata = () => {
      if (this.playGeneration !== gen) return
      if (deck.audio.duration && isFinite(deck.audio.duration)) {
        const realDurMs = deck.audio.duration * 1000
        if (Math.abs(realDurMs - deck.durationMs) > 500) {
          log("duration corrected (metadata):", deck.durationMs, "→", realDurMs)
          deck.durationMs = realDurMs
          // Reschedule crossfade with corrected duration
          if (this.activeDeck === deck) {
            this.scheduleCrossfade()
          }
        }
      }
    }

    const onError = () => {
      if (this.playGeneration !== gen) return
      const msg = deck.audio.error?.message ?? "Audio playback error"
      warn("deck error, ratingKey:", deck.ratingKey, msg)
      this.cb?.onError(msg)
    }

    deck.audio.addEventListener("loadedmetadata", onLoadedMetadata)
    deck.audio.addEventListener("playing", onPlaying)
    deck.audio.addEventListener("waiting", onWaiting)
    deck.audio.addEventListener("ended", onEnded)
    deck.audio.addEventListener("error", onError)

    deck.cleanup = () => {
      deck.audio.removeEventListener("loadedmetadata", onLoadedMetadata)
      deck.audio.removeEventListener("playing", onPlaying)
      deck.audio.removeEventListener("waiting", onWaiting)
      deck.audio.removeEventListener("ended", onEnded)
      deck.audio.removeEventListener("error", onError)
    }
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
  ): Promise<void> {
    const gen = ++this.playGeneration
    this.pendingPreload = null
    log("play() ratingKey:", ratingKey, "url:", url.slice(0, 80))

    this.ensureContext()

    // Check if the preloaded deck matches
    if (this.preloadedDeck && this.preloadedDeck.ratingKey === ratingKey) {
      log("using preloaded deck for ratingKey:", ratingKey)
      const deck = this.preloadedDeck
      this.preloadedDeck = null
      deck.gainDb = gainDb
      deck.skipCrossfade = skipCrossfade ?? false
      deck.normGain.gain.value = this.normalizationEnabled && gainDb != null ? this.dbToGain(gainDb) : 1
      this.transitionToDeck(deck, gen)
      return
    }

    this.cb?.onState("buffering")

    const deck = this.createDeck(url, ratingKey, durationMs, parentKey, gainDb, skipCrossfade ?? false)
    this.attachDeckListeners(deck, gen)
    this.transitionToDeck(deck, gen)
  }

  private transitionToDeck(deck: Deck, gen: number): void {
    // Cancel any pending crossfade
    this.cancelCrossfade()

    const shouldCrossfade = !deck.skipCrossfade
      && this.crossfadeWindowMs > 0
      && this.activeDeck !== null
      && !this.shouldSuppressCrossfade(deck)

    if (shouldCrossfade && this.activeDeck) {
      log("crossfade transition to ratingKey:", deck.ratingKey)
      this.preloadedDeck = deck
      this.executeCrossfade(this.crossfadeWindowMs)
    } else {
      log("hard transition to ratingKey:", deck.ratingKey)
      this.stopActiveDeck()
      this.startDeck(deck, gen)
    }
  }

  private shouldSuppressCrossfade(nextDeck: Deck): boolean {
    if (!this.activeDeck) return false
    if (!this.sameAlbumCrossfade && this.activeDeck.parentKey && this.activeDeck.parentKey === nextDeck.parentKey) {
      log("suppressing crossfade — same album:", this.activeDeck.parentKey)
      return true
    }
    return false
  }

  private startDeck(deck: Deck, gen: number, offsetSec = 0): void {
    if (offsetSec > 0) {
      deck.audio.currentTime = offsetSec
    }

    this.activeDeck = deck
    this.cb?.onTrackStarted(deck.ratingKey, deck.durationMs)
    log("startDeck ratingKey:", deck.ratingKey, "offset:", offsetSec)

    deck.audio.play().then(() => {
      if (this.playGeneration !== gen) return
      this.cb?.onState("playing")
    }).catch((err) => {
      if (this.playGeneration !== gen) return
      // Autoplay blocked — will resume on user interaction
      warn("play() rejected:", err)
    })

    // Schedule crossfade/gapless to next preloaded track
    this.scheduleCrossfade()
  }

  private stopActiveDeck(): void {
    if (!this.activeDeck) return
    log("stopping active deck, ratingKey:", this.activeDeck.ratingKey)
    this.destroyDeck(this.activeDeck)
    this.activeDeck = null
  }

  private destroyDeck(deck: Deck): void {
    deck.cleanup()
    deck.audio.pause()
    deck.audio.removeAttribute("src")
    deck.audio.load() // Release network connection
    deck.sourceNode.disconnect()
    deck.normGain.disconnect()
  }

  private handleDeckEnded(deck: Deck): void {
    if (this.isCrossfading) return

    if (this.activeDeck === deck) {
      this.activeDeck = null
    }
    this.destroyDeck(deck)

    this.cb?.onTrackEnded(deck.ratingKey)
    this.cb?.onState("stopped")
  }

  pause(): void {
    if (this.activeDeck) {
      log("pause()")
      this.activeDeck.audio.pause()
      this.cb?.onState("paused")
    }
  }

  resume(): void {
    if (this.activeDeck) {
      log("resume()")
      this.activeDeck.audio.play().catch(() => {})
      this.cb?.onState("playing")
    }
  }

  stop(): void {
    log("stop()")
    this.cancelCrossfade()
    this.isCrossfading = false
    this.pendingPreload = null
    ++this.playGeneration

    if (this.activeDeck) {
      this.stopActiveDeck()
    }

    if (this.preloadedDeck) {
      this.destroyDeck(this.preloadedDeck)
      this.preloadedDeck = null
    }

    // Don't fire onTrackEnded — stop() is a user action, not a natural track end.
    // Firing it would cause the playerStore to advance to next track.
    this.cb?.onState("stopped")
  }

  seek(positionMs: number): void {
    if (!this.activeDeck) return
    const sec = Math.max(0, positionMs / 1000)
    log("seek() to", sec.toFixed(1), "s")
    this.activeDeck.audio.currentTime = sec

    // Reschedule crossfade from new position
    this.cancelCrossfade()
    this.scheduleCrossfade()
  }

  setVolume(gain: number): void {
    this.volume = gain
    if (this.masterNode) {
      this.masterNode.gain.value = gain
    }
  }

  // ---------------------------------------------------------------------------
  // Preloading & gapless
  // ---------------------------------------------------------------------------

  async preloadNext(
    url: string,
    ratingKey: number,
    durationMs: number,
    parentKey: string,
    gainDb: number | null,
    skipCrossfade?: boolean,
  ): Promise<void> {
    // Don't preload if already preloaded for this track
    if (this.preloadedDeck?.ratingKey === ratingKey) return

    // Defer preload until the active deck is actually playing to avoid
    // competing for Plex connections during initial buffering
    if (this.activeDeck && !this.activeDeck.hasStartedPlaying) {
      log("preloadNext() deferred until deck playing, ratingKey:", ratingKey)
      this.pendingPreload = { url, ratingKey, durationMs, parentKey, gainDb: gainDb, skipCrossfade: skipCrossfade ?? false }
      return
    }

    this.executePreload(url, ratingKey, durationMs, parentKey, gainDb, skipCrossfade ?? false)
  }

  private executePreload(
    url: string,
    ratingKey: number,
    durationMs: number,
    parentKey: string,
    gainDb: number | null,
    skipCrossfade: boolean,
  ): void {
    log("preloadNext() ratingKey:", ratingKey)
    this.ensureContext()
    this.preloadRetried = false

    // Discard previous preloaded deck
    if (this.preloadedDeck) {
      this.destroyDeck(this.preloadedDeck)
    }

    const deck = this.createDeck(url, ratingKey, durationMs, parentKey, gainDb, skipCrossfade)
    // Attach listeners with current gen (they'll be replaced if this deck gets promoted to active)
    this.attachDeckListeners(deck, this.playGeneration)

    // Watch for preload errors and retry once after 2s
    const onPreloadError = () => {
      deck.audio.removeEventListener("error", onPreloadError)
      if (this.preloadedDeck !== deck) return // deck was already replaced
      if (this.preloadRetried) {
        warn("preload retry also failed for ratingKey:", ratingKey)
        return
      }
      this.preloadRetried = true
      warn("preload error for ratingKey:", ratingKey, "— retrying in 2s")
      this.destroyDeck(deck)
      this.preloadedDeck = null
      setTimeout(() => {
        // Only retry if no other preload happened in the meantime
        if (this.preloadedDeck) return
        log("preload retry for ratingKey:", ratingKey)
        const retryDeck = this.createDeck(url, ratingKey, durationMs, parentKey, gainDb, skipCrossfade)
        this.attachDeckListeners(retryDeck, this.playGeneration)
        this.preloadedDeck = retryDeck
        this.scheduleCrossfade()
      }, 2000)
    }
    deck.audio.addEventListener("error", onPreloadError)

    this.preloadedDeck = deck

    // Reschedule crossfade now that we have a preloaded deck
    this.scheduleCrossfade()
  }

  // ---------------------------------------------------------------------------
  // Crossfade
  // ---------------------------------------------------------------------------

  private scheduleCrossfade(): void {
    this.cancelCrossfade()

    if (!this.activeDeck || !this.preloadedDeck || !this.ctx) return
    if (this.crossfadeWindowMs <= 0) {
      this.scheduleGapless()
      return
    }

    const deck = this.activeDeck
    const suppress = this.shouldSuppressCrossfade(this.preloadedDeck)
    if (suppress) {
      this.scheduleGapless()
      return
    }

    // Determine crossfade start time
    let crossfadeMs = this.crossfadeWindowMs
    let crossfadeStartMs: number
    let nextStartOffset = 0

    if (this.smartCrossfadeEnabled) {
      const currentAnalysis = this.analysisCache.get(deck.ratingKey)
      const nextAnalysis = this.preloadedDeck ? this.analysisCache.get(this.preloadedDeck.ratingKey) : null

      if (currentAnalysis) {
        const outroLen = currentAnalysis.audio_end_ms - currentAnalysis.outro_start_ms
        crossfadeMs = Math.min(outroLen > 500 ? outroLen : 2000, this.crossfadeWindowMs)
        crossfadeStartMs = Math.max(currentAnalysis.audio_end_ms - crossfadeMs, 0)
      } else {
        crossfadeStartMs = deck.durationMs - crossfadeMs
      }

      if (nextAnalysis && nextAnalysis.audio_start_ms > 50) {
        nextStartOffset = nextAnalysis.audio_start_ms / 1000
      }
    } else {
      crossfadeStartMs = deck.durationMs - crossfadeMs
    }

    const currentPositionMs = this.getDeckPositionMs(deck)
    const delayMs = crossfadeStartMs - currentPositionMs

    if (delayMs <= 0) {
      this.executeCrossfade(crossfadeMs, nextStartOffset)
      return
    }

    log("crossfade scheduled in", (delayMs / 1000).toFixed(1), "s, duration:", crossfadeMs, "ms")
    this.crossfadeTimer = setTimeout(() => {
      this.executeCrossfade(crossfadeMs, nextStartOffset)
    }, delayMs)
  }

  private scheduleGapless(): void {
    if (!this.activeDeck || !this.preloadedDeck || !this.ctx) return

    const deck = this.activeDeck
    const remainingMs = deck.durationMs - this.getDeckPositionMs(deck)

    if (remainingMs <= 0) {
      this.executeGapless()
      return
    }

    log("gapless scheduled in", (remainingMs / 1000).toFixed(1), "s")
    this.crossfadeTimer = setTimeout(() => {
      this.executeGapless()
    }, Math.max(remainingMs - 100, 0)) // Start 100ms early to minimize gap
  }

  private executeGapless(): void {
    if (!this.preloadedDeck) return
    log("executeGapless()")
    const prevDeck = this.activeDeck
    const nextDeck = this.preloadedDeck
    this.preloadedDeck = null
    const gen = this.playGeneration

    // Start next deck — fires onTrackStarted which advances the playerStore queue
    this.startDeck(nextDeck, gen)

    // Clean up previous deck + notify for scrobbling/progress reporting
    if (prevDeck) {
      this.cb?.onTrackEnded(prevDeck.ratingKey)
      this.destroyDeck(prevDeck)
    }
  }

  private executeCrossfade(durationMs: number, nextStartOffset = 0): void {
    if (!this.activeDeck || !this.preloadedDeck || !this.ctx) return

    log("executeCrossfade() duration:", durationMs, "ms, nextOffset:", nextStartOffset)
    this.isCrossfading = true
    const ctx = this.ctx
    const oldDeck = this.activeDeck
    const newDeck = this.preloadedDeck
    this.preloadedDeck = null
    const gen = this.playGeneration

    const fadeDurationSec = durationMs / 1000
    const now = ctx.currentTime

    // Build equal-power crossfade curves
    const steps = Math.max(2, Math.ceil(fadeDurationSec * 100)) // ~100 steps/sec
    const fadeOut = new Float32Array(steps)
    const fadeIn = new Float32Array(steps)
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      fadeOut[i] = Math.cos(t * Math.PI / 2)
      fadeIn[i] = Math.sin(t * Math.PI / 2)
    }

    // Apply normalization gain to fade curves
    const oldNormValue = oldDeck.normGain.gain.value
    const newNormValue = newDeck.normGain.gain.value
    for (let i = 0; i < steps; i++) {
      fadeOut[i] *= oldNormValue
      fadeIn[i] *= newNormValue
    }

    // Schedule fade-out on old deck
    oldDeck.normGain.gain.cancelScheduledValues(now)
    oldDeck.normGain.gain.setValueCurveAtTime(fadeOut, now, fadeDurationSec)

    // Start new deck and schedule fade-in
    if (nextStartOffset > 0) {
      newDeck.audio.currentTime = nextStartOffset
    }
    newDeck.normGain.gain.setValueAtTime(0, now)
    newDeck.normGain.gain.setValueCurveAtTime(fadeIn, now, fadeDurationSec)

    newDeck.audio.play().catch(() => {})

    // Track-started fires immediately for the new deck
    this.activeDeck = newDeck
    this.cb?.onTrackStarted(newDeck.ratingKey, newDeck.durationMs)

    // After fade completes, clean up old deck
    const cleanupGen = gen
    setTimeout(() => {
      this.isCrossfading = false
      if (this.playGeneration !== cleanupGen) return
      log("crossfade complete, cleaning up old deck ratingKey:", oldDeck.ratingKey)
      // Don't fire onTrackEnded here — the playerStore already advanced via onTrackStarted.
      // Firing it would cause a duplicate next() call and snowball skipping.
      this.destroyDeck(oldDeck)

      // Reschedule crossfade for the next track (if preloaded by now)
      this.scheduleCrossfade()
    }, durationMs + 100)
  }

  private cancelCrossfade(): void {
    if (this.crossfadeTimer !== null) {
      clearTimeout(this.crossfadeTimer)
      this.crossfadeTimer = null
    }
  }

  // ---------------------------------------------------------------------------
  // EQ
  // ---------------------------------------------------------------------------

  setEq(gainsDb: number[]): void {
    this.eqGains = [...gainsDb]
    if (!this.eqEnabled) return
    for (let i = 0; i < this.eqNodes.length && i < gainsDb.length; i++) {
      this.eqNodes[i].gain.value = gainsDb[i]
    }
  }

  setEqEnabled(enabled: boolean): void {
    log("setEqEnabled:", enabled)
    this.eqEnabled = enabled
    for (let i = 0; i < this.eqNodes.length; i++) {
      this.eqNodes[i].gain.value = enabled ? this.eqGains[i] : 0
    }
    if (this.postgainNode) {
      this.postgainNode.gain.value = this.dbToGain(enabled ? this.postgainDb : 0)
    }
  }

  setPreampGain(db: number): void {
    this.preampDb = db
    if (this.preampNode) {
      this.preampNode.gain.value = this.dbToGain(db)
    }
  }

  setEqPostgain(db: number): void {
    this.postgainDb = db
    if (this.postgainNode && this.eqEnabled) {
      this.postgainNode.gain.value = this.dbToGain(db)
    }
  }

  setEqPostgainAuto(auto: boolean): void {
    this.postgainAuto = auto
  }

  // ---------------------------------------------------------------------------
  // Crossfade settings
  // ---------------------------------------------------------------------------

  setCrossfadeWindow(ms: number): void {
    log("setCrossfadeWindow:", ms, "ms")
    this.crossfadeWindowMs = ms
  }

  setSameAlbumCrossfade(enabled: boolean): void {
    this.sameAlbumCrossfade = enabled
  }

  setSmartCrossfade(enabled: boolean): void {
    this.smartCrossfadeEnabled = enabled
  }

  setNormalizationEnabled(enabled: boolean): void {
    log("setNormalizationEnabled:", enabled)
    this.normalizationEnabled = enabled
    if (this.activeDeck) {
      const { gainDb } = this.activeDeck
      this.activeDeck.normGain.gain.value = enabled && gainDb != null ? this.dbToGain(gainDb) : 1
    }
  }

  // ---------------------------------------------------------------------------
  // Visualizer
  // ---------------------------------------------------------------------------

  setVisualizerEnabled(enabled: boolean): void {
    this.visEnabled = enabled
    if (enabled) {
      this.startVisLoop()
    } else {
      this.stopVisLoop()
    }
  }

  private startVisLoop(): void {
    if (this.visRafId !== null) return
    if (!this.analyserNode) return
    if (!this.visSamples) {
      this.visSamples = new Float32Array(this.analyserNode.fftSize)
    }
    const loop = () => {
      if (!this.visEnabled || !this.analyserNode) {
        this.visRafId = null
        return
      }
      this.analyserNode.getFloatTimeDomainData(this.visSamples!)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.cb?.onVisFrame?.(this.visSamples! as any)
      this.visRafId = requestAnimationFrame(loop)
    }
    this.visRafId = requestAnimationFrame(loop)
  }

  private stopVisLoop(): void {
    if (this.visRafId !== null) {
      cancelAnimationFrame(this.visRafId)
      this.visRafId = null
    }
  }

  // ---------------------------------------------------------------------------
  // Track Analysis (Web Worker)
  // ---------------------------------------------------------------------------

  /**
   * Wait for the active deck to finish buffering the full file before starting
   * preload + analysis downloads. Plex servers can't reliably handle multiple
   * concurrent stream connections, so we serialize all downloads.
   */
  private waitForBufferThenPreloadAndAnalyze(): void {
    const active = this.activeDeck
    if (!active) {
      this.flushPendingPreload()
      this.drainAnalysisQueue()
      return
    }
    const gen = this.playGeneration

    const isFullyBuffered = () => {
      const audio = active.audio
      if (!audio.duration || !isFinite(audio.duration)) return false
      const buf = audio.buffered
      if (buf.length === 0) return false
      return buf.end(buf.length - 1) >= audio.duration - 0.5
    }

    const fire = () => {
      log("active deck fully buffered, starting preload + analysis")
      this.flushPendingPreload()
      this.drainAnalysisQueue()
    }

    if (isFullyBuffered()) {
      fire()
      return
    }

    const onProgress = () => {
      if (this.playGeneration !== gen) { cleanup(); return }
      if (isFullyBuffered()) { cleanup(); fire() }
    }
    const onFail = () => { cleanup(); fire() }
    const cleanup = () => {
      active.audio.removeEventListener("progress", onProgress)
      active.audio.removeEventListener("ended", onFail)
      active.audio.removeEventListener("error", onFail)
    }

    active.audio.addEventListener("progress", onProgress)
    active.audio.addEventListener("ended", onFail)
    active.audio.addEventListener("error", onFail)
  }

  private flushPendingPreload(): void {
    if (this.pendingPreload) {
      const p = this.pendingPreload
      this.pendingPreload = null
      this.executePreload(p.url, p.ratingKey, p.durationMs, p.parentKey, p.gainDb, p.skipCrossfade)
    }
  }

  async analyzeTrack(url: string, ratingKey: number, durationMs: number): Promise<void> {
    if (this.analysisCache.has(ratingKey)) return
    if (!this.worker) return
    // Don't queue duplicates
    if (this.analysisQueue.some((q) => q.ratingKey === ratingKey)) return

    this.analysisQueue.push({ url, ratingKey, durationMs })
    log("analyzeTrack() queued ratingKey:", ratingKey, "queue length:", this.analysisQueue.length)
    // Don't auto-drain — the queue is drained after the active deck is fully buffered
    // to avoid competing for Plex connections. See waitForBufferThenPreloadAndAnalyze().
  }

  /** Wait for the preloaded deck to finish buffering (if any). */
  private waitForPreloadBuffered(): Promise<void> {
    const preloaded = this.preloadedDeck
    if (!preloaded) return Promise.resolve()
    const audio = preloaded.audio
    const isReady = () => {
      if (!audio.duration || !isFinite(audio.duration)) return false
      const buf = audio.buffered
      return buf.length > 0 && buf.end(buf.length - 1) >= audio.duration - 0.5
    }
    if (isReady()) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const gen = this.playGeneration
      const onProgress = () => {
        if (this.playGeneration !== gen || isReady()) { cleanup(); resolve() }
      }
      const onDone = () => { cleanup(); resolve() }
      const cleanup = () => {
        audio.removeEventListener("progress", onProgress)
        audio.removeEventListener("canplaythrough", onDone)
        audio.removeEventListener("ended", onDone)
        audio.removeEventListener("error", onDone)
      }
      audio.addEventListener("progress", onProgress)
      audio.addEventListener("canplaythrough", onDone)
      audio.addEventListener("ended", onDone)
      audio.addEventListener("error", onDone)
    })
  }

  private async fetchAndAnalyze(job: { url: string; ratingKey: number; durationMs: number }): Promise<boolean> {
    const ctx = this.ensureContext()
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 30_000)
    const response = await fetch(job.url, { signal: abort.signal })
    const arrayBuffer = await response.arrayBuffer()
    clearTimeout(timeout)

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    const mono = audioBuffer.getChannelData(0)
    const transferable = mono.buffer.slice(0) as ArrayBuffer
    this.worker?.postMessage(
      { samples: new Float32Array(transferable), sampleRate: audioBuffer.sampleRate, ratingKey: job.ratingKey, durationMs: job.durationMs },
      [transferable],
    )
    return true
  }

  private async drainAnalysisQueue(): Promise<void> {
    if (this.analysisRunning) return
    this.analysisRunning = true

    // Wait for the preloaded deck to finish downloading before using the connection
    await this.waitForPreloadBuffered()

    while (this.analysisQueue.length > 0) {
      const job = this.analysisQueue.shift()!
      if (this.analysisCache.has(job.ratingKey)) continue

      log("analyzeTrack() fetching ratingKey:", job.ratingKey)

      try {
        await this.fetchAndAnalyze(job)
      } catch (err) {
        warn("analyzeTrack() failed for ratingKey:", job.ratingKey, err, "— retrying in 2s")
        try {
          await new Promise((r) => setTimeout(r, 2000))
          await this.fetchAndAnalyze(job)
        } catch (retryErr) {
          warn("analyzeTrack() retry also failed for ratingKey:", job.ratingKey, retryErr)
        }
      }
    }

    this.analysisRunning = false
  }

  getTrackAnalysis(ratingKey: number): TrackAnalysis | null {
    return this.analysisCache.get(ratingKey) ?? null
  }

  // ---------------------------------------------------------------------------
  // Position polling
  // ---------------------------------------------------------------------------

  private pollPosition(): void {
    if (!this.activeDeck) return
    if (this.activeDeck.audio.paused && !this.activeDeck.audio.seeking) return

    const posMs = this.getDeckPositionMs(this.activeDeck)
    const durMs = this.activeDeck.durationMs
    this.cb?.onPosition(Math.min(posMs, durMs), durMs)
  }

  private getDeckPositionMs(deck: Deck): number {
    return deck.audio.currentTime * 1000
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private dbToGain(db: number): number {
    return Math.pow(10, db / 20)
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    log("destroy()")
    this.stop()
    this.cancelCrossfade()
    this.stopVisLoop()

    if (this.positionTimer !== null) {
      clearInterval(this.positionTimer)
      this.positionTimer = null
    }

    this.worker?.terminate()
    this.worker = null

    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
    }
  }
}

export const engine = new WebAudioEngine()
