/**
 * Per-pixel rendering of the disk into an ImageData. Spec: F1, D30, D4.
 *
 * D30 chose per-pixel over a segment fan, for a smooth transition. D4 put the disk on a
 * canvas with the mask handles in an SVG overlay above it.
 *
 * Pure function: no canvas element, no React, no DOM reads. WheelCanvas.tsx owns the
 * element, the resize observation and the putImageData call.
 */

import { angleOf, sampleSrgb8 } from './wheel.ts'

/**
 * Renders the disk at `size` CSS pixels with a `dpr` backing store, so the result is
 * `round(size * dpr)` square. Outside the disk is transparent.
 *
 * F1: the caller caches this and recomputes only on resize. The result depends on
 * nothing but the pixel dimensions — not the mask, not any other state — which is what
 * makes that cache correct.
 *
 * Measured cost (M-series, dev build): 0.25M px ~40 ms, 1M px ~140 ms, 3.24M px ~475 ms.
 * That is fine for a resize-only recompute but is a visible hitch if it runs on every
 * resize event, so WheelCanvas must recompute on resize settle, not per event. Left
 * unoptimised on purpose. If it ever needs to be faster, the win is a rim LUT over
 * theta — rimOklab is the only per-pixel work that does not depend on the radius — with
 * nodes landing on the six anchors so the hexagon's kinks stay exact.
 */
export function renderDisk(size: number, dpr: number): ImageData {
  const side = Math.max(1, Math.round(size * dpr))
  const half = side / 2
  const data = new Uint8ClampedArray(side * side * 4)

  // One device pixel wide, in wheel units, so the rim reads as a clean edge at any size
  // and any dpr. Coverage is 0.5 exactly on the boundary, which is what antialiasing
  // should give; without it a 500px disk is visibly stair-stepped.
  const feather = 1 / half

  for (let py = 0; py < side; py++) {
    const y = (py + 0.5) / half - 1
    for (let px = 0; px < side; px++) {
      const x = (px + 0.5) / half - 1
      // sqrt rather than Math.hypot: hypot's overflow guarding makes it ~5x slower in
      // V8, and coordinates here are bounded well inside float range, so the two are
      // bit-identical. wheel.ts keeps hypot in radiusOf, which is not a hot path.
      const t = Math.sqrt(x * x + y * y)

      const coverage = (1 - t) / feather + 0.5
      if (coverage <= 0) continue // transparent: Uint8ClampedArray starts zeroed

      const i = (py * side + px) * 4
      // At the exact centre angleOf is arbitrary (atan2(0,0) === 0), which is harmless:
      // t = 0 is the same neutral for every angle. No special case, so the centre pixel
      // cannot end up a different colour from its neighbours.
      const [r, g, b] = sampleSrgb8(angleOf(x, y), t < 1 ? t : 1)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = coverage >= 1 ? 255 : Math.round(coverage * 255)
    }
  }

  return new ImageData(data, side, side)
}
