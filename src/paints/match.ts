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
 * Which brands to search is passed IN (D48) rather than read from a module constant, so
 * the filter is a plain argument and the functions stay pure. An empty list means "do
 * not match paint", which is deliberately different from "searched and found nothing".
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
  /**
   * How the bottle differs from the swatch, in one word, or null when it is close on
   * both axes. See `driftLabel`.
   */
  drift: Drift
}

export type Drift = 'lighter' | 'darker' | 'stronger' | 'greyer' | null

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

/**
 * How far apart the swatch and the bottle must be on one axis before it is worth saying
 * so. Oklab units, same scale as `distance`.
 *
 * Measured against the real catalogue rather than guessed. Over 2401 wheel colours and
 * their 3110 in-tolerance matches, |dL| runs to a median of 0.011 and a maximum of 0.054,
 * so the useful thresholds are small and the tempting round numbers are wrong in both
 * directions: at 0.005 a hint appears on 77% of rows, which is noise, and at 0.04 on 1%,
 * which is dead code. 0.02 fires on 47% of rows — the half that genuinely differ.
 */
export const DRIFT_THRESHOLD = 0.02

export { oklabDistance }

/** Oklab chroma — distance from the neutral axis, i.e. how far from grey. */
const chromaOf = (o: Oklab): number => Math.hypot(o.a, o.b)

/**
 * One word for how the bottle differs from the swatch, or null when it does not
 * materially differ.
 *
 * WHY NOT LIGHTNESS ALONE, which is what was asked for: over the same 3110 real matches,
 * |dL| is the LARGER of the two deviations in only 46% of them. Chroma moves just as
 * much, so a lightness-only hint would be silent on the bigger half of the cases and,
 * worse, silent in a way that reads as "this one is fine". So the dominant axis is
 * reported, whichever it is: lightness 19.5% of the time, chroma 27.2%, nothing 53.3%.
 *
 * Only ever ONE word. Two would double the length of every paint row in a list column
 * that already competes with the wheel for width, and the point is a glance-level warning
 * before you open the pot, not a full readout — the numbers are already there.
 *
 * THIS IS NOT A VALUE AXIS (D16). It describes two known colours relative to each other:
 * the catalogue swatch of a specific bottle against the swatch on screen. It says nothing
 * about lightness as a dimension of the wheel, adds no control, and orders nothing.
 */
export function driftLabel(target: Oklab, paint: Oklab): Drift {
  const dL = paint.L - target.L
  const dC = chromaOf(paint) - chromaOf(target)
  if (Math.abs(dL) >= Math.abs(dC)) {
    if (Math.abs(dL) <= DRIFT_THRESHOLD) return null
    return dL > 0 ? 'lighter' : 'darker'
  }
  if (Math.abs(dC) <= DRIFT_THRESHOLD) return null
  return dC > 0 ? 'stronger' : 'greyer'
}

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
  return {
    paint: best.paint,
    distance: bestDist,
    drift: driftLabel(target, best.lab),
  }
}

/** The closest paint in each of `brands`, in BRANDS order. One entry per brand. */
export function nearestPerBrand(
  target: Oklab,
  brands: readonly Brand[] = BRANDS,
): PaintMatch[] {
  return BRANDS.filter((b) => brands.includes(b)).map((brand) =>
    nearestPaintOfBrand(target, brand),
  )
}

/**
 * The brands that have something close enough, in BRANDS order — empty when none do.
 *
 * This is the list the UI renders: both brands when both qualify, one when one does, and
 * nothing when neither, which is when "No paint found" is shown.
 */
export function matchingPaints(
  target: Oklab,
  brands: readonly Brand[] = BRANDS,
): PaintMatch[] {
  return nearestPerBrand(target, brands).filter(isWithinTolerance)
}

/**
 * The closest match across the searched brands, for reporting how far off the nearest
 * bottle is. Null when no brands are being searched — there is no "nearest" to report.
 */
export function closestOverall(
  target: Oklab,
  brands: readonly Brand[] = BRANDS,
): PaintMatch | null {
  const found = nearestPerBrand(target, brands)
  return found.length === 0
    ? null
    : found.reduce((a, b) => (b.distance < a.distance ? b : a))
}

/** How many paints a brand contributes. Shown beside its checkbox. */
export function paintCount(brand: Brand): number {
  return BY_BRAND.get(brand)?.length ?? 0
}

/** The distance as the percentage the UI shows. 100% is an Oklab distance of 1. */
export function differencePercent(distance: number): number {
  return Math.round(distance * 100)
}

export function isWithinTolerance(match: PaintMatch): boolean {
  return differencePercent(match.distance) <= MATCH_TOLERANCE_PERCENT
}
