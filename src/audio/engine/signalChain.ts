import type { DSPBlock } from "./dsp/types"

/**
 * Manages a linear chain of DSP blocks between source(s) and destination.
 * Supports connecting additional sources (for crossfade overlap).
 */
export class SignalChain {
  private blocks: DSPBlock[] = []
  private source: AudioNode | null = null
  private additionalSources: AudioNode[] = []
  private destination: AudioNode | null = null
  private chainInput: AudioNode | null = null

  setBlocks(blocks: DSPBlock[]): void {
    this.blocks = blocks
  }

  setSource(source: AudioNode | null): void {
    const oldSource = this.source
    this.source = source

    // Connect new source first, then disconnect old — avoids audio gap
    if (source && this.chainInput) {
      source.connect(this.chainInput)
    }
    if (oldSource) {
      try { oldSource.disconnect() } catch { /* already disconnected */ }
    }

    // If no chainInput yet (first call), do a full rebuild
    if (!this.chainInput && source) {
      this.rebuild()
    }
  }

  setDestination(dest: AudioNode): void {
    this.destination = dest
    this.rebuild()
  }

  connectAdditionalSource(source: AudioNode): void {
    this.additionalSources.push(source)
    if (this.chainInput) {
      source.connect(this.chainInput)
    }
  }

  disconnectAdditionalSources(): void {
    for (const src of this.additionalSources) {
      try { src.disconnect() } catch { /* already disconnected */ }
    }
    this.additionalSources = []
  }

  rebuild(): void {
    if (!this.destination) return

    const enabledBlocks = this.blocks.filter(b => b.enabled)
    const oldChainInput = this.chainInput

    // Disconnect blocks and old chainInput (but not sources — we'll reconnect them)
    for (const block of this.blocks) {
      try { block.dispose() } catch { /* ignore */ }
    }

    if (enabledBlocks.length === 0) {
      // No blocks: sources connect directly to destination
      if (oldChainInput && oldChainInput !== this.destination) {
        try { (oldChainInput as GainNode).disconnect() } catch { /* ignore */ }
      }
      this.chainInput = this.destination
    } else {
      // Reuse existing chainInput GainNode if available, otherwise create one
      let inputGain: GainNode
      if (oldChainInput && oldChainInput !== this.destination && oldChainInput instanceof GainNode) {
        inputGain = oldChainInput
        try { inputGain.disconnect() } catch { /* ignore */ }
      } else {
        const ctx = this.destination.context as AudioContext
        inputGain = ctx.createGain()
        inputGain.gain.value = 1
      }
      this.chainInput = inputGain

      // Connect blocks in series: input → block0 → block1 → ... → destination
      let current: AudioNode = inputGain
      for (const block of enabledBlocks) {
        current = block.connect(current)
      }
      current.connect(this.destination)
    }

    // Reconnect sources to the (possibly new) chainInput
    if (this.chainInput !== oldChainInput) {
      if (this.source) {
        if (oldChainInput) {
          try { this.source.disconnect(oldChainInput) } catch { /* ignore */ }
        }
        this.source.connect(this.chainInput)
      }
      for (const src of this.additionalSources) {
        if (oldChainInput) {
          try { src.disconnect(oldChainInput) } catch { /* ignore */ }
        }
        src.connect(this.chainInput)
      }
    } else {
      // chainInput unchanged — just make sure sources are connected
      if (this.source) {
        try { this.source.connect(this.chainInput) } catch { /* already connected */ }
      }
      for (const src of this.additionalSources) {
        try { src.connect(this.chainInput) } catch { /* already connected */ }
      }
    }
  }

  getChainInput(): AudioNode | null {
    return this.chainInput
  }

  private disconnectSources(): void {
    if (this.source) {
      try { this.source.disconnect() } catch { /* already disconnected */ }
    }
    this.disconnectAdditionalSources()
  }

  private disconnectAll(): void {
    this.disconnectSources()
    for (const block of this.blocks) {
      try { block.dispose() } catch { /* ignore */ }
    }
    if (this.chainInput && this.chainInput !== this.destination) {
      try { (this.chainInput as GainNode).disconnect() } catch { /* ignore */ }
    }
    this.chainInput = null
  }

  dispose(): void {
    this.disconnectAll()
    this.source = null
    this.destination = null
    this.blocks = []
  }
}
