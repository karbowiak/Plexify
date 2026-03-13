import { useCallback, useRef } from "react"
import { useDragStore, type DragPayload } from "../stores/dragStore"

const DRAG_THRESHOLD = 6 // px of movement before drag starts

/**
 * Returns pointer-event handlers to make an element a drag source for tracks,
 * albums, or artists. Works in Tauri's WKWebView where native HTML5 drag
 * is suppressed.
 *
 * After a successful drag, a one-shot click capture listener swallows the
 * click event that the browser fires on pointer-up, preventing accidental playback.
 */
export function useTrackDrag() {
  const pointerState = useRef<{
    startX: number
    startY: number
    payload: DragPayload
    pointerId: number
    started: boolean
  } | null>(null)

  const onPointerDown = useCallback((
    e: React.PointerEvent,
    payload: DragPayload,
  ) => {
    // Only primary button
    if (e.button !== 0) return
    // Don't interfere with interactive child elements (links/buttons) inside the
    // drag source. Walk from the event target up to currentTarget — if we hit an
    // <a> or <button> that is a *descendant* of the drag source, bail out.
    let node = e.target as HTMLElement | null
    const boundary = e.currentTarget as HTMLElement
    while (node && node !== boundary) {
      const tag = node.tagName
      if (tag === "A" || tag === "BUTTON") return
      node = node.parentElement
    }

    pointerState.current = {
      startX: e.clientX,
      startY: e.clientY,
      payload,
      pointerId: e.pointerId,
      started: false,
    }

    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = pointerState.current
    if (!s) return

    if (!s.started) {
      const dx = e.clientX - s.startX
      const dy = e.clientY - s.startY
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
      s.started = true
      useDragStore.getState().startDrag(s.payload, e.clientX, e.clientY)
    } else {
      useDragStore.getState().updateCursor(e.clientX, e.clientY)
    }
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = pointerState.current
    if (!s) return
    pointerState.current = null

    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(s.pointerId)
    } catch { /* already released */ }

    if (s.started) {
      const store = useDragStore.getState()
      const targetPlaylistId = store.hoveredPlaylistId
      const targetQueue = store.hoveredQueue
      store.endDrag()

      // Swallow the click event that fires after pointer-up
      const swallowClick = (ev: MouseEvent) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener("click", swallowClick, { capture: true, once: true })
      setTimeout(() => window.removeEventListener("click", swallowClick, { capture: true }), 100)

      if (targetPlaylistId || targetQueue) {
        window.dispatchEvent(new CustomEvent("plexify-media-drop", {
          detail: {
            payload: s.payload,
            targetPlaylistId,
            targetQueue,
          },
        }))
      }
    }
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp }
}
