/**
 * Generate an equal-power fade-out curve (cosine).
 * Values go from `startGain` down to 0.
 */
export function generateFadeOut(steps: number, startGain = 1): Float32Array {
  const curve = new Float32Array(steps)
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    curve[i] = Math.cos(t * Math.PI / 2) * startGain
  }
  return curve
}

/**
 * Generate an equal-power fade-in curve (sine).
 * Values go from 0 up to `endGain`.
 */
export function generateFadeIn(steps: number, endGain = 1): Float32Array {
  const curve = new Float32Array(steps)
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    curve[i] = Math.sin(t * Math.PI / 2) * endGain
  }
  return curve
}

/**
 * Generate a linear fade-out curve.
 */
export function generateLinearFadeOut(steps: number, startGain = 1): Float32Array {
  const curve = new Float32Array(steps)
  for (let i = 0; i < steps; i++) {
    curve[i] = (1 - i / (steps - 1)) * startGain
  }
  return curve
}
