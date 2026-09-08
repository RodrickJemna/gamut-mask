/**
 * Nearest-paint matching. Spec: D40 (reopens D11).
 *
 * Distance is Euclidean in Oklab, which is what Oklab is for — it is built so that equal
 * numeric steps are roughly equal perceptual steps, so nearest-in-Oklab is a defensible
 * "closest paint" and nearest-in-sRGB would not be.
 *
 * WHAT THIS CANNOT DO, stated because the numbers look more authoritative than they are:
 * the catalogue swatches are the manufacturer's print renderings, not measurements of
 * dried paint, and D10 already says the pipeline assumes sRGB and does not predict
 * absolute paint colour. A match means "this bottle sits in the right region of colour
 * space", not "this bottle is this colour".
 */

import { lrgbToOklab, srgbToLinear, type Oklab } from '../color/oklab.ts'
import { PAINTS, type Paint } from './catalogue.ts'

export type PaintMatch = {
  paint: Paint
  /** Oklab distance. Also exposed as a percentage by `differencePercent`. */
  distance: number
}

/**
 * Match tolerance, in the same whole percent the UI displays. 100% is an Oklab distance
 * of 1, about the span from black to white, so this is the "±5%" the feature was asked
 * for.
 *
 * The tolerance is deliberately evaluated on the ROUNDED percentage rather than on the
 * raw distance, so the decision and the number on screen can never disagree. Comparing
 * the raw distance against 0.05 produced rows reading "No paint found" next to "Δ5%",
 * because a distance of 0.0504 rounds to 5 but exceeds 0.05. Now every matched row shows
 * 5% or less and every unmatched row shows 6% or more.
 *
 * Calibrated against the real catalogue, not picked: see the coverage tests in
 * match.test.ts for what it accepts and rejects, and why 5 is a discriminating value.
 */
export const MATCH_TOLERANCE_PERCENT = 5

export function hexToOklab(hex: string): Oklab {
  const n = Number.parseInt(hex.slice(1), 16)
  return lrgbToOklab({
    r: srgbToLinear(((n >> 16) & 0xff) / 255),
    g: srgbToLinear(((n >> 8) & 0xff) / 255),
    b: srgbToLinear((n & 0xff) / 255),
  })
}

/** Precomputed once: 647 conversions, so matching itself is a plain distance scan. */
const PAINT_LAB: readonly { paint: Paint; lab: Oklab }[] = PAINTS.map((paint) => ({
  paint,
  lab: hexToOklab(paint.hex),
}))

export function oklabDistance(a: Oklab, b: Oklab): number {
  const dL = a.L - b.L
  const da = a.a - b.a
  const db = a.b - b.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

/**
 * The closest paint in the catalogue, always — never null, so the caller can show the
 * match and its distance and decide separately whether it is close enough.
 *
 * Ties break toward the earlier catalogue entry, which is stable because the catalogue
 * is sorted by range then ref.
 */
export function nearestPaint(target: Oklab): PaintMatch {
  let best = PAINT_LAB[0]
  let bestDist = oklabDistance(target, best.lab)
  for (let i = 1; i < PAINT_LAB.length; i++) {
    const d = oklabDistance(target, PAINT_LAB[i].lab)
    if (d < bestDist) {
      bestDist = d
      best = PAINT_LAB[i]
    }
  }
  return { paint: best.paint, distance: bestDist }
}

/** The distance as the percentage the UI shows. 100% is an Oklab distance of 1. */
export function differencePercent(distance: number): number {
  return Math.round(distance * 100)
}

export function isWithinTolerance(match: PaintMatch): boolean {
  return differencePercent(match.distance) <= MATCH_TOLERANCE_PERCENT
}
