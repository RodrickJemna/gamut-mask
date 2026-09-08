/**
 * Deterministic sampling of the colours inside the mask. Spec: D17, D25, F6.
 *
 * WHY DETERMINISTIC (D17). Random or Poisson-disc sampling re-rolls on every mask
 * movement, so the list under the wheel flickers and renumbers while the user drags a
 * slider — which destroys the one thing the tool is for, comparing two mask positions.
 * So: a fixed grid, its pitch searched to hit N, then a few Lloyd iterations to even the
 * spacing, then sorted by angle. No randomness anywhere in this file.
 */

import {
  angleOf,
  radiusOf,
  sample as wheelSample,
  type Point,
} from '../color/wheel.ts'
import { oklabToSrgb8, type Oklab } from '../color/oklab.ts'
import {
  bounds,
  clampToDisk,
  containsPoint,
  type Bounds,
  type Polygon,
} from './polygon.ts'

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
 * Upper bound on grid cells examined in any one pitch probe, and the reason this file
 * cannot hang the UI thread.
 *
 * A mask can have positive area yet fill almost none of its bounding box, and then the
 * pitch an even spread wants implies a grid of millions of cells. The cap bounds every
 * probe, so total work is bounded by cap x vertices x iterations regardless of how
 * degenerate the mask is.
 *
 * It is also what makes D25 reachable: when the cap stops the search before N points
 * fit, fewer samples come back rather than the search grinding on. A normal mask probes
 * only tens of cells, so the cap never binds in ordinary use.
 */
const CELL_CAP = 40_000

/** Target number of raster cells for the Lloyd pass — a budget, not a fixed pitch. */
const LLOYD_CELLS = 3000

const LLOYD_ITERATIONS = 3

/**
 * Smallest grid pitch the search will use, in wheel units — and the reason D25's
 * shortfall branch is now reachable.
 *
 * Without a floor the pitch adapts to the mask without limit, so shrinking the mask only
 * makes the grid finer and N always fits. D25 anticipates the opposite ("if N samples do
 * not fit, fewer come"), and that intent went unrealised: a radius-0.002 mask still
 * returned 12 samples, which were 12 indistinguishable greys.
 *
 * 0.015 is measured, not chosen by taste. Stepping radially by 0.015 anywhere on the
 * wheel changes the 8-bit output by about 3 of 255 levels, and near the neutral centre —
 * the flattest region, and the one a tiny mask lives in — by exactly 3. Below that,
 * samples are duplicates in everything but coordinates.
 *
 * It cannot affect a mask of ordinary size: a triad needs a radius under roughly 0.05
 * before the floor binds at all.
 *
 * Note what this does NOT claim. Two samples at the same radius near the centre are both
 * near-grey however far apart they are; no spacing rule can fix that. The floor stops the
 * sampler reporting more colours than a region can hold, which is exactly D25's point.
 */
const MIN_PITCH = 0.015

function cellCount(b: Bounds, pitch: number): number {
  const nx = Math.floor(b.maxX / pitch) - Math.ceil(b.minX / pitch) + 1
  const ny = Math.floor(b.maxY / pitch) - Math.ceil(b.minY / pitch) + 1
  return Math.max(0, nx) * Math.max(0, ny)
}

/**
 * Grid points inside the polygon and inside the disk, in row-major order.
 *
 * The grid is anchored to the WHEEL ORIGIN, not to the polygon's bounding box. Both are
 * deterministic and so both satisfy D17, but origin-anchored is much calmer in the hand:
 * as the mask moves, points enter and leave at its edges while the ones in the middle
 * stay put. A bbox-anchored grid slides the whole set every frame, which reintroduces
 * most of the flicker D17 exists to remove.
 *
 * Positions are computed as `index * pitch` rather than by accumulating `+= pitch`, so
 * they are exact and cannot drift along a row.
 */
function gridPoints(poly: Polygon, b: Bounds, pitch: number): Point[] {
  const out: Point[] = []
  const i0 = Math.ceil(b.minX / pitch)
  const i1 = Math.floor(b.maxX / pitch)
  const j0 = Math.ceil(b.minY / pitch)
  const j1 = Math.floor(b.maxY / pitch)

  for (let j = j0; j <= j1; j++) {
    const y = j * pitch
    for (let i = i0; i <= i1; i++) {
      const x = i * pitch
      if (x * x + y * y > 1) continue
      const p = { x, y }
      if (containsPoint(poly, p)) out.push(p)
    }
  }
  return out
}

/**
 * Finds a pitch whose grid holds at least `n` points, then trims to exactly `n`.
 *
 * Targeting "at least n and trim" rather than "the largest count not exceeding n" is
 * what guarantees exactly `n` samples whenever `n` of them fit at all — the count is a
 * step function of pitch, so an exact hit often does not exist for any pitch.
 *
 * The pitch is seeded from the BOUNDING BOX, never from the polygon's area. Shoelace area
 * is the algebraic area, and for a self-intersecting ring the lobes carry opposite signs:
 * a symmetric bowtie has area exactly zero. D24 allows exactly that shape, so keying
 * anything off signedArea here made the sample list silently empty as soon as the user
 * dragged one vertex across another. The bounding box has no such failure mode, and the
 * search refines from it anyway.
 *
 * Returns the pitch alongside the points so the Lloyd pass can size its raster from it
 * without needing an area either.
 */
