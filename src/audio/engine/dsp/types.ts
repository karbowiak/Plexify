export interface DSPBlock {
  readonly name: string
  enabled: boolean
  connect(input: AudioNode): AudioNode
  dispose(): void
}
