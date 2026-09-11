/**
 * Which parts of the wheel any real paint can reach. Spec: D50 (extends D40, D44, D48).
 *
 * THE PROBLEM. Paint coverage is not uniform and not guessable. Drag a mask into the
 * wrong region and most of its colours come back "No paint found" — but only after the
 * fact, once the list has already been rebuilt. This makes the limit visible on the wheel
 * itself, before the mask is placed.
 *
 * WHAT IT IS NOT: a second opinion about matching. The threshold below is derived from
 * `MATCH_TOLERANCE_PERCENT` rather than written out, so the shaded region and the words
 * in the colour list cannot disagree — the same class of bug as D40's "No paint found"
 * next to "Δ5%".
 *
 * A DISTANCE FIELD, not a boolean mask. Storing the nearest-paint distance per cell and
 * thresholding per PIXEL lets the boundary be interpolated, so a 1-degree grid draws a
 * smooth edge instead of a staircase. Costing it decided this: the true minimum over all
 * 1297 paints on a 360x64 grid is 34 ms for both brands together, so there is no reason
 * to store anything coarser or to defer the work.
 *
 * PER BRAND, combined on read. A colour is unreachable only if EVERY enabled brand misses
 * it, so combining is a per-cell minimum and adding a catalogue costs one more field
 * rather than a rebuild of all 2^n brand combinations.
 *
 * PER WHEEL TOO, since D53: the field answers "can a paint reach this point of the disk",
 * and the disk is a different surface on each wheel. Caches are therefore keyed by
 * (wheel, brand) — a build is 34 ms for the whole catalogue, so a variant costs nothing
 * until it is actually looked at. This is also the reason the muted wheel has a nearly
 * empty scrim and the saturated one does not.
 */

import type { Oklab } from '../color/oklab.ts'
import { WHEELS, sample, type WheelId, type WheelSpec, wheelById } from '../color/wheel.ts'
import { MATCH_TOLERANCE_PERCENT, hexToOklab, oklabDistance } from './match.ts'
import { PAINTS, type Brand } from './catalogue.ts'

/** Angular resolution, one cell per degree. */
export const FIELD_THETA = 360
/** Radial resolution; cell j sits at t = j / (FIELD_T - 1), so both 0 and 1 are on grid. */
export const FIELD_T = 64

/**
 * The distance at which a match stops counting.
 *
 * `isWithinTolerance` compares the ROUNDED percentage, so 5% accepts everything up to but
 * excluding 0.055 — a distance of 0.0549 displays as 5 and passes. Written as the rounding
 * boundary of the tolerance rather than as 0.055 so the two can never drift apart.
 */
export const REACH_LIMIT = (MATCH_TOLERANCE_PERCENT + 0.5) / 100

const LABS_BY_BRAND = new Map<Brand, Oklab[]>()
for (const paint of PAINTS) {
  const labs = LABS_BY_BRAND.get(paint.brand)
  if (labs) labs.push(hexToOklab(paint.hex))
  else LABS_BY_BRAND.set(paint.brand, [hexToOklab(paint.hex)])
}

const FIELDS = new Map<string, Float32Array>()

/**
 * Nearest-paint distance for every cell of one brand's grid, memoised.
 *
 * Deliberately no early exit on "close enough": the value near the threshold is what the
 * interpolation needs, and a field of clamped values would draw a boundary in the wrong
 * place.
 */
export function brandField(brand: Brand, wheel: WheelSpec = WHEELS[0]): Float32Array {
  const key = `${wheel.id}|${brand}`
  const cached = FIELDS.get(key)
  if (cached) return cached

  const labs = LABS_BY_BRAND.get(brand) ?? []
  const field = new Float32Array(FIELD_THETA * FIELD_T)
  for (let i = 0; i < FIELD_THETA; i++) {
    for (let j = 0; j < FIELD_T; j++) {
      const target = sample((i * 360) / FIELD_THETA, j / (FIELD_T - 1), wheel)
      let best = Infinity
      for (const lab of labs) {
        const d = oklabDistance(target, lab)
        if (d < best) best = d
      }
      field[i * FIELD_T + j] = best
    }
  }
  FIELDS.set(key, field)
  return field
}

const COMBINED = new Map<string, Float32Array>()

/**
 * The nearest distance across all of `brands`, or null when none are enabled.
 *
 * Null rather than an all-unreachable field: with paint matching off nothing was searched,
 * so shading the whole disk would assert something false — the same distinction D48 draws
 * between "found nothing" and "did not look".
 */
