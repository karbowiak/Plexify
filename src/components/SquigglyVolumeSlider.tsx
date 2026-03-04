import { useCallback, useEffect, useRef, useState } from "react"
import { useEasterEggStore } from "../stores/easterEggStore"

interface Props {
  volume: number
  onChange: (v: number) => void
}

const WIDTH = 128
const HEIGHT = 28
const PAD_X = 6
const TRACK_WIDTH = WIDTH - PAD_X * 2
const MID_Y = HEIGHT / 2

const BASE_CYCLES = 6
const MAX_AMP = 7
/** How fast the squiggle decays back to straight (0–1, lower = slower) */
const DECAY = 0.06

function buildWavePath(pct: number, amplitude: number, phase: number): string {
  const filledW = TRACK_WIDTH * (pct / 100)
  if (filledW < 1) return `M ${PAD_X} ${MID_Y} L ${PAD_X} ${MID_Y}`

  const steps = Math.max(Math.round(filledW), 2)
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const x = PAD_X + (i / steps) * filledW
    const t = (i / steps) * BASE_CYCLES * Math.PI * 2 + phase
    const y = MID_Y + Math.sin(t) * amplitude
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return pts.join(" ")
}

const RAINBOW_STOPS = 5

export default function SquigglyVolumeSlider({ volume, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Animation state kept in refs to avoid re-renders on every frame
  const ampRef = useRef(0)       // current rendered amplitude
  const targetAmp = useRef(0)    // target amplitude (spikes on change, decays to 0)
  const phaseRef = useRef(0)     // rolling phase offset
  const animRef = useRef(0)
  const prevVolume = useRef(volume)
  const rainbowMode = useEasterEggStore(s => s.rainbow)

  // Rainbow hue offset — drives gradient stop colors via React state
  const [rainbowHue, setRainbowHue] = useState(0)

  // We only trigger React re-renders via this single state value
  const [, forceRender] = useState(0)

  // When volume changes, spike the amplitude and advance phase
  useEffect(() => {
    const delta = Math.abs(volume - prevVolume.current)
    prevVolume.current = volume
    if (delta < 0.5) return
    // Spike amplitude proportional to volume level (louder = bigger wave)
    targetAmp.current = Math.min(MAX_AMP, (volume / 100) * MAX_AMP + delta * 0.1)
    phaseRef.current += delta * 0.2
  }, [volume])

  // Animation loop: smoothly approach target amp, then decay to 0
  useEffect(() => {
    let running = true
    const tick = () => {
      if (!running) return

      // Decay target back to zero
      targetAmp.current *= (1 - DECAY)
      if (targetAmp.current < 0.01) targetAmp.current = 0

      // Ease current amplitude toward target
      const diff = targetAmp.current - ampRef.current
      ampRef.current += diff * 0.2

      // Advance phase while there's visible wave
      if (ampRef.current > 0.01) {
        phaseRef.current += 0.12
        forceRender(n => n + 1)
      } else if (ampRef.current !== 0) {
        ampRef.current = 0
        forceRender(n => n + 1)
      }

      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(animRef.current) }
  }, [])

  // Rainbow color cycling — separate interval so it doesn't depend on the squiggle
  useEffect(() => {
    if (!rainbowMode) return
    const id = setInterval(() => {
      setRainbowHue((performance.now() / 50) % 360)
    }, 33) // ~30fps — smooth enough for color shifting
    return () => clearInterval(id)
  }, [rainbowMode])

  const volumeFromX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return volume
    return Math.round(Math.max(0, Math.min(100, ((clientX - rect.left - PAD_X) / TRACK_WIDTH) * 100)))
  }, [volume])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    onChange(volumeFromX(e.clientX))
  }, [onChange, volumeFromX])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    onChange(volumeFromX(e.clientX))
  }, [onChange, volumeFromX])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const amp = ampRef.current
  const phase = phaseRef.current
  const activePath = buildWavePath(volume, amp, phase)

  const inactiveX = PAD_X + TRACK_WIDTH * (volume / 100)
  const inactivePath = `M ${inactiveX.toFixed(2)} ${MID_Y} L ${(PAD_X + TRACK_WIDTH).toFixed(2)} ${MID_Y}`

  const knobX = PAD_X + TRACK_WIDTH * (volume / 100)
  const knobT = BASE_CYCLES * Math.PI * 2 + phase
  const knobY = MID_Y + Math.sin(knobT) * amp

  return (
    <div
      ref={containerRef}
      className="relative cursor-pointer select-none touch-none"
      style={{ width: WIDTH, height: HEIGHT }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg width={WIDTH} height={HEIGHT} className="block">
        {rainbowMode && (
          <defs>
            <linearGradient id="rainbow-vol-grad" gradientUnits="userSpaceOnUse" x1={PAD_X} y1={0} x2={PAD_X + TRACK_WIDTH * (volume / 100)} y2={0}>
              {Array.from({ length: RAINBOW_STOPS }, (_, i) => {
                const hue = (rainbowHue + (i / (RAINBOW_STOPS - 1)) * 360) % 360
                return (
                  <stop
                    key={i}
                    offset={`${(i / (RAINBOW_STOPS - 1)) * 100}%`}
                    stopColor={`hsl(${hue}, 85%, 60%)`}
                  />
                )
              })}
            </linearGradient>
          </defs>
        )}
        <path d={inactivePath} fill="none" stroke="#535353" strokeWidth={2} strokeLinecap="round" />
        <path d={activePath} fill="none" stroke={rainbowMode ? "url(#rainbow-vol-grad)" : "var(--accent)"} strokeWidth={2} strokeLinecap="round" />
        <circle
          cx={knobX}
          cy={knobY}
          r={5}
          fill="white"
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
        />
      </svg>
    </div>
  )
}
