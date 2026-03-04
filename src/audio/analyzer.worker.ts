/**
 * Web Worker for track analysis — silence/energy/BPM detection for smart crossfade.
 *
 * Receives: { samples: Float32Array, sampleRate: number, ratingKey: number, durationMs: number }
 * Returns:  TrackAnalysis object
 */

interface AnalyzerInput {
  samples: Float32Array
  sampleRate: number
  ratingKey: number
  durationMs: number
}

interface TrackAnalysis {
  rating_key: number
  audio_start_ms: number
  audio_end_ms: number
  outro_start_ms: number
  intro_end_ms: number
  median_energy: number
  bpm: number
}

const WINDOW_MS = 50 // 50ms analysis windows
const SILENCE_THRESHOLD_DB = -60

self.onmessage = (e: MessageEvent<AnalyzerInput>) => {
  const { samples, sampleRate, ratingKey, durationMs } = e.data
  const result = analyze(samples, sampleRate, ratingKey, durationMs)
  self.postMessage(result)
}

function analyze(samples: Float32Array, sampleRate: number, ratingKey: number, durationMs: number): TrackAnalysis {
  const windowSamples = Math.floor((WINDOW_MS / 1000) * sampleRate)
  const numWindows = Math.floor(samples.length / windowSamples)

  if (numWindows === 0) {
    return {
      rating_key: ratingKey,
      audio_start_ms: 0,
      audio_end_ms: durationMs,
      outro_start_ms: durationMs,
      intro_end_ms: 0,
      median_energy: 0,
      bpm: 0,
    }
  }

  // Compute RMS energy per window
  const energies = new Float32Array(numWindows)
  for (let w = 0; w < numWindows; w++) {
    let sum = 0
    const start = w * windowSamples
    for (let i = 0; i < windowSamples; i++) {
      const s = samples[start + i]
      sum += s * s
    }
    energies[w] = Math.sqrt(sum / windowSamples)
  }

  // Silence threshold in linear amplitude
  const silenceThreshold = Math.pow(10, SILENCE_THRESHOLD_DB / 20)

  // Find audio start: first window above silence threshold
  let audioStartWindow = 0
  for (let w = 0; w < numWindows; w++) {
    if (energies[w] > silenceThreshold) {
      audioStartWindow = w
      break
    }
  }

  // Find audio end: last window above silence threshold
  let audioEndWindow = numWindows - 1
  for (let w = numWindows - 1; w >= 0; w--) {
    if (energies[w] > silenceThreshold) {
      audioEndWindow = w
      break
    }
  }

  // Compute median energy (only non-silent windows)
  const nonSilent = Array.from(energies).filter(e => e > silenceThreshold)
  nonSilent.sort((a, b) => a - b)
  const medianEnergy = nonSilent.length > 0 ? nonSilent[Math.floor(nonSilent.length / 2)] : 0

  // Energy threshold: 15% of median
  const energyThreshold = medianEnergy * 0.15

  // Intro end: first window exceeding energy threshold
  let introEndWindow = audioStartWindow
  for (let w = audioStartWindow; w <= audioEndWindow; w++) {
    if (energies[w] > energyThreshold) {
      introEndWindow = w
      break
    }
  }

  // Outro start: last window exceeding energy threshold
  let outroStartWindow = audioEndWindow
  for (let w = audioEndWindow; w >= audioStartWindow; w--) {
    if (energies[w] > energyThreshold) {
      outroStartWindow = w
      break
    }
  }

  // Convert windows to milliseconds
  const windowToMs = (w: number) => w * WINDOW_MS

  // BPM detection via onset-strength autocorrelation
  const bpm = detectBPM(energies, numWindows, WINDOW_MS)

  return {
    rating_key: ratingKey,
    audio_start_ms: windowToMs(audioStartWindow),
    audio_end_ms: Math.min(windowToMs(audioEndWindow + 1), durationMs),
    outro_start_ms: windowToMs(outroStartWindow),
    intro_end_ms: windowToMs(introEndWindow),
    median_energy: medianEnergy,
    bpm,
  }
}

function detectBPM(energies: Float32Array, numWindows: number, windowMs: number): number {
  if (numWindows < 20) return 0

  // Compute onset strength (first-order difference, half-wave rectified)
  const onset = new Float32Array(numWindows - 1)
  for (let i = 1; i < numWindows; i++) {
    onset[i - 1] = Math.max(0, energies[i] - energies[i - 1])
  }

  // Autocorrelation for BPM range 60–200
  const minLag = Math.floor(60000 / (200 * windowMs)) // 200 BPM
  const maxLag = Math.floor(60000 / (60 * windowMs))  // 60 BPM
  if (maxLag >= onset.length) return 0

  let bestLag = minLag
  let bestCorr = -Infinity

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    const n = onset.length - lag
    for (let i = 0; i < n; i++) {
      corr += onset[i] * onset[i + lag]
    }
    corr /= n
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  const bpm = 60000 / (bestLag * windowMs)
  return Math.round(bpm * 10) / 10
}
