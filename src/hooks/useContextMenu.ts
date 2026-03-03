import { useCallback } from "react"
import { useContextMenuStore, type ContextMenuType } from "../stores/contextMenuStore"
import type { Track, Album, Artist } from "../types/plex"

type ContextMenuData = Track | Album | Artist

/**
 * Unified hook for context menu integration.
 *
 * Returns:
 * - `handler(type, data)` — builds an `onContextMenu` React handler
 * - `isTarget(ratingKey)` — true if this key's row should be highlighted
 */
export function useContextMenu() {
  const show = useContextMenuStore(s => s.show)
  const open = useContextMenuStore(s => s.open)
  const targetKey = useContextMenuStore(s => (s.data as any)?.rating_key ?? null)

  const handler = useCallback(
    (type: ContextMenuType, data: ContextMenuData) =>
      (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        show(e.clientX, e.clientY, type, data)
      },
    [show],
  )

  const isTarget = useCallback(
    (ratingKey: number) => open && targetKey === ratingKey,
    [open, targetKey],
  )

  return { handler, isTarget }
}
