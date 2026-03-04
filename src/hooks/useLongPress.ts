import { useRef, useCallback } from "react"

interface UseLongPressOptions {
  onPress: () => void
  onLongPress: () => void
  threshold?: number
}

/**
 * Distinguishes short press from long press using Pointer Events.
 * Short press fires `onPress`, long press (≥threshold ms) fires `onLongPress`.
 */
export function useLongPress({ onPress, onLongPress, threshold = 500 }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const onPointerDown = useCallback(() => {
    firedRef.current = false
    clear()
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, threshold)
  }, [onLongPress, threshold, clear])

  const onPointerUp = useCallback(() => {
    clear()
    if (!firedRef.current) onPress()
  }, [onPress, clear])

  const onPointerLeave = useCallback(() => {
    clear()
  }, [clear])

  return { onPointerDown, onPointerUp, onPointerLeave }
}
