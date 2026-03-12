import type { DSPBlock } from "./types"

export function createPreamp(ctx: AudioContext): DSPBlock & { setGain(db: number): void } {
  const gain = ctx.createGain()
  gain.gain.value = 1

  return {
    name: "preamp",
    enabled: true,

    connect(input: AudioNode): AudioNode {
      if (this.enabled) {
        input.connect(gain)
        return gain
      }
      return input
    },

    setGain(db: number) {
      gain.gain.value = Math.pow(10, db / 20)
    },

    dispose() {
      gain.disconnect()
    },
  }
}
