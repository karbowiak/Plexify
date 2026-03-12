export interface TransitionPlan {
  /** Absolute time in the outgoing track (seconds) to start the transition. */
  startTimeSeconds: number
  /** Duration of the overlap (seconds). */
  durationSeconds: number
  /** Fade-out gain curve for outgoing deck. Absent = MixRamp (no gain manipulation). */
  fadeOutCurve?: Float32Array
  /** Fade-in gain curve for incoming deck. Absent = MixRamp (no gain manipulation). */
  fadeInCurve?: Float32Array
  /** Offset in seconds to start the incoming track. */
  nextStartOffset?: number
}

export interface CrossfadeStrategy {
  computeTransition(params: CrossfadeParams): TransitionPlan | null
}

export interface CrossfadeParams {
  outDurationSec: number
  outParentKey: string
  inParentKey: string
  outEndRamp?: import("../../WebAudioEngine").RampPoint[]
  inStartRamp?: import("../../WebAudioEngine").RampPoint[]
  crossfadeWindowMs: number
  smartCrossfadeMaxMs: number
  mixrampDb: number
  smartCrossfadeEnabled: boolean
  sameAlbumCrossfade: boolean
}
