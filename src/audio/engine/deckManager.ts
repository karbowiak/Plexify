import { Deck, type DeckEvents } from "./deck"
import type { TransitionPlan } from "./crossfade/types"

const DEBUG = import.meta.env.DEV
function log(...args: unknown[]): void {
  if (DEBUG) console.log("[DeckManager]", ...args)
}

export interface DeckManagerCallbacks {
  onActiveTrackStarted: (ratingKey: number, durationMs: number) => void
  onActiveTrackEnded: (ratingKey: number) => void
  onState: (state: "playing" | "paused" | "buffering" | "stopped") => void
  onError: (message: string) => void
  onTimeUpdate: (currentTimeSec: number, durationSec: number) => void
  onActiveBuffered: () => void
  onActiveDurationCorrected: (newDurationMs: number) => void
}

/**
 * Manages dual decks with role swapping.
 * activeDeck = currently playing; pendingDeck = preloaded next track.
 * Decks are reused via reset(), never destroyed/recreated.
 */
export class DeckManager {
  readonly deckA: Deck
  readonly deckB: Deck
  private _activeDeck: Deck
  private _pendingDeck: Deck
  private callbacks: DeckManagerCallbacks | null = null
  private transitionTimer: ReturnType<typeof setTimeout> | null = null
  private isCrossfading = false

  constructor(ctx: AudioContext) {
    this.deckA = new Deck(ctx)
    this.deckB = new Deck(ctx)
    this._activeDeck = this.deckA
    this._pendingDeck = this.deckB
  }

  get activeDeck(): Deck { return this._activeDeck }
  get pendingDeck(): Deck { return this._pendingDeck }

  setCallbacks(cb: DeckManagerCallbacks): void {
    this.callbacks = cb
  }

  getActiveOutput(): AudioNode {
    return this._activeDeck.getOutputNode()
  }

  getPendingOutput(): AudioNode {
    return this._pendingDeck.getOutputNode()
  }

  /**
   * Attach event listeners to the active deck that forward to callbacks.
   */
  attachActiveEvents(gen: number, playGeneration: () => number): void {
    const deck = this._activeDeck
    const events: DeckEvents = {
      onPlaying: () => {
        if (playGeneration() !== gen) return
        if (deck === this._activeDeck) {
          this.callbacks?.onState("playing")
          // Check if buffered
          if (deck.isFullyBuffered()) {
            this.callbacks?.onActiveBuffered()
          }
        }
      },
      onWaiting: () => {
        if (playGeneration() !== gen) return
        if (deck === this._activeDeck) {
          this.callbacks?.onState("buffering")
        }
      },
      onEnded: () => {
        if (playGeneration() !== gen) return
        if (this.isCrossfading) return
        if (deck === this._activeDeck) {
          this.callbacks?.onActiveTrackEnded(deck.ratingKey)
          this.callbacks?.onState("stopped")
        }
      },
      onError: (message) => {
        if (playGeneration() !== gen) return
        this.callbacks?.onError(message)
      },
      onLoadedMetadata: (durationSec) => {
        if (playGeneration() !== gen) return
        if (deck !== this._activeDeck) return
        const realDurMs = durationSec * 1000
        if (Math.abs(realDurMs - deck.durationMs) > 500) {
          log("duration corrected:", deck.durationMs, "→", realDurMs)
          deck.durationMs = realDurMs
          this.callbacks?.onActiveDurationCorrected(realDurMs)
        }
      },
      onTimeUpdate: (currentTime, duration) => {
        if (playGeneration() !== gen) return
        if (deck === this._activeDeck) {
          this.callbacks?.onTimeUpdate(currentTime, duration)
        }
      },
    }

    // Also listen for buffer progress
    const onProgress = () => {
      if (playGeneration() !== gen) return
      if (deck === this._activeDeck && deck.isFullyBuffered()) {
        deck.audio.removeEventListener("progress", onProgress)
        this.callbacks?.onActiveBuffered()
      }
    }
    deck.audio.addEventListener("progress", onProgress)

    deck.attachEvents(events)
  }

