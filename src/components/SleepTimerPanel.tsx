import { useEffect, useState } from "react"
import { useSleepTimerStore } from "../stores/sleepTimerStore"

const PRESETS = [15, 30, 45, 60, 90]

function formatRemaining(endsAt: number): string {
  const ms = Math.max(0, endsAt - Date.now())
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, "0")}`
}

interface Props {
  onClose: () => void
}

export default function SleepTimerPanel({ onClose }: Props) {
  const { endsAt, start, cancel } = useSleepTimerStore()
  const [, forceUpdate] = useState(0)
  const [customMinutes, setCustomMinutes] = useState("")

  // Tick every second to update countdown
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => forceUpdate(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [endsAt])

  function handlePreset(min: number) {
    start(min)
    onClose()
  }

  function handleCustom() {
    const m = parseInt(customMinutes, 10)
    if (!m || m <= 0) return
    start(m)
    setCustomMinutes("")
    onClose()
  }

  return (
    <>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <span className="text-sm font-semibold text-white tracking-wide">Sleep Timer</span>
      </div>

      {endsAt ? (
        /* Active state — show countdown + cancel */
        <div className="px-4 py-4 flex flex-col items-center gap-3">
          <div className="text-2xl font-mono font-semibold text-accent">
            {formatRemaining(endsAt)}
          </div>
          <p className="text-xs text-white/50 text-center">Pausing after timer ends</p>
          <button
            onClick={() => { cancel(); onClose() }}
            className="w-full rounded-full bg-white/10 py-1.5 text-sm text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        /* Inactive state — preset pills + custom input */
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(min => (
              <button
                key={min}
                onClick={() => handlePreset(min)}
                className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              >
                {min} min
              </button>
            ))}
          </div>
          {/* Custom duration input */}
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={999}
              placeholder="Custom (min)"
              value={customMinutes}
              onChange={e => setCustomMinutes(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCustom() }}
              className="flex-1 min-w-0 rounded-full bg-white/10 px-3 py-1 text-sm text-white placeholder-white/30 outline-none focus:bg-white/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={handleCustom}
              className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            >
              Set
            </button>
          </div>
        </div>
      )}
    </>
  )
}
