/**
 * The colour wheel disk, drawn per pixel into a canvas. Spec: F1, D4, D30.
 *
 * Owns the element, its size and the blit; all colour maths lives in color/render.ts and
 * color/wheel.ts. It takes no mask props, which is what makes the cache below correct: a
 * mask edit cannot re-run the render because the render does not depend on the mask.
 *
 * WHY CANVAS HERE, SVG ON TOP (D4): ~1M independent pixel colours is the one thing SVG
 * cannot express, while hit-testing draggable handles is trivial in SVG and miserable on
 * a canvas. So the two are stacked in the same square box.
 */

import { useEffect, useRef, useState } from 'react'
import { renderDisk } from '../color/render.ts'

/**
 * Resize settle delay. renderDisk costs ~140 ms at 1M pixels, so recomputing on every
 * ResizeObserver callback would turn a window drag into a slideshow. F1 only asks for a
 * recompute on resize, not on every resize event.
 */
const SETTLE_MS = 120

export function WheelCanvas() {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(0)

  // Measure the wrapper, never the canvas. The canvas is CSS-sized to 100% of the
  // wrapper, so observing it would feed its own backing-store changes back in.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return

    let timer: number | undefined
    let measured = false
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      // Whole pixels only: sub-pixel layout jitter must not trigger a full recompute.
      const next = Math.round(width)
      if (!measured) {
        // The settle delay exists to coalesce a resize DRAG. Applying it to the first
        // measurement only delays first paint, and because the overlay's wash draws
        // immediately over an unpainted canvas, that showed as a black disk for a
        // moment on load.
        measured = true
        setSize(next)
        return
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setSize(next), SETTLE_MS)
    })
    observer.observe(box)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  const dpr = window.devicePixelRatio || 1
  const side = size > 0 ? Math.max(1, Math.round(size * dpr)) : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || side <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(renderDisk(size, dpr), 0, 0)
  }, [size, dpr, side])

  return (
    <div className="wheel-disk" ref={boxRef}>
      {side > 0 && <canvas ref={canvasRef} width={side} height={side} aria-hidden="true" />}
    </div>
  )
}