  /**
   * Execute a transition with gain curves on fadeGain nodes.
   */
  transition(plan: TransitionPlan): void {
    const oldDeck = this._activeDeck
    const newDeck = this._pendingDeck

    if (!newDeck.loaded) {
      log("transition aborted — pending deck not loaded")
      return
    }

    log("transition start, old:", oldDeck.ratingKey, "new:", newDeck.ratingKey)
    this.isCrossfading = true

    const ctx = oldDeck.fadeGain.context as AudioContext
    const now = ctx.currentTime
    const durationSec = plan.durationSeconds

    if (plan.nextStartOffset && plan.nextStartOffset > 0) {
      newDeck.seekTo(plan.nextStartOffset)
    }

    if (plan.fadeOutCurve && plan.fadeInCurve) {
      // Equal-power crossfade: apply curves to fadeGain (not normGain!)
      oldDeck.fadeGain.gain.cancelScheduledValues(now)
      oldDeck.fadeGain.gain.setValueCurveAtTime(plan.fadeOutCurve, now, durationSec)

      newDeck.fadeGain.gain.setValueAtTime(0, now)
      newDeck.fadeGain.gain.setValueCurveAtTime(plan.fadeInCurve, now, durationSec)
    }
    // else: MixRamp — both fadeGains stay at 1.0, just overlap

    newDeck.play().catch(() => {})

    // Swap roles: new deck becomes active
    this._activeDeck = newDeck
    this._pendingDeck = oldDeck

    this.callbacks?.onActiveTrackStarted(newDeck.ratingKey, newDeck.durationMs)

    // After transition completes, clean up old deck
    this.transitionTimer = setTimeout(() => {
      this.isCrossfading = false
      log("transition complete, cleaning up old deck:", oldDeck.ratingKey)
      this.callbacks?.onActiveTrackEnded(oldDeck.ratingKey)
      oldDeck.reset()
    }, durationSec * 1000 + 100)
  }

  /**
   * Cancel an in-progress transition. Reset gain automation, swap back.
   */
  cancelTransition(): void {
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer)
      this.transitionTimer = null
    }
    if (this.isCrossfading) {
      this.isCrossfading = false
      // Ramp fadeGains to 1.0 over 5ms instead of jumping to avoid pop
      const ctx = this._activeDeck.fadeGain.context as AudioContext
      const now = ctx.currentTime
      this._activeDeck.fadeGain.gain.cancelScheduledValues(now)
      this._activeDeck.fadeGain.gain.setValueAtTime(this._activeDeck.fadeGain.gain.value, now)
      this._activeDeck.fadeGain.gain.linearRampToValueAtTime(1, now + 0.005)
      this._pendingDeck.fadeGain.gain.cancelScheduledValues(now)
      this._pendingDeck.fadeGain.gain.setValueAtTime(this._pendingDeck.fadeGain.gain.value, now)
      this._pendingDeck.fadeGain.gain.linearRampToValueAtTime(1, now + 0.005)
    }
  }

  /**
   * Gapless transition: no gain curves, just swap decks.
   */
  gaplessTransition(): void {
    const oldDeck = this._activeDeck
    const newDeck = this._pendingDeck

    if (!newDeck.loaded) {
      log("gapless aborted — pending deck not loaded")
      return
    }

    log("gapless transition, old:", oldDeck.ratingKey, "new:", newDeck.ratingKey)

    newDeck.play().catch(() => {})

    // Swap roles
    this._activeDeck = newDeck
    this._pendingDeck = oldDeck

    this.callbacks?.onActiveTrackStarted(newDeck.ratingKey, newDeck.durationMs)
    this.callbacks?.onActiveTrackEnded(oldDeck.ratingKey)

    oldDeck.reset()
  }

  swapRoles(): void {
    const tmp = this._activeDeck
    this._activeDeck = this._pendingDeck
    this._pendingDeck = tmp
  }

  stopAll(): void {
    this.cancelTransition()
    this._activeDeck.reset()
    this._pendingDeck.reset()
  }

  dispose(): void {
    this.cancelTransition()
    this.deckA.dispose()
    this.deckB.dispose()
  }
}
