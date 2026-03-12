import { useEffect, useRef, useState } from "react"
import { usePlayerStore } from "../stores/playerStore"
import { useVisualizerStore } from "../stores/visualizerStore"

function isInput(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

function hasModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey
}

export function useGlobalHotkeys() {
  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false)
  const volumeBeforeMute = useRef(80)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Modifier hotkeys (work even in inputs)
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "f" || e.key === "k") {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent("plexify:search-focus"))
          return
        }
        if (e.key === "r" && !e.shiftKey) {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent("plexify:refresh"))
          return
        }
      }

      // All remaining hotkeys are suppressed when typing in inputs
      if (isInput(e)) return

      // Hotkeys that require no modifiers
      if (hasModifier(e)) return

      const player = usePlayerStore.getState()
      const visualizer = useVisualizerStore.getState()

      switch (e.key) {
        case " ":
          e.preventDefault()
          if (!player.currentTrack) return
          if (player.isPlaying) player.pause()
          else player.resume()
          break
        case "n":
        case "N":
          e.preventDefault()
          player.next()
          break
        case "b":
        case "B":
          e.preventDefault()
          player.prev()
          break
        case "ArrowLeft":
          e.preventDefault()
          {
            const delta = e.shiftKey ? 15000 : 5000
            player.seekTo(Math.max(0, player.positionMs - delta))
          }
          break
        case "ArrowRight":
          e.preventDefault()
          {
            const delta = e.shiftKey ? 15000 : 5000
            const duration = player.currentTrack?.duration ?? 0
            player.seekTo(Math.min(duration, player.positionMs + delta))
          }
          break
        case "ArrowUp":
          e.preventDefault()
          player.setVolume(Math.min(100, player.volume + 5))
          break
        case "ArrowDown":
          e.preventDefault()
          player.setVolume(Math.max(0, player.volume - 5))
          break
        case "m":
        case "M":
          e.preventDefault()
          if (player.volume > 0) {
            volumeBeforeMute.current = player.volume
            player.setVolume(0)
          } else {
            player.setVolume(volumeBeforeMute.current)
          }
          break
        case "s":
        case "S":
          e.preventDefault()
          player.toggleShuffle()
          break
        case "r":
        case "R":
          e.preventDefault()
          player.cycleRepeat()
          break
        case "v":
        case "V":
          if (!visualizer.fullscreenOpen) {
            e.preventDefault()
            visualizer.openFullscreen()
          }
          break
        case "?":
          e.preventDefault()
          setHotkeyHelpOpen(prev => !prev)
          break
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return { hotkeyHelpOpen, setHotkeyHelpOpen }
}