export function combinedField(
  brands: readonly Brand[],
  wheelId: WheelId = WHEELS[0].id,
): Float32Array | null {
  if (brands.length === 0) return null
  const wheel = wheelById(wheelId)
  const key = `${wheel.id}|${[...brands].sort().join('|')}`
  const cached = COMBINED.get(key)
  if (cached) return cached

  const fields = brands.map((brand) => brandField(brand, wheel))
  const out = Float32Array.from(fields[0])
  for (let f = 1; f < fields.length; f++) {
    const other = fields[f]
    for (let i = 0; i < out.length; i++) {
      if (other[i] < out[i]) out[i] = other[i]
    }
  }
  COMBINED.set(key, out)
  return out
}

/**
 * Bilinear read of the field at an arbitrary angle and radius.
 *
 * Theta WRAPS — cell 359 interpolates into cell 0 — or the red wedge would show a seam
 * along 0 degrees, which is exactly where the wheel's first anchor sits and where such a
 * seam would be most visible.
 */
export function fieldAt(field: Float32Array, theta: number, t: number): number {
  const a = (((theta % 360) + 360) % 360) * (FIELD_THETA / 360)
  const i0 = Math.floor(a) % FIELD_THETA
  const i1 = (i0 + 1) % FIELD_THETA
  const fa = a - Math.floor(a)

  const r = Math.min(1, Math.max(0, t)) * (FIELD_T - 1)
  const j0 = Math.min(FIELD_T - 1, Math.floor(r))
  const j1 = Math.min(FIELD_T - 1, j0 + 1)
  const fr = r - j0

  const v00 = field[i0 * FIELD_T + j0]
  const v01 = field[i0 * FIELD_T + j1]
  const v10 = field[i1 * FIELD_T + j0]
  const v11 = field[i1 * FIELD_T + j1]
  return (
    v00 * (1 - fa) * (1 - fr) + v10 * fa * (1 - fr) + v01 * (1 - fa) * fr + v11 * fa * fr
  )
}

/** Whether any enabled paint reaches this exact wheel position. */
export function isReachable(field: Float32Array, theta: number, t: number): boolean {
  return fieldAt(field, theta, t) < REACH_LIMIT
}

/**
 * Alpha of the shading over unreachable pixels, 0-255.
 *
 * Roughly 42% of the disk's AREA is unreachable by both catalogues together, so this is
 * not a small annotation in a corner — the value is a real trade between being seen and
 * not restating the wash.
 *
 * Compared on screen rather than reasoned about. 48 was invisible: the region was drawn
 * correctly, confirmed by counting non-zero pixels, and still could not be picked out
 * against the disk, which makes it a feature that does nothing. 110 reads immediately but
 * lands at the weight of the outside-mask wash (D28), so the two dimmings stop being
 * distinguishable and an unreachable area inside the mask looks like it is outside it. 80
 * is legible while staying clearly the lighter of the two.
 *
 * Set by eye on an uncalibrated display, like `--mask-wash-opacity`, and named for the
 * same reason.
 */
const SHADE_ALPHA = 80

/**
 * Renders the unreachable region as a neutral scrim, sized to match `renderDisk`.
 *
 * Same per-pixel structure as renderDisk and the same feathered edge, so the two line up
 * exactly at the rim. Depends only on the pixel dimensions and the field — NOT on the
 * mask — so the caller can cache it across mask edits, which is the whole reason the
 * field is separate from the sample list's matching.
 *
 * Grey rather than a hatch or a colour: a pattern at this size turns into moire against
 * the disk, and any tinted scrim shifts the hue underneath it, which is the one thing the
 * wheel must not do.
 */
export function renderUnreachable(size: number, dpr: number, field: Float32Array): ImageData {
  const side = Math.max(1, Math.round(size * dpr))
  const half = side / 2
  const data = new Uint8ClampedArray(side * side * 4)
  const feather = 1 / half

  for (let py = 0; py < side; py++) {
    const y = (py + 0.5) / half - 1
    for (let px = 0; px < side; px++) {
      const x = (px + 0.5) / half - 1
      const t = Math.sqrt(x * x + y * y)
      const coverage = (1 - t) / feather + 0.5
      if (coverage <= 0) continue

      // Same convention as color/wheel.ts: y points down, angle measured from up.
      const theta = Math.atan2(x, -y) * (180 / Math.PI)
      if (fieldAt(field, theta, t < 1 ? t : 1) < REACH_LIMIT) continue

      const i = (py * side + px) * 4
      // Deliberately black at low alpha rather than a mid grey: it darkens uniformly
      // instead of washing saturated hues toward grey, so the region still reads as the
      // colour it is.
      data[i + 3] = coverage >= 1 ? SHADE_ALPHA : Math.round(coverage * SHADE_ALPHA)
    }
  }

  return new ImageData(data, side, side)
}
