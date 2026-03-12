/**
 * Web Audio API engine — Hibiki v3 architecture.
 *
 * Thin facade that delegates to modular engine internals:
 * - DeckManager: dual-deck orchestration with role swapping
 * - SignalChain: DSP block pipeline (preamp → EQ → postgain → limiter)
 * - Scheduler: event-driven transition timing
 * - AnalyserBridge: visualizer data delivery
 *
 * Node graph (per deck):
 *   HTMLAudioElement → MediaElementSource → normGain → fadeGain (output)
 *
 * Shared chain:
 *   [deck outputs] → preamp → EQ×10 → postgain → limiter → analyser → master → destination
 *
 * Key v3 improvements:
 * - Crossfade curves on fadeGain (not normGain) — no volume pumping
 * - Permanent dual-deck with reset() reuse — no GC pressure
 * - Modular DSP blocks — each stage is a standalone file
 *
 * Module-level singleton: `import { engine } from "../audio/WebAudioEngine"`
 */

import { getAudioContext, closeAudioContext } from "./engine/context"
import { DeckManager } from "./engine/deckManager"
import { SignalChain } from "./engine/signalChain"
import { AnalyserBridge } from "./engine/analyserBridge"
import { Scheduler } from "./engine/scheduler"
import { createPreamp } from "./engine/dsp/preamp"
import { createEqualizer } from "./engine/dsp/equalizer"
import { createPostgain } from "./engine/dsp/postgain"
import { createLimiter } from "./engine/dsp/limiter"
import { shouldSuppressCrossfade } from "./engine/crossfade/albumAware"
import { computeMixrampTransition, mixrampInterpolate } from "./engine/crossfade/mixramp"
import { computeTimedTransition } from "./engine/crossfade/timeBased"
import { generateFadeOut, generateFadeIn } from "./engine/crossfade/curves"
import type { TransitionPlan } from "./engine/crossfade/types"

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

const DEBUG = import.meta.env.DEV

function log(...args: unknown[]): void {
  if (DEBUG) console.log("[WebAudio]", ...args)
}

function warn(...args: unknown[]): void {
  if (DEBUG) console.warn("[WebAudio]", ...args)
}

// ---------------------------------------------------------------------------
// Types (public API — unchanged)
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
// Helpers
// ---------------------------------------------------------------------------

