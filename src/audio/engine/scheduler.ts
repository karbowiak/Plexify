const DEBUG = import.meta.env.DEV
function log(...args: unknown[]): void {
  if (DEBUG) console.log("[Scheduler]", ...args)
}

export type SchedulerMode = "gapless" | "crossfade"

export interface SchedulerCallbacks {
  onTransitionPoint: () => void
  onGaplessPoint: () => void
}

/**
 * Event-driven transition timing.
 * Determines when to trigger crossfade or gapless transition based on
 * timeupdate events from the active deck, replacing setTimeout-based scheduling.
 */
export class Scheduler {
  private mode: SchedulerMode = "gapless"
  private transitionTimeSec = -1
  private gaplessLeadTimeSec = 0.1 // Start gapless 100ms early to minimize gap
  private fired = false
  private callbacks: SchedulerCallbacks | null = null

  setCallbacks(cb: SchedulerCallbacks): void {
    this.callbacks = cb
  }

  setMode(mode: SchedulerMode): void {
    this.mode = mode
  }

  /**
   * Set the absolute time (in seconds) at which to trigger the transition.
   * For crossfade: this is outDuration - crossfadeDuration.
   * For gapless: this is outDuration - lead time.
   */
  setTransitionPoint(timeSec: number): void {
    this.transitionTimeSec = timeSec
    this.fired = false
    log("transition point set:", timeSec.toFixed(2), "s, mode:", this.mode)
  }

  /**
   * Called on every timeupdate from the active deck.
   * Fires the appropriate callback when the trigger point is reached.
   */
  onTimeUpdate(currentTimeSec: number, durationSec: number): void {
    if (this.fired) return
    if (this.transitionTimeSec < 0) return

    if (this.mode === "crossfade") {
      if (currentTimeSec >= this.transitionTimeSec) {
        this.fired = true
        log("crossfade point reached at", currentTimeSec.toFixed(2), "s")
        this.callbacks?.onTransitionPoint()
      }
    } else {
      // Gapless: trigger slightly before end
      const triggerTime = durationSec - this.gaplessLeadTimeSec
      if (currentTimeSec >= triggerTime && triggerTime > 0) {
        this.fired = true
        log("gapless point reached at", currentTimeSec.toFixed(2), "s")
        this.callbacks?.onGaplessPoint()
      }
    }
  }

  reset(): void {
    this.transitionTimeSec = -1
    this.fired = false
  }

  get hasFired(): boolean {
    return this.fired
  }
}
