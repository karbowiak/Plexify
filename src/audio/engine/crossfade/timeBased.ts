import type { CrossfadeParams, TransitionPlan } from "./types"
import { generateFadeOut, generateFadeIn } from "./curves"

/**
 * Fixed-duration equal-power crossfade strategy.
 * Used when smart crossfade is off, or as fallback when MixRamp fails.
 */
export function computeTimedTransition(params: CrossfadeParams): TransitionPlan | null {
  const durationMs = params.smartCrossfadeEnabled
    ? params.smartCrossfadeMaxMs
    : params.crossfadeWindowMs

  if (durationMs <= 0) return null

  const durationSec = durationMs / 1000
  const startTimeSeconds = params.outDurationSec - durationSec
  const steps = Math.max(2, Math.ceil(durationSec * 100))

  return {
    startTimeSeconds: Math.max(0, startTimeSeconds),
    durationSeconds: durationSec,
    fadeOutCurve: generateFadeOut(steps),
    fadeInCurve: generateFadeIn(steps),
  }
}