function seedPoints(poly: Polygon, n: number): { points: Point[]; pitch: number } {
  const b = bounds(poly)
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY)
  if (!(span > 0)) return { points: [], pitch: 0 }

  // Coarse enough to under-fill, so the halving loop below approaches n from beneath.
  let lo = Math.max(MIN_PITCH, span / Math.ceil(Math.sqrt(n)))
  let hi = span * 2

  // Never probe a pitch whose grid exceeds the cap. A mask filling almost none of its
  // bounding box — a hair-thin sliver, which the user can make by dragging three
  // vertices nearly collinear — would otherwise imply millions of cells on the very
  // first probe. That cost 162 ms per drag frame before this guard existed.
  while (cellCount(b, lo) > CELL_CAP) lo *= 2

  let loPoints = gridPoints(poly, b, lo)
  while (loPoints.length < n) {
    const next = lo / 2
    // Stop at the floor rather than chasing N into indistinguishable colours (D25).
    if (next < MIN_PITCH || cellCount(b, next) > CELL_CAP) break
    lo = next
    loPoints = gridPoints(poly, b, lo)
  }
  if (loPoints.length < n) return { points: loPoints, pitch: lo } // D25: will not fit

  if (hi <= lo) hi = lo * 2

  // Bisect toward the largest pitch that still holds n points, so the seeds are as
  // evenly spread as the grid allows before Lloyd runs. Every probe is coarser than
  // `lo`, so none can exceed the cell cap. 16 steps is ample — Lloyd evens out the
  // rest, and each extra step is another full grid scan.
  let best = loPoints
  let bestPitch = lo
  for (let k = 0; k < 16; k++) {
    const mid = (lo + hi) / 2
    const pts = gridPoints(poly, b, mid)
    if (pts.length >= n) {
      lo = mid
      best = pts
      bestPitch = mid
    } else {
      hi = mid
    }
  }

  if (best.length === n) return { points: best, pitch: bestPitch }
  // Trim the surplus by taking evenly spaced entries in scan order, so the loss is
  // spread across the mask rather than clipped off one edge. Lloyd evens out the rest.
  const kept: Point[] = []
  for (let i = 0; i < n; i++) kept.push(best[Math.floor((i * best.length) / n)])
  return { points: kept, pitch: bestPitch }
}

/**
 * Lloyd relaxation, rasterised rather than with real Voronoi cells: a fixed fine grid
 * over the interior, each cell assigned to its nearest sample, each sample moved to the
 * centroid of its cells. Deterministic, no cell clipping, no geometry library.
 *
 * Ties are broken by lowest sample index so the outcome cannot depend on iteration
 * order. A sample that wins no cells stays where it is.
 *
 * A centroid can leave a non-convex polygon (D24), so the move is rejected unless the
 * new position is still inside. Keeping such a sample outside would list a colour that
 * the wash marks as excluded.
 */
function relax(poly: Polygon, pts: Point[], pitch: number): Point[] {
  if (pts.length === 0 || !(pitch > 0)) return pts

  const b = bounds(poly)
  // The seed grid held about pts.length points at `pitch`, so the enclosed area is
  // roughly pts.length * pitch^2 — enough to size the raster without measuring an area
  // that self-intersecting rings cannot report correctly anyway.
  const finePitch = pitch * Math.sqrt(pts.length / LLOYD_CELLS)
  if (!(finePitch > 0) || cellCount(b, finePitch) > CELL_CAP) return pts
  const cells = gridPoints(poly, b, finePitch)
  if (cells.length === 0) return pts

  let current = pts
  for (let iter = 0; iter < LLOYD_ITERATIONS; iter++) {
    const sumX = new Float64Array(current.length)
    const sumY = new Float64Array(current.length)
    const count = new Int32Array(current.length)

    for (const cell of cells) {
      let bestIndex = 0
      let bestDist = Infinity
      for (let s = 0; s < current.length; s++) {
        const dx = cell.x - current[s].x
        const dy = cell.y - current[s].y
        const d = dx * dx + dy * dy
        if (d < bestDist) {
          bestDist = d
          bestIndex = s
        }
      }
      sumX[bestIndex] += cell.x
      sumY[bestIndex] += cell.y
      count[bestIndex]++
    }

    current = current.map((p, s) => {
      if (count[s] === 0) return p
      const moved = clampToDisk({ x: sumX[s] / count[s], y: sumY[s] / count[s] })
      return containsPoint(poly, moved) ? moved : p
    })
  }
  return current
}

/**
 * The colours inside the mask, sorted by angle (D17).
 *
 * `n` is 12 by default with a 4-32 range (D17); the reducer owns that clamp. Fewer than
 * `n` come back when the mask cannot hold them, and this function neither pads, falls
 * back to random fill, nor throws (D25) — SampleList reports the real count.
 */
export function sampleMask(poly: Polygon, n: number): Sample[] {
  if (poly.length < 3 || n <= 0) return []

  const seeded = seedPoints(poly, n)
  const points = relax(poly, seeded.points, seeded.pitch)

  return points
    .map((p) => {
      const theta = angleOf(p.x, p.y)
      const t = radiusOf(p.x, p.y)
      const lab = wheelSample(theta, t)
      return {
        x: p.x,
        y: p.y,
        theta,
        t,
        rgb8: oklabToSrgb8(lab),
        oklab: lab,
      }
    })
    .sort((a, b) => a.theta - b.theta)
}
