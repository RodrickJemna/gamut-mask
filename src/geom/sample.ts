/**
 * The colours to list beside the wheel. Spec: D17 (revised in 0.19), D47, F6.
 *
 * The sample set is the mask's own geometry, in two rings:
 *
 *   - the CENTRE
 *   - each VERTEX, and the MIDPOINT of each EDGE            (the outer ring)
 *   - the halfway point from each of those to the centre    (the inner ring)
 *
 * For a triad that is thirteen colours: three hues at the corners (82% saturation),
 * three muted mixtures halfway along the edges and three half-strength corners (both at
 * 41%), three half-strength edge mixtures (~21%), and the neutral. That is a limited
 * palette with its own muted range — what a painter gets by pulling each colour toward
 * the neutral they mix on.
 *
 * This replaces the grid search and Lloyd relaxation the earlier version used. That
 * produced an even scatter of N colours, which is a fair description of the mask's area
 * but not a palette: the points it chose were arbitrary, and none of them was the
 * corner or the neutral you actually mix from. Structured sampling is also trivially
 * deterministic (D17's requirement) rather than deterministic-by-construction, and it
 * deleted the pitch search, the cell cap and the raster Lloyd pass along with their
 * failure modes.
 *
 * The count now follows the shape rather than a slider: add a vertex and you get two
 * more candidates. The Colours slider went with the old algorithm — see D47.
 */

import { oklabDistance, oklabToSrgb8, type Oklab } from '../color/oklab.ts'
import {
  angleOf,
  radiusOf,
  sample as wheelSample,
  type Point,
  type WheelSpec,
} from '../color/wheel.ts'
import { centroid, type Polygon } from './polygon.ts'

export type Sample = {
  x: number
  y: number
  theta: number
  t: number
  rgb8: [number, number, number]
  /** The full Oklab value, so paint matching does not have to recompute it. */
  oklab: Oklab
}

/**
 * Minimum Oklab separation between listed colours.
 *
 * Set to the paint-match tolerance on purpose: two colours closer together than that
 * resolve to the same bottle, so listing both is noise rather than information. It is
 * written here as a number instead of imported from the paints module — geometry should
 * not depend on the catalogue — and the two are meant to stay equal.
 *
 * It matters most for the arc-based presets, whose vertices exist to make a curve look
 * smooth rather than to mark anything. Raw, the analogous wedge yields 31 candidates and
 * the atmospheric blob 29, nearly all near-duplicates; separated, they give 8 and 11.
 * The triad and split-complementary keep all 7 either way.
 *
 * It also gives D25 real teeth: shrink a mask far enough and its candidates collapse
 * into each other, so fewer colours come back — which is what D25 always described and
 * the grid sampler never actually did.
 */
const MIN_SEPARATION = 0.05

/**
 * Below this radius a point is the neutral centre and has no hue.
 *
 * It needs saying explicitly, because `angleOf` on coordinates that are float noise
 * returns noise: the centroid of a symmetric mask lands within ~1e-17 of the origin, and
 * its "angle" then flips around under any harmless recomputation. That made the sorted
 * list unstable, and would have filed a pure grey under whichever hue wedge the noise
 * happened to name.
 */
const NEUTRAL_RADIUS = 1e-9

function toSample(p: Point, wheel?: WheelSpec): Sample {
  const radius = radiusOf(p.x, p.y)
  const neutral = radius < NEUTRAL_RADIUS
  // Snapped to the origin and to angle 0, so a neutral is one fixed, reproducible entry.
  const x = neutral ? 0 : p.x
  const y = neutral ? 0 : p.y
  const theta = neutral ? 0 : angleOf(p.x, p.y)
  const t = neutral ? 0 : Math.min(1, radius)
  const lab = wheelSample(theta, t, wheel)
  return { x, y, theta, t, rgb8: oklabToSrgb8(lab), oklab: lab }
}

const halfway = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

/**
 * Candidates in priority order: centre, vertices, edge midpoints, then the inner ring —
 * each of those pulled halfway toward the centre.
 *
 * Order is what the separation test resolves ties by, since earlier candidates win. So
 * the structural points (the centre, the corners, the edge midpoints) survive in
 * preference to the half-strength versions derived from them.
 */
function candidates(poly: Polygon): Point[] {
  const centre = centroid(poly)
  const vertices = [...poly]
  const edgeMidpoints = poly.map((v, i) => halfway(v, poly[(i + 1) % poly.length]))

  return [
    centre,
    ...vertices,
    ...edgeMidpoints,
    ...vertices.map((p) => halfway(p, centre)),
    ...edgeMidpoints.map((p) => halfway(p, centre)),
  ]
}

/**
 * The colours inside the mask, sorted by angle (D17).
 *
 * Vertices sit ON the boundary rather than strictly inside it. That is deliberate: the
 * corner colour is the extreme of the palette and is the one worth showing, and the
 * wheel's colour at a point is well defined regardless of which side of the outline it
 * falls on.
 */
export function sampleMask(poly: Polygon, wheel?: WheelSpec): Sample[] {
  if (poly.length < 3) return []

  const kept: Sample[] = []
  for (const point of candidates(poly)) {
    if (radiusOf(point.x, point.y) > 1 + 1e-9) continue
    const candidate = toSample(point, wheel)
    const tooClose = kept.some(
      (k) => oklabDistance(k.oklab, candidate.oklab) < MIN_SEPARATION,
    )
    if (!tooClose) kept.push(candidate)
  }
  /**
   * Sorted by angle (D17), then by saturation descending so a hue reads outer-ring
   * first.
   *
   * The angle is QUANTISED for the comparison, which is the part that matters. The inner
   * ring puts several colours on the same hue — a corner and its half-strength version —
   * but their thetas agree only to about 1e-13, so comparing the raw values let that
   * noise decide the order and a harmless recomputation could reshuffle the list. A
   * rounded integer key is a proper total order and is stable against noise many orders
   * of magnitude larger than the difference it discards.
   *
   * `(theta, t)` is unique here: two candidates sharing both would be the same point, and
   * the separation test above would already have dropped one.
   */
  const hueKey = (s: Sample) => Math.round(s.theta * 1e6)
  return kept.sort((a, b) => hueKey(a) - hueKey(b) || b.t - a.t)
}
