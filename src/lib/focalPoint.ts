import { useEffect, useState } from "react"

/**
 * Detect the most visually interesting point in an image using canvas pixel sampling.
 *
 * Algorithm: fetch the image as a blob (avoids canvas CORS tainting), draw it at
 * low resolution, compute the saturation of each pixel, then find the weighted
 * centroid of the most saturated region. A mild center-bias discourages edge
 * artefacts in mono-colour backgrounds.
 *
 * Returns {x, y} in the 0–1 range (relative to image dimensions).
 * Falls back to {0.5, 0.5} on any error.
 */
export async function detectFocalPoint(imageUrl: string): Promise<{ x: number; y: number }> {
  let blobUrl: string | null = null
  try {
    const blob = await fetch(imageUrl).then(r => r.blob())
    blobUrl = URL.createObjectURL(blob)

    return await new Promise<{ x: number; y: number }>((resolve) => {
      const img = new Image()

      img.onload = () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl)

        const SIZE = 64
        const canvas = document.createElement("canvas")
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext("2d")
        if (!ctx) { resolve({ x: 0.5, y: 0.5 }); return }

        ctx.drawImage(img, 0, 0, SIZE, SIZE)
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE)

        let weightedX = 0
        let weightedY = 0
        let totalWeight = 0

        for (let py = 0; py < SIZE; py++) {
          for (let px = 0; px < SIZE; px++) {
            const i = (py * SIZE + px) * 4
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            // Saturation (colorfulness) as the primary saliency signal.
            const max = Math.max(r, g, b)
            const min = Math.min(r, g, b)
            const saturation = max - min
            // Mild center-bias to avoid fixating on colorful edges.
            const nx = (px / SIZE - 0.5) * 2  // -1..1
            const ny = (py / SIZE - 0.5) * 2  // -1..1
            const centerBias = 1 - 0.25 * Math.sqrt(nx * nx + ny * ny)
            const weight = saturation * Math.max(0, centerBias)
            weightedX += px * weight
            weightedY += py * weight
            totalWeight += weight
          }
        }

        if (totalWeight === 0) { resolve({ x: 0.5, y: 0.5 }); return }
        resolve({
          x: weightedX / totalWeight / SIZE,
          y: weightedY / totalWeight / SIZE,
        })
      }

      img.onerror = () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        resolve({ x: 0.5, y: 0.5 })
      }

      img.src = blobUrl!
    })
  } catch {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    return { x: 0.5, y: 0.5 }
  }
}

/**
 * React hook that asynchronously detects the focal point of an image and
 * returns it as a CSS background-position / object-position string.
 *
 * While loading (or if imageUrl is null) returns "50% 50%".
 */
export function useFocalPoint(imageUrl: string | null): string {
  const [pos, setPos] = useState("50% 50%")

  useEffect(() => {
    if (!imageUrl) { setPos("50% 50%"); return }
    let cancelled = false
    detectFocalPoint(imageUrl).then(({ x, y }) => {
      if (!cancelled) setPos(`${Math.round(x * 100)}% ${Math.round(y * 100)}%`)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [imageUrl])

  return pos
}
