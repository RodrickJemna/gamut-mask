/**
 * Polygon primitives in wheel space. Spec: D22, D24, F2.
 *
 * Coordinates are wheel space throughout (docs/implementation-plan.md section 2):
 * centre origin, radius 1, y down.
 *
 * Rings are stored OPEN — the first vertex is not repeated at the end. Every function
 * here closes the ring itself with modular indices. Mixing the two conventions in one
 * codebase reliably produces off-by-one bugs in the hit test.
 */

import type { Point } from '../color/wheel.ts'

export type Polygon = Point[]

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Even-odd containment (D24). Non-convex polygons are allowed and self-intersection is
 * explicitly not forbidden, so the rule must be even-odd — and it must be the SAME rule
 * used by the SVG wash (fill-rule="evenodd") and by the sampler. Three places, one rule;
 * if they disagree the list shows colours the shading says are excluded.
 *
 * Crossing-number test. The `!==` on the two y-comparisons is what makes a vertex lying
 * on the test ray count once rather than twice — it must not become `>=`. It also
 * guarantees `b.y !== a.y` inside the branch, so the division is safe.
 *
 * Behaviour for a point exactly on an edge is undefined and does not matter here; no
 * epsilon is used to chase it.
 */
export function containsPoint(poly: Polygon, p: Point): boolean {
  const n = poly.length
  if (n < 3) return false

  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/**
 * D22: vertices may not leave the disk, they stick to the boundary.
 *
 * Radial projection, not an axis-wise clamp — an axis-wise clamp would leave a vertex at
 * (1,1), which is outside the disk.
 *
 * Sticking is genuinely lossy: drag a vertex past the rim and back and it does not
 * return, because the original radius is gone. That is what D22 asks for, and it is why
 * rotation and size are stored as scalars rather than baked into the vertices — see
 * transform.ts.
 *
 * Returns the same object when the point is already inside, so callers can use identity
 * to detect "nothing changed".
 */
export function clampToDisk(p: Point): Point {
  const r = Math.hypot(p.x, p.y)
  if (r <= 1) return p
  return { x: p.x / r, y: p.y / r }
}

/** Returns the same array when every vertex was already inside. */
export function clampPolygon(poly: Polygon): Polygon {
  let changed = false
  const out = poly.map((p) => {
    const c = clampToDisk(p)
    if (c !== p) changed = true
    return c
  })
  return changed ? out : poly
}

/** Shoelace. Sign carries the winding direction; magnitude is the area. */
export function signedArea(poly: Polygon): number {
  const n = poly.length
  if (n < 3) return 0

  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/**
 * Area centroid, not the vertex mean — the sampler uses it as a fallback and the two
 * differ badly on polygons with unevenly spaced vertices.
 *
 * Degenerate (zero-area) rings fall back to the vertex mean instead of dividing by zero.
 */
export function centroid(poly: Polygon): Point {
  const n = poly.length
  if (n === 0) return { x: 0, y: 0 }

  const area = signedArea(poly)
  if (Math.abs(area) < 1e-12) {
    let sx = 0
    let sy = 0
    for (const p of poly) {
      sx += p.x
      sy += p.y
    }
    return { x: sx / n, y: sy / n }
  }

  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const cross = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

export function bounds(poly: Polygon): Bounds {
  if (poly.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/**
 * The shortest distance between two ADJACENT vertices, closing the ring.
 *
 * Used to size the drag handles so they cannot overlap each other: two equal circles
 * spaced `d` apart stop overlapping at radius `d / 2`. Adjacency is what matters rather
 * than the global minimum over all pairs, because non-adjacent vertices of a
 * self-intersecting mask (D24) may legitimately sit on top of one another, and shrinking
 * every handle because of that would be wrong.
 *
 * Returns Infinity for a ring too short to have a pair, so callers clamp to their own
 * maximum without a special case.
 */
export function minAdjacentDistance(poly: Polygon): number {
  if (poly.length < 2) return Infinity
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    if (d < min) min = d
  }
  return min
}

/** Largest distance from the area centroid to a vertex — how far the mask reaches. */
export function centroidExtent(poly: Polygon): number {
  if (poly.length === 0) return 0
  const c = centroid(poly)
  let max = 0
  for (const p of poly) {
    const d = Math.hypot(p.x - c.x, p.y - c.y)
    if (d > max) max = d
  }
  return max
}
