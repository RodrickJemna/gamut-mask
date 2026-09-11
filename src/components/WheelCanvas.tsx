/**
 * The colour wheel disk, drawn per pixel into a canvas. Spec: F1, D4, D30.
 *
 * Owns the elements, their size and the blits; all colour maths lives in color/render.ts,
 * color/wheel.ts and paints/coverage.ts. It takes NO MASK PROPS, which is what makes the
 * caches below correct: a mask edit cannot re-run either render, because neither the disk
 * nor the unreachable region depends on the mask.
 *
 * TWO CANVASES, one box (D50). The disk, then the scrim over the region no enabled paint
 * can reach, then the SVG overlay on top of both. They are separate elements rather than
 * one composited image so that toggling brands repaints only the scrim — the disk costs
 * ~140 ms at 1M pixels and has no reason to be recomputed for a checkbox.
 *
 * WHY CANVAS HERE, SVG ON TOP (D4): ~1M independent pixel colours is the one thing SVG
 * cannot express, while hit-testing draggable handles is trivial in SVG and miserable on
 * a canvas. So the two are stacked in the same square box.
 */

import { useEffect, useRef, useState } from 'react'
import { renderDisk } from '../color/render.ts'
import type { WheelSpec } from '../color/wheel.ts'
import { renderUnreachable } from '../paints/coverage.ts'

/**
 * Resize settle delay. renderDisk costs ~140 ms at 1M pixels, so recomputing on every
 * ResizeObserver callback would turn a window drag into a slideshow. F1 only asks for a
 * recompute on resize, not on every resize event.
 */
const SETTLE_MS = 120

type Props = {
  /** Which wheel to draw (D53). Changing it repaints the disk and nothing else. */
  wheel: WheelSpec
  /**
   * D50 — the reachability field to shade from, or null to draw no scrim at all.
   *
   * A field rather than a brand list: this component has no business knowing what a brand
   * is, and a stable field identity is a better effect dependency than a list that has to
   * be flattened to a string to compare. Null covers both "matching is off" and "the
   * scrim is switched off", which look the same from here.
   */
  unreachable: Float32Array | null
}

export function WheelCanvas({ wheel, unreachable }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrimRef = useRef<HTMLCanvasElement>(null)
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
    ctx.putImageData(renderDisk(size, dpr, wheel), 0, 0)
  }, [size, dpr, side, wheel])

  /** D50 — the scrim, repainted only when the field or the pixel size changes. */
  useEffect(() => {
    const canvas = scrimRef.current
    if (!canvas || side <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, side, side)
    if (unreachable) ctx.putImageData(renderUnreachable(size, dpr, unreachable), 0, 0)
  }, [size, dpr, side, unreachable])

  return (
    <div className="wheel-disk" ref={boxRef}>
      {side > 0 && (
        <>
          <canvas ref={canvasRef} width={side} height={side} aria-hidden="true" />
          <canvas
            className="wheel-scrim"
            ref={scrimRef}
            width={side}
            height={side}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  )
}
