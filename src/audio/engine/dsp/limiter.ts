import type { DSPBlock } from "./types"

export function createLimiter(ctx: AudioContext): DSPBlock {
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -1
  comp.knee.value = 0
  comp.ratio.value = 20
  comp.attack.value = 0.003
  comp.release.value = 0.25

  return {
    name: "limiter",
    enabled: true,

    connect(input: AudioNode): AudioNode {
      if (this.enabled) {
        input.connect(comp)
        return comp
      }
      return input
    },

    dispose() {
      comp.disconnect()
    },
  }
}
