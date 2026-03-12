import type { DSPBlock } from "./types"

const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export function createEqualizer(ctx: AudioContext): DSPBlock & {
  setGains(gainsDb: number[]): void
  getFilters(): BiquadFilterNode[]
} {
  const filters = EQ_FREQS.map((freq, i) => {
    const f = ctx.createBiquadFilter()
    if (i === 0) f.type = "lowshelf"
    else if (i === 9) f.type = "highshelf"
    else f.type = "peaking"
    f.frequency.value = freq
    f.Q.value = i === 0 || i === 9 ? 0.7 : 1.4
    f.gain.value = 0
    return f
  })

  return {
    name: "equalizer",
    enabled: false,

    connect(input: AudioNode): AudioNode {
      if (!this.enabled) return input
      input.connect(filters[0])
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1])
      }
      return filters[filters.length - 1]
    },

    setGains(gainsDb: number[]) {
      for (let i = 0; i < filters.length && i < gainsDb.length; i++) {
        filters[i].gain.value = this.enabled ? gainsDb[i] : 0
      }
    },

    getFilters() {
      return filters
    },

    dispose() {
      for (const f of filters) f.disconnect()
    },
  }
}
