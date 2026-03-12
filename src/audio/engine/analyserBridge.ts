/**
 * Wraps an AnalyserNode for visualizer data delivery via requestAnimationFrame.
 */
export class AnalyserBridge {
  readonly node: AnalyserNode
  private samples: Float32Array<ArrayBuffer>
  private rafId: number | null = null
  private enabled = false
  private onFrame: ((samples: Float32Array) => void) | null = null

  constructor(ctx: AudioContext) {
    this.node = ctx.createAnalyser()
    this.node.fftSize = 2048
    this.node.smoothingTimeConstant = 0.5
    this.samples = new Float32Array(this.node.fftSize)
  }

  setEnabled(enabled: boolean, onFrame?: (samples: Float32Array) => void): void {
    this.enabled = enabled
    if (onFrame) this.onFrame = onFrame

    if (enabled) {
      this.startLoop()
    } else {
      this.stopLoop()
    }
  }

  private startLoop(): void {
    if (this.rafId !== null) return
    const loop = () => {
      if (!this.enabled) {
        this.rafId = null
        return
      }
      this.node.getFloatTimeDomainData(this.samples)
      this.onFrame?.(this.samples as Float32Array<ArrayBuffer>)
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /** Return FFT frequency-domain data (dB values from AnalyserNode). */
  getFrequencyData(): Float32Array {
    const buf = new Float32Array(this.node.frequencyBinCount)
    this.node.getFloatFrequencyData(buf)
    return buf
  }

  dispose(): void {
    this.stopLoop()
    this.node.disconnect()
  }
}
