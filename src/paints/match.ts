/**
 * Nearest-paint matching. Spec: D40 (reopens D11).
 *
 * Distance is Euclidean in Oklab, which is what Oklab is for — it is built so that equal
 * numeric steps are roughly equal perceptual steps, so nearest-in-Oklab is a defensible
 * "closest paint" and nearest-in-sRGB would not be.
 *
 * Brands are matched INDEPENDENTLY (D44): a colour can match AK, Vallejo, both or
 * neither, and the caller lists whichever qualify. Collapsing to a single global nearest
 * would hide the fact that the other brand also has something usable, which is the whole
 * point of carrying two catalogues.
 *
 * WHAT THIS CANNOT DO, stated because the numbers look more authoritative than they are:
 * the catalogue swatches are the manufacturer's print renderings, not measurements of
 * dried paint, and D10 already says the pipeline assumes sRGB and does not predict
 * absolute paint colour. A match means "this bottle sits in the right region of colour
 * space", not "this bottle is this colour".
 */

import { lrgbToOklab, oklabDistance, srgbToLinear, type Oklab } from '../color/oklab.ts'
import { PAINTS } from './catalogue.ts'
import { BRANDS, type Brand, type Paint } from './types.ts'

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

export { oklabDistance }

export function hexToOklab(hex: string): Oklab {
  const n = Number.parseInt(hex.slice(1), 16)
  return lrgbToOklab({
    r: srgbToLinear(((n >> 16) & 0xff) / 255),
    g: srgbToLinear(((n >> 8) & 0xff) / 255),
    b: srgbToLinear((n & 0xff) / 255),
  })
}

/**
 * Precomputed once, grouped by brand: ~1300 conversions at module load, so matching is a
 * plain distance scan per brand.
 */
const BY_BRAND: ReadonlyMap<Brand, readonly { paint: Paint; lab: Oklab }[]> = new Map(
  BRANDS.map((brand) => [
    brand,
    PAINTS.filter((p) => p.brand === brand).map((paint) => ({
      paint,
      lab: hexToOklab(paint.hex),
    })),
  ]),
)

/**
 * The closest paint within one brand, always — never null, so the caller can show the
 * match and its distance and decide separately whether it is close enough.
 *
 * Ties break toward the earlier catalogue entry, which is stable because each brand's
 * data is sorted by range then ref.
 */
export function nearestPaintOfBrand(target: Oklab, brand: Brand): PaintMatch {
  const candidates = BY_BRAND.get(brand)
  if (!candidates || candidates.length === 0) {
    throw new Error(`No paints loaded for brand ${brand}`)
  }
  let best = candidates[0]
  let bestDist = oklabDistance(target, best.lab)
  for (let i = 1; i < candidates.length; i++) {
    const d = oklabDistance(target, candidates[i].lab)
    if (d < bestDist) {
      bestDist = d
      best = candidates[i]
    }
  }
  return { paint: best.paint, distance: bestDist }
}

/** The closest paint in each brand, in BRANDS order. Always one entry per brand. */
export function nearestPerBrand(target: Oklab): PaintMatch[] {
  return BRANDS.map((brand) => nearestPaintOfBrand(target, brand))
}

/**
 * The brands that have something close enough, in BRANDS order — empty when none do.
 *
 * This is the list the UI renders: both brands when both qualify, one when one does, and
 * nothing when neither, which is when "No paint found" is shown.
 */
export function matchingPaints(target: Oklab): PaintMatch[] {
  return nearestPerBrand(target).filter(isWithinTolerance)
}

/** The closest match across all brands, for reporting how far off the nearest bottle is. */
export function closestOverall(target: Oklab): PaintMatch {
  return nearestPerBrand(target).reduce((a, b) => (b.distance < a.distance ? b : a))
}

/** The distance as the percentage the UI shows. 100% is an Oklab distance of 1. */
export function differencePercent(distance: number): number {
  return Math.round(distance * 100)
}

export function isWithinTolerance(match: PaintMatch): boolean {
  return differencePercent(match.distance) <= MATCH_TOLERANCE_PERCENT
}
