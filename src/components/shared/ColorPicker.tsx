import { useCallback, useEffect, useRef, useState } from "react"

// ---------------------------------------------------------------------------
// Color math utilities
// ---------------------------------------------------------------------------

export function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  const s = max === 0 ? 0 : d / max
  return [h, s, max]
}

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ---------------------------------------------------------------------------
// ColorPicker
// ---------------------------------------------------------------------------

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(value))
  const svCanvasRef = useRef<HTMLCanvasElement>(null)
  const hueCanvasRef = useRef<HTMLCanvasElement>(null)
  const draggingSV = useRef(false)
  const draggingHue = useRef(false)

  // Sync external value changes
  useEffect(() => {
    const newHsv = hexToHsv(value)
    // Only sync if hex actually differs (avoid fighting user drags)
    if (hsvToHex(hsv[0], hsv[1], hsv[2]).toLowerCase() !== value.toLowerCase()) {
      setHsv(newHsv)
    }
  }, [value])

  const SV_SIZE = 200
  const HUE_WIDTH = 200
  const HUE_HEIGHT = 16

  // Draw SV canvas
  useEffect(() => {
    const canvas = svCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const w = SV_SIZE, h = SV_SIZE

    // Base hue fill
    ctx.fillStyle = `hsl(${hsv[0]}, 100%, 50%)`
    ctx.fillRect(0, 0, w, h)

    // White gradient (left to right)
    const whiteGrad = ctx.createLinearGradient(0, 0, w, 0)
    whiteGrad.addColorStop(0, "rgba(255,255,255,1)")
    whiteGrad.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = whiteGrad
    ctx.fillRect(0, 0, w, h)

    // Black gradient (top to bottom)
    const blackGrad = ctx.createLinearGradient(0, 0, 0, h)
    blackGrad.addColorStop(0, "rgba(0,0,0,0)")
    blackGrad.addColorStop(1, "rgba(0,0,0,1)")
    ctx.fillStyle = blackGrad
    ctx.fillRect(0, 0, w, h)
  }, [hsv[0]])

  // Draw hue canvas
  useEffect(() => {
    const canvas = hueCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const grad = ctx.createLinearGradient(0, 0, HUE_WIDTH, 0)
    for (let i = 0; i <= 6; i++) {
      grad.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`)
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, HUE_WIDTH, HUE_HEIGHT)
  }, [])

  const emitChange = useCallback((h: number, s: number, v: number) => {
    setHsv([h, s, v])
    onChange(hsvToHex(h, s, v))
  }, [onChange])

  const handleSVMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = svCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
    emitChange(hsv[0], s, v)
  }, [hsv[0], emitChange])

  const handleHueMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = hueCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360))
    emitChange(h, hsv[1], hsv[2])
  }, [hsv[1], hsv[2], emitChange])

  // Global mouse handlers for drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingSV.current) handleSVMove(e)
      if (draggingHue.current) handleHueMove(e)
    }
    const onUp = () => {
      draggingSV.current = false
      draggingHue.current = false
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [handleSVMove, handleHueMove])

  const svX = hsv[1] * SV_SIZE
  const svY = (1 - hsv[2]) * SV_SIZE
  const hueX = (hsv[0] / 360) * HUE_WIDTH

  return (
    <div className="flex flex-col gap-3">
      {/* Saturation / Value canvas */}
      <div className="relative" style={{ width: SV_SIZE, height: SV_SIZE }}>
        <canvas
          ref={svCanvasRef}
          width={SV_SIZE}
          height={SV_SIZE}
          className="rounded-lg cursor-crosshair"
          onMouseDown={e => { draggingSV.current = true; handleSVMove(e) }}
        />
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
          style={{ left: svX, top: svY, backgroundColor: value }}
        />
      </div>

      {/* Hue slider */}
      <div className="relative" style={{ width: HUE_WIDTH, height: HUE_HEIGHT }}>
        <canvas
          ref={hueCanvasRef}
          width={HUE_WIDTH}
          height={HUE_HEIGHT}
          className="rounded-full cursor-pointer"
          onMouseDown={e => { draggingHue.current = true; handleHueMove(e) }}
        />
        <div
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
          style={{ left: hueX, backgroundColor: hsvToHex(hsv[0], 1, 1) }}
        />
      </div>
    </div>
  )
}
