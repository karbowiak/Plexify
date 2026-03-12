import type { RampPoint } from "../../WebAudioEngine"
import type { CrossfadeParams, TransitionPlan } from "./types"
import { computeTimedTransition } from "./timeBased"

/**
 * Given a parsed ramp and a dB threshold, find the time (in seconds) where
 * the ramp crosses that threshold via linear interpolation.
 * Returns -1 if the threshold is never reached.
 */
export function mixrampInterpolate(ramp: RampPoint[], thresholdDb: number): number {
  if (ramp.length === 0) return -1

  if (thresholdDb <= ramp[0].db) return ramp[0].timeSec
  if (thresholdDb >= ramp[ramp.length - 1].db) return -1

  for (let i = 0; i < ramp.length - 1; i++) {
    const a = ramp[i]
    const b = ramp[i + 1]
    if (a.db <= thresholdDb && thresholdDb <= b.db) {
      const ratio = (thresholdDb - a.db) / (b.db - a.db)
      return a.timeSec + ratio * (b.timeSec - a.timeSec)
    }
  }

  return -1
}

/**
 * MixRamp crossfade strategy: overlap tracks at the dB threshold crossing points
 * with no gain curves (both tracks play at full normalized volume).
 * Falls back to timed crossfade when interpolation fails.
 */
export function computeMixrampTransition(params: CrossfadeParams): TransitionPlan | null {
  const { outEndRamp, inStartRamp, mixrampDb, outDurationSec } = params

  if (!outEndRamp?.length || !inStartRamp?.length) {
    return computeTimedTransition(params)
  }

  const endOverlapSec = mixrampInterpolate(outEndRamp, mixrampDb)
  const startOverlapSec = mixrampInterpolate(inStartRamp, mixrampDb)

  if (endOverlapSec < 0 || startOverlapSec < 0) {
    return computeTimedTransition(params)
  }

  const overlapDuration = endOverlapSec + startOverlapSec
  if (overlapDuration < 0.2) {
    return computeTimedTransition(params)
  }

  return {
    startTimeSeconds: outDurationSec - endOverlapSec,
    durationSeconds: overlapDuration,
    // No curves = MixRamp overlap (both at full volume)
    nextStartOffset: 0,
  }
}
