let audioCtx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (audioCtx) {
    if (audioCtx.state === "suspended") {
      void audioCtx.resume()
    }
    return audioCtx
  }
  audioCtx = new AudioContext()
  return audioCtx
}

export function closeAudioContext(): void {
  if (audioCtx) {
    void audioCtx.close()
    audioCtx = null
  }
}