function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class WebAudioEngine {
  // Core engine components
  private ctx: AudioContext | null = null
  private deckManager: DeckManager | null = null
  private signalChain: SignalChain | null = null
  private analyser: AnalyserBridge | null = null
  private scheduler: Scheduler | null = null
  private masterNode: GainNode | null = null

  // DSP blocks
  private preamp: ReturnType<typeof createPreamp> | null = null
  private equalizer: ReturnType<typeof createEqualizer> | null = null
  private postgain: ReturnType<typeof createPostgain> | null = null
  private limiter: ReturnType<typeof createLimiter> | null = null

  // Callbacks
  private cb: AudioEngineCallbacks | null = null

  // Settings
  private eqEnabled = false
  private eqGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  private preampDb = 0
  private postgainDb = 0
  private normalizationEnabled = true
  private crossfadeWindowMs = 4000
  private sameAlbumCrossfadeEnabled = false
  private smartCrossfadeEnabled = true
  private smartCrossfadeMaxMs = 20000
  private mixrampDb = -17
  private volume = 1.0
  private skipCrossfadeMs = 500 // short duck for user-initiated skips
  private visualizerDesired = false

  // Ramp cache
  private rampCache = new Map<number, TrackRamps>()

  // Deferred preload
  private pendingPreload: {
    url: string; ratingKey: number; durationMs: number; parentKey: string
    gainDb: number | null; skipCrossfade: boolean
    startRamp: string | null; endRamp: string | null
  } | null = null

  // Preload retry
  private preloadRetried = false

  // Play generation (monotonic counter for stale callback protection)
  private playGeneration = 0

  // Position polling
  private positionTimer: ReturnType<typeof setInterval> | null = null

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  init(callbacks: AudioEngineCallbacks): void {
    log("init()")
    this.cb = callbacks
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
    this.ctx = getAudioContext()

    // Create DSP blocks
    this.preamp = createPreamp(this.ctx)
    this.preamp.setGain(this.preampDb)

    this.equalizer = createEqualizer(this.ctx)
    this.equalizer.enabled = this.eqEnabled
    if (this.eqEnabled) {
      this.equalizer.setGains(this.eqGains)
    }

    this.postgain = createPostgain(this.ctx)
    this.postgain.setGain(this.eqEnabled ? this.postgainDb : 0)

    this.limiter = createLimiter(this.ctx)

    // Create analyser & master
    this.analyser = new AnalyserBridge(this.ctx)
    this.masterNode = this.ctx.createGain()
    this.masterNode.gain.value = this.volume

    // Build signal chain
    this.signalChain = new SignalChain()
    this.signalChain.setBlocks([this.preamp, this.equalizer, this.postgain, this.limiter])
    this.signalChain.setDestination(this.analyser.node)

    // Connect analyser → master → destination
    this.analyser.node.connect(this.masterNode)
    this.masterNode.connect(this.ctx.destination)

    // Apply deferred visualizer enablement
    if (this.visualizerDesired) {
      this.analyser.setEnabled(true, (samples) => {
        this.cb?.onVisFrame?.(samples)
      })
    }

    // Create deck manager
    this.deckManager = new DeckManager(this.ctx)
    this.setupDeckManagerCallbacks()

    // Connect active deck output to signal chain
    this.signalChain.setSource(this.deckManager.getActiveOutput())

    // Create scheduler
    this.scheduler = new Scheduler()
    this.scheduler.setCallbacks({
      onTransitionPoint: () => this.handleTransitionPoint(),
      onGaplessPoint: () => this.handleGaplessPoint(),
    })

    // Start position polling
    this.positionTimer = setInterval(() => this.pollPosition(), 250)

    log("AudioContext created, sample rate:", this.ctx.sampleRate)
    return this.ctx
  }

  private setupDeckManagerCallbacks(): void {
    if (!this.deckManager) return

    this.deckManager.setCallbacks({
      onActiveTrackStarted: (ratingKey, durationMs) => {
        this.cb?.onTrackStarted(ratingKey, durationMs)
      },
      onActiveTrackEnded: (ratingKey) => {
        this.cb?.onTrackEnded(ratingKey)
      },
      onState: (state) => {
        this.cb?.onState(state)
      },
      onError: (message) => {
        warn("deck error:", message)
        this.cb?.onError(message)
      },
      onTimeUpdate: (currentTimeSec, durationSec) => {
        // Feed time updates to scheduler for transition detection
        this.scheduler?.onTimeUpdate(currentTimeSec, durationSec)
      },
      onActiveBuffered: () => {
        log("active deck fully buffered")
        this.flushPendingPreload()
      },
      onActiveDurationCorrected: (_newDurationMs) => {
        // Reschedule transition with corrected duration
        this.scheduleTransition()
      },
    })
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
    const gen = ++this.playGeneration
    this.pendingPreload = null
    log("play() ratingKey:", ratingKey, "url:", url.slice(0, 80))

    // Cache ramps if provided
    if (startRamp || endRamp) {
      this.parseAndCacheRamps(ratingKey, startRamp ?? null, endRamp ?? null)
    }

    this.ensureContext()
    const dm = this.deckManager!

    // Check if the pending deck matches (already preloaded)
    if (dm.pendingDeck.loaded && dm.pendingDeck.ratingKey === ratingKey) {
      log("using preloaded deck for ratingKey:", ratingKey)
      const deck = dm.pendingDeck
      deck.gainDb = gainDb
      deck.skipCrossfade = skipCrossfade ?? false
      deck.setNormGain(this.normalizationEnabled && gainDb != null ? dbToGain(gainDb) : 1)
      this.transitionToPreloaded(gen, true)
      return
    }

    this.cb?.onState("buffering")

    // Reset pending deck and load new track into it
    const deck = dm.pendingDeck
    deck.reset()
    this.loadTrackIntoDeck(deck, url, ratingKey, durationMs, parentKey, gainDb, skipCrossfade ?? false, startRamp ?? null, endRamp ?? null)

    this.transitionToPreloaded(gen, true)
  }

  private loadTrackIntoDeck(
    deck: import("./engine/deck").Deck,
    url: string,
    ratingKey: number,
    durationMs: number,
    parentKey: string,
    gainDb: number | null,
    skipCrossfade: boolean,
    startRamp: string | null,
    endRamp: string | null,
  ): void {
    deck.ratingKey = ratingKey
    deck.durationMs = durationMs
    deck.parentKey = parentKey
    deck.gainDb = gainDb
    deck.skipCrossfade = skipCrossfade
    deck.ramps = this.parseAndCacheRamps(ratingKey, startRamp, endRamp)
    deck.setNormGain(this.normalizationEnabled && gainDb != null ? dbToGain(gainDb) : 1)
    deck.load(url)
  }

  private transitionToPreloaded(gen: number, userSkip = false): void {
    const dm = this.deckManager!
    const pendingDeck = dm.pendingDeck
    const activeDeck = dm.activeDeck

    // Cancel any pending transition
    this.scheduler?.reset()
    dm.cancelTransition()

    const hasCrossfade = this.smartCrossfadeEnabled ? this.smartCrossfadeMaxMs > 0 : this.crossfadeWindowMs > 0
    const shouldXfade = !pendingDeck.skipCrossfade
      && hasCrossfade
      && activeDeck.loaded
      && !shouldSuppressCrossfade(activeDeck.parentKey, pendingDeck.parentKey, this.sameAlbumCrossfadeEnabled)

    if (shouldXfade && activeDeck.loaded) {
      // User skips (next/prev/click) get a short duck, not the full smart crossfade
      const plan = userSkip
        ? this.computeSkipDuckPlan()
        : this.computeTransitionPlan()
      if (plan) {
        log(userSkip ? "skip duck" : "crossfade", "transition to ratingKey:", pendingDeck.ratingKey)
        this.executeTransition(plan)
        return
      }
    }

    // Hard transition: stop active, start pending
    log("hard transition to ratingKey:", pendingDeck.ratingKey)
    const prevRatingKey = activeDeck.loaded ? activeDeck.ratingKey : 0
    activeDeck.reset()

    // Swap roles: pending becomes active
    dm.swapRoles()

    // Connect new active deck to signal chain
    this.signalChain?.setSource(dm.getActiveOutput())

    // Attach events and start playback
    dm.attachActiveEvents(gen, () => this.playGeneration)
    this.cb?.onTrackStarted(dm.activeDeck.ratingKey, dm.activeDeck.durationMs)

    dm.activeDeck.play().then(() => {
      if (this.playGeneration !== gen) return
      this.cb?.onState("playing")
      this.waitForBufferThenPreload()
    }).catch((err) => {
      if (this.playGeneration !== gen) return
      warn("play() rejected:", err)
    })

    if (prevRatingKey) {
      // Don't fire onTrackEnded for hard transitions triggered by play()
      // — the old track was replaced, not naturally ended
    }

    // Schedule transition to next preloaded track
    this.scheduleTransition()
  }

  pause(): void {
    if (this.deckManager?.activeDeck.loaded) {
      log("pause()")
      this.deckManager.activeDeck.pause()
      this.cb?.onState("paused")
    }
  }

  resume(): void {
    if (this.deckManager?.activeDeck.loaded) {
      log("resume()")
      this.deckManager.activeDeck.play().catch(() => {})
      this.cb?.onState("playing")
    }
  }

  stop(): void {
    log("stop()")
    this.scheduler?.reset()
    this.pendingPreload = null
    ++this.playGeneration

    if (this.deckManager) {
      this.deckManager.stopAll()
    }

    this.signalChain?.disconnectAdditionalSources()

    // Don't fire onTrackEnded — stop() is a user action, not a natural track end.
    this.cb?.onState("stopped")
  }

  seek(positionMs: number): void {
    if (!this.deckManager?.activeDeck.loaded) return
    const sec = Math.max(0, positionMs / 1000)
    log("seek() to", sec.toFixed(1), "s")
    this.deckManager.activeDeck.seekTo(sec)

    // Reschedule transition from new position
    this.scheduler?.reset()
    this.scheduleTransition()
  }

  setVolume(gain: number): void {
    this.volume = gain
    if (this.masterNode) {
      this.masterNode.gain.value = gain
    }
  }

  // ---------------------------------------------------------------------------
  // Preloading
  // ---------------------------------------------------------------------------

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
    if (!this.deckManager) return

    // Don't preload if already preloaded for this track
    if (this.deckManager.pendingDeck.loaded && this.deckManager.pendingDeck.ratingKey === ratingKey) return

    // Defer preload until the active deck is actually playing
    if (this.deckManager.activeDeck.loaded && !this.deckManager.activeDeck.hasStartedPlaying) {
      log("preloadNext() deferred until deck playing, ratingKey:", ratingKey)
      this.pendingPreload = {
        url, ratingKey, durationMs, parentKey, gainDb,
        skipCrossfade: skipCrossfade ?? false,
        startRamp: startRamp ?? null, endRamp: endRamp ?? null,
      }
      return
    }

    this.executePreload(url, ratingKey, durationMs, parentKey, gainDb, skipCrossfade ?? false, startRamp ?? null, endRamp ?? null)
  }

  private executePreload(
    url: string,
    ratingKey: number,
    durationMs: number,
    parentKey: string,
    gainDb: number | null,
    skipCrossfade: boolean,
    startRamp: string | null,
    endRamp: string | null,
  ): void {
    log("executePreload() ratingKey:", ratingKey)
    this.ensureContext()
    this.preloadRetried = false

    const dm = this.deckManager!
    const deck = dm.pendingDeck
    deck.reset()

    this.loadTrackIntoDeck(deck, url, ratingKey, durationMs, parentKey, gainDb, skipCrossfade, startRamp, endRamp)

    // Watch for preload errors and retry once after 2s
    const onPreloadError = () => {
      deck.audio.removeEventListener("error", onPreloadError)
      if (!dm.pendingDeck.loaded || dm.pendingDeck.ratingKey !== ratingKey) return
      if (this.preloadRetried) {
        warn("preload retry also failed for ratingKey:", ratingKey)
        return
      }
      this.preloadRetried = true
      warn("preload error for ratingKey:", ratingKey, "— retrying in 2s")
      deck.reset()
      setTimeout(() => {
        if (dm.pendingDeck.loaded) return
        log("preload retry for ratingKey:", ratingKey)
        this.loadTrackIntoDeck(dm.pendingDeck, url, ratingKey, durationMs, parentKey, gainDb, skipCrossfade, startRamp, endRamp)
        this.scheduleTransition()
      }, 2000)
    }
    deck.audio.addEventListener("error", onPreloadError)

    // Reschedule transition now that we have a preloaded deck
    this.scheduleTransition()
  }

  // ---------------------------------------------------------------------------
  // Transition scheduling
  // ---------------------------------------------------------------------------

  private scheduleTransition(): void {
    if (!this.deckManager || !this.scheduler) return
    const dm = this.deckManager
    const activeDeck = dm.activeDeck
    const pendingDeck = dm.pendingDeck

    if (!activeDeck.loaded || !pendingDeck.loaded) return

    this.scheduler.reset()

    const effectiveWindowMs = this.smartCrossfadeEnabled ? this.smartCrossfadeMaxMs : this.crossfadeWindowMs
    const suppress = shouldSuppressCrossfade(
      activeDeck.parentKey, pendingDeck.parentKey, this.sameAlbumCrossfadeEnabled,
    )

    if (effectiveWindowMs <= 0 || suppress || pendingDeck.skipCrossfade) {
      // Gapless mode
      this.scheduler.setMode("gapless")
      this.scheduler.setTransitionPoint(activeDeck.durationMs / 1000)
      return
    }

    // Crossfade mode
    this.scheduler.setMode("crossfade")
    const plan = this.computeTransitionPlan()
    if (plan) {
      this.scheduler.setTransitionPoint(plan.startTimeSeconds)
    }
  }

  private computeTransitionPlan(): TransitionPlan | null {
    if (!this.deckManager) return null
    const activeDeck = this.deckManager.activeDeck
    const pendingDeck = this.deckManager.pendingDeck

    if (!activeDeck.loaded || !pendingDeck.loaded) return null

    const outDurationSec = activeDeck.durationMs / 1000
    const outEndRamp = (activeDeck.ramps ?? this.rampCache.get(activeDeck.ratingKey))?.endRamp
    const inStartRamp = (pendingDeck.ramps ?? this.rampCache.get(pendingDeck.ratingKey))?.startRamp

    const params = {
      outDurationSec,
      outParentKey: activeDeck.parentKey,
      inParentKey: pendingDeck.parentKey,
      outEndRamp,
      inStartRamp,
      crossfadeWindowMs: this.crossfadeWindowMs,
      smartCrossfadeMaxMs: this.smartCrossfadeMaxMs,
      mixrampDb: this.mixrampDb,
      smartCrossfadeEnabled: this.smartCrossfadeEnabled,
      sameAlbumCrossfade: this.sameAlbumCrossfadeEnabled,
    }

    if (this.smartCrossfadeEnabled) {
      // Try MixRamp first, falls back to timed internally
      return computeMixrampTransition(params)
    }

    return computeTimedTransition(params)
  }

  /**
   * Short equal-power crossfade for user-initiated skips (next/prev/click).
   * Immediately ducks the outgoing track instead of using the full smart crossfade.
   */
  private computeSkipDuckPlan(): TransitionPlan | null {
    const durationSec = this.skipCrossfadeMs / 1000
    const steps = Math.max(2, Math.ceil(durationSec * 100))
    return {
      startTimeSeconds: 0, // immediate
      durationSeconds: durationSec,
      fadeOutCurve: generateFadeOut(steps),
      fadeInCurve: generateFadeIn(steps),
    }
  }

  private handleTransitionPoint(): void {
    log("transition point reached")
    const plan = this.computeTransitionPlan()
    if (plan) {
      this.executeTransition(plan)
    }
  }

  private handleGaplessPoint(): void {
    log("gapless point reached")
    if (!this.deckManager || !this.deckManager.pendingDeck.loaded) return

    const dm = this.deckManager
    const gen = this.playGeneration

    // Connect pending deck output to signal chain during overlap
    this.signalChain?.connectAdditionalSource(dm.getPendingOutput())

    dm.gaplessTransition()

    // Reconnect signal chain to new active deck
    this.signalChain?.disconnectAdditionalSources()
    this.signalChain?.setSource(dm.getActiveOutput())

    // Re-attach events
    dm.attachActiveEvents(gen, () => this.playGeneration)

    // Schedule next transition
    this.scheduleTransition()

    // Start deferred preload if needed
    this.waitForBufferThenPreload()
  }

  private executeTransition(plan: TransitionPlan): void {
    if (!this.deckManager || !this.signalChain) return
    const dm = this.deckManager
    const gen = this.playGeneration

    log("executeTransition() duration:", (plan.durationSeconds * 1000).toFixed(0), "ms")

    // Connect pending deck output to signal chain for overlap
    this.signalChain.connectAdditionalSource(dm.getPendingOutput())

    // Execute the transition (applies gain curves to fadeGain nodes)
    dm.transition(plan)

    // After transition: reconnect signal chain to new active deck
    const durationMs = plan.durationSeconds * 1000
    setTimeout(() => {
      if (this.playGeneration !== gen) return

      this.signalChain?.disconnectAdditionalSources()
      this.signalChain?.setSource(dm.getActiveOutput())

      // Re-attach events to new active deck
      dm.attachActiveEvents(gen, () => this.playGeneration)

      // Schedule next transition
      this.scheduleTransition()

      // Start deferred preload
      this.waitForBufferThenPreload()
    }, durationMs + 100)
  }

  // ---------------------------------------------------------------------------
  // Deferred preload
  // ---------------------------------------------------------------------------

  private waitForBufferThenPreload(): void {
    if (!this.deckManager) {
      this.flushPendingPreload()
      return
    }
    const activeDeck = this.deckManager.activeDeck
    if (!activeDeck.loaded) {
      this.flushPendingPreload()
      return
    }

    if (activeDeck.isFullyBuffered()) {
      log("active deck already fully buffered")
      this.flushPendingPreload()
    }
    // Otherwise, DeckManager's onActiveBuffered callback will call flushPendingPreload
  }

  private flushPendingPreload(): void {
    if (this.pendingPreload) {
      const p = this.pendingPreload
      this.pendingPreload = null
      this.executePreload(p.url, p.ratingKey, p.durationMs, p.parentKey, p.gainDb, p.skipCrossfade, p.startRamp, p.endRamp)
    }
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

  getMixrampOverlap(endRamp: RampPoint[], startRamp: RampPoint[]): { endOverlapSec: number; startOverlapSec: number } | null {
    const endOverlapSec = mixrampInterpolate(endRamp, this.mixrampDb)
    const startOverlapSec = mixrampInterpolate(startRamp, this.mixrampDb)
    if (endOverlapSec < 0 || startOverlapSec < 0) return null
    return { endOverlapSec, startOverlapSec }
  }

  // ---------------------------------------------------------------------------
  // EQ
  // ---------------------------------------------------------------------------

  setEq(gainsDb: number[]): void {
    this.eqGains = [...gainsDb]
    if (!this.eqEnabled) return
    this.equalizer?.setGains(gainsDb)
  }

  setEqEnabled(enabled: boolean): void {
    log("setEqEnabled:", enabled)
    this.eqEnabled = enabled
    if (this.equalizer) {
      this.equalizer.enabled = enabled
      this.equalizer.setGains(enabled ? this.eqGains : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      // Rebuild signal chain to connect/disconnect EQ
      this.signalChain?.rebuild()
    }
    this.postgain?.setGain(enabled ? this.postgainDb : 0)
  }

  setPreampGain(db: number): void {
    this.preampDb = db
    this.preamp?.setGain(db)
  }

  setEqPostgain(db: number): void {
    this.postgainDb = db
    if (this.eqEnabled) {
      this.postgain?.setGain(db)
    }
  }

  /**
   * Brief volume duck to mask EQ filter transients.
   * Ramps master to 0 over duckMs, calls the callback, then ramps back up.
   */
  duckAndApply(fn: () => void, duckMs = 30): void {
    if (!this.masterNode || !this.ctx) {
      fn()
      return
    }
    const gain = this.masterNode.gain
    const now = this.ctx.currentTime
    const duckSec = duckMs / 1000
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + duckSec)

    setTimeout(() => {
      fn()
      const resumeTime = this.ctx!.currentTime
      gain.cancelScheduledValues(resumeTime)
      gain.setValueAtTime(0, resumeTime)
      gain.linearRampToValueAtTime(this.volume, resumeTime + duckSec)
    }, duckMs)
  }

  // ---------------------------------------------------------------------------
  // Crossfade settings
  // ---------------------------------------------------------------------------

  setCrossfadeWindow(ms: number): void {
    log("setCrossfadeWindow:", ms, "ms")
    this.crossfadeWindowMs = ms
  }

  setSameAlbumCrossfade(enabled: boolean): void {
    this.sameAlbumCrossfadeEnabled = enabled
  }

  setSmartCrossfade(enabled: boolean): void {
    this.smartCrossfadeEnabled = enabled
  }

  setSmartCrossfadeMax(ms: number): void {
    log("setSmartCrossfadeMax:", ms, "ms")
    this.smartCrossfadeMaxMs = ms
  }

  setMixrampDb(db: number): void {
    log("setMixrampDb:", db, "dB")
    this.mixrampDb = db
  }

  setNormalizationEnabled(enabled: boolean): void {
    log("setNormalizationEnabled:", enabled)
    this.normalizationEnabled = enabled
    if (this.deckManager?.activeDeck.loaded) {
      const { gainDb } = this.deckManager.activeDeck
      this.deckManager.activeDeck.setNormGain(
        enabled && gainDb != null ? dbToGain(gainDb) : 1,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Visualizer
  // ---------------------------------------------------------------------------

  setVisualizerEnabled(enabled: boolean): void {
    this.visualizerDesired = enabled
    if (this.analyser) {
      this.analyser.setEnabled(enabled, (samples) => {
        this.cb?.onVisFrame?.(samples)
      })
    }
  }

  /** Expose hardware-accelerated FFT frequency data from the AnalyserNode. */
  getFrequencyData(): Float32Array | null {
    return this.analyser?.getFrequencyData() ?? null
  }

  /** Return the AudioContext sample rate (needed for correct FFT bin mapping). */
  getSampleRate(): number {
    return this.ctx?.sampleRate ?? 44100
  }


  // ---------------------------------------------------------------------------
  // Position polling
  // ---------------------------------------------------------------------------

  private pollPosition(): void {
    if (!this.deckManager?.activeDeck.loaded) return
    const deck = this.deckManager.activeDeck
    if (deck.paused) return

    const posMs = deck.getCurrentTime() * 1000
    const durMs = deck.durationMs
    this.cb?.onPosition(Math.min(posMs, durMs), durMs)
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    log("destroy()")
    this.stop()

    if (this.positionTimer !== null) {
      clearInterval(this.positionTimer)
      this.positionTimer = null
    }

    this.analyser?.dispose()
    this.signalChain?.dispose()
    this.deckManager?.dispose()
    this.preamp?.dispose()
    this.equalizer?.dispose()
    this.postgain?.dispose()
    this.limiter?.dispose()

    this.analyser = null
    this.signalChain = null
    this.deckManager = null
    this.scheduler = null
    this.preamp = null
    this.equalizer = null
    this.postgain = null
    this.limiter = null
    this.masterNode = null

    closeAudioContext()
    this.ctx = null
  }
}

export const engine = new WebAudioEngine()
