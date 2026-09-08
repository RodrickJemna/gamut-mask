import { describe, expect, it } from 'vitest'
import { polar, type Point } from '../color/wheel.ts'
import { buildPreset } from '../mask/presets.ts'
import {
  bounds,
  centroid,
  centroidExtent,
  clampPolygon,
  clampToDisk,
  containsPoint,
  minAdjacentDistance,
  signedArea,
  type Polygon,
} from './polygon.ts'

/**
 * CLAUDE.md names point-in-polygon with the even-odd rule — including non-convex and
 * self-intersecting polygons — as a test priority, so that is most of this file.
 *
 * The hard cases are checked against an INDEPENDENT implementation rather than
 * hand-computed expectations: `containsRef` runs the same crossing-number argument along
 * a vertical ray instead of a horizontal one. Two ray directions agreeing on a dense
 * grid is far stronger evidence than a handful of points I reasoned about myself, and it
 * cannot inherit a sign or index error from the implementation under test.
 */
function containsRef(poly: Polygon, p: Point): boolean {
  const n = poly.length
  if (n < 3) return false

  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (
      a.x > p.x !== b.x > p.x &&
      p.y < ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y
    ) {
      inside = !inside
    }
  }
  return inside
}

/** Distance from p to the closest edge, so near-boundary points can be skipped. */
function distToEdges(poly: Polygon, p: Point): number {
  let best = Infinity
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

/** Compares the two ray directions over a grid, skipping points near an edge. */
function agreesWithReference(poly: Polygon, steps = 60): void {
  let compared = 0
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      // Irrational-ish offset so grid points never land exactly on a vertex or edge.
      const p = {
        x: -1.2 + (2.4 * i) / steps + 0.00317,
        y: -1.2 + (2.4 * j) / steps + 0.00211,
      }
      if (distToEdges(poly, p) < 1e-6) continue
      expect(containsPoint(poly, p)).toBe(containsRef(poly, p))
      compared++
    }
  }
  expect(compared).toBeGreaterThan(1000)
}

const triangle: Polygon = [
  { x: 0, y: -0.8 },
  { x: 0.7, y: 0.5 },
  { x: -0.7, y: 0.5 },
]

describe('containsPoint — convex', () => {
  it('a point inside is inside, a point outside is not', () => {
    expect(containsPoint(triangle, { x: 0, y: 0 })).toBe(true)
    expect(containsPoint(triangle, { x: 0.9, y: -0.9 })).toBe(false)
  })

  it('agrees with the vertical-ray reference across the disk', () => {
    agreesWithReference(triangle)
  })

  it('is unaffected by winding direction', () => {
    const reversed = [...triangle].reverse()
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 40; j++) {
        const p = { x: -1 + i / 20 + 0.00317, y: -1 + j / 20 + 0.00211 }
        expect(containsPoint(triangle, p)).toBe(containsPoint(reversed, p))
      }
    }
  })

  it('is unaffected by rotating the vertex list', () => {
    const rotated: Polygon = [triangle[1], triangle[2], triangle[0]]
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 40; j++) {
        const p = { x: -1 + i / 20 + 0.00317, y: -1 + j / 20 + 0.00211 }
        expect(containsPoint(triangle, p)).toBe(containsPoint(rotated, p))
      }
    }
  })

  it('handles a horizontal edge exactly level with the query point', () => {
    // The bottom edge sits at y = 0.5; a query at that y must not double-count.
    const p = { x: 0, y: 0.5 }
    expect(containsPoint(triangle, p)).toBe(containsRef(triangle, p))
  })
})

describe('containsPoint — non-convex (D24)', () => {
  const lShape: Polygon = [
    { x: -0.8, y: -0.8 },
    { x: 0.0, y: -0.8 },
    { x: 0.0, y: 0.0 },
    { x: 0.8, y: 0.0 },
    { x: 0.8, y: 0.8 },
    { x: -0.8, y: 0.8 },
  ]

  it('excludes the notch and includes both arms', () => {
    expect(containsPoint(lShape, { x: -0.4, y: 0.4 })).toBe(true)
    expect(containsPoint(lShape, { x: 0.4, y: 0.4 })).toBe(true)
    expect(containsPoint(lShape, { x: 0.4, y: -0.4 })).toBe(false)
  })

  it('agrees with the reference over the L shape', () => {
    agreesWithReference(lShape)
  })

  it('agrees with the reference over a 5-armed star', () => {
    const star: Polygon = []
    for (let i = 0; i < 10; i++) {
      star.push(polar((i * 360) / 10, i % 2 === 0 ? 0.9 : 0.35))
    }
    agreesWithReference(star)
  })
})

describe('containsPoint — self-intersecting, even-odd (D24)', () => {
  const bowtie: Polygon = [
    { x: -0.8, y: -0.6 },
    { x: 0.8, y: -0.6 },
    { x: -0.8, y: 0.6 },
    { x: 0.8, y: 0.6 },
  ]

  it('agrees with the reference over a bowtie', () => {
    agreesWithReference(bowtie)
  })

  it('includes both lobes of the bowtie', () => {
    expect(containsPoint(bowtie, { x: 0, y: -0.5 })).toBe(true)
    expect(containsPoint(bowtie, { x: 0, y: 0.5 })).toBe(true)
  })

  /**
   * A pentagram drawn as one self-crossing 5-vertex ring. The centre has winding number
   * 2, so even-odd puts the inner pentagon OUTSIDE. This is the case that separates
   * even-odd from nonzero, and it is the shape a user can trivially produce by dragging
   * vertices past each other.
   */
  it('puts the inner pentagon of a pentagram OUTSIDE (even-odd, not nonzero)', () => {
    const pentagram: Polygon = []
    for (let i = 0; i < 5; i++) pentagram.push(polar((i * 144) % 360, 0.9))

    expect(containsPoint(pentagram, { x: 0, y: 0 })).toBe(false)
    // ...while the five points of the star are inside.
    expect(containsPoint(pentagram, polar(0, 0.75))).toBe(true)
    agreesWithReference(pentagram)
  })

  it('a ring doubled back on itself encloses nothing', () => {
    const doubled: Polygon = [
      { x: -0.5, y: 0 },
      { x: 0.5, y: 0 },
      { x: -0.5, y: 0 },
      { x: 0.5, y: 0 },
    ]
    expect(containsPoint(doubled, { x: 0, y: 0.1 })).toBe(false)
    expect(containsPoint(doubled, { x: 0, y: -0.1 })).toBe(false)
  })
})

describe('containsPoint — degenerate', () => {
  it('returns false everywhere for rings of fewer than 3 vertices', () => {
    for (const poly of [[], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 1 }]]) {
      expect(containsPoint(poly, { x: 0, y: 0 })).toBe(false)
      expect(containsPoint(poly, { x: 0.5, y: 0.5 })).toBe(false)
    }
  })

  it('returns false everywhere for a collinear ring', () => {
    const line: Polygon = [
      { x: -0.5, y: 0 },
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
    ]
    expect(containsPoint(line, { x: 0, y: 0.1 })).toBe(false)
    expect(containsPoint(line, { x: 0, y: -0.1 })).toBe(false)
  })
})

describe('clampToDisk (D22)', () => {
  it('returns interior points as the same object', () => {
    const p = { x: 0.3, y: -0.4 }
    expect(clampToDisk(p)).toBe(p)
  })

  it('projects radially, not axis-wise: (1,1) does not stay at (1,1)', () => {
    const c = clampToDisk({ x: 1, y: 1 })
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(1, 12)
    expect(c.x).toBeCloseTo(Math.SQRT1_2, 12)
    expect(c.y).toBeCloseTo(Math.SQRT1_2, 12)
  })

  it('preserves the angle when it clamps', () => {
    for (let theta = 0; theta < 360; theta += 7) {
      const far = polar(theta, 5)
      const c = clampToDisk(far)
      expect(Math.atan2(c.x, -c.y)).toBeCloseTo(Math.atan2(far.x, -far.y), 12)
    }
  })

  it('never returns a radius above 1', () => {
    for (let theta = 0; theta < 360; theta += 3) {
      for (const r of [1.0001, 1.5, 4, 100]) {
        const c = clampToDisk(polar(theta, r))
        expect(Math.hypot(c.x, c.y)).toBeLessThanOrEqual(1 + 1e-12)
      }
    }
  })

  it('handles the origin without dividing by zero', () => {
    const o = { x: 0, y: 0 }
    expect(clampToDisk(o)).toBe(o)
  })

  it('leaves a point exactly on the rim alone', () => {
    const p = polar(33, 1)
    expect(clampToDisk(p)).toBe(p)
  })
})

describe('clampPolygon', () => {
  it('returns the same array when nothing needed clamping', () => {
    expect(clampPolygon(triangle)).toBe(triangle)
  })

  it('clamps only the offending vertices', () => {
    const poly: Polygon = [{ x: 0, y: 0 }, polar(0, 3), { x: 0.2, y: 0.2 }]
    const out = clampPolygon(poly)
    expect(out).not.toBe(poly)
    expect(out[0]).toBe(poly[0])
    expect(out[2]).toBe(poly[2])
    expect(Math.hypot(out[1].x, out[1].y)).toBeCloseTo(1, 12)
  })
})

describe('signedArea / centroid', () => {
  const square: Polygon = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]

  it('unit square has area 1', () => {
    expect(Math.abs(signedArea(square))).toBeCloseTo(1, 12)
  })

  it('sign flips with winding', () => {
    const reversed = [...square].reverse()
    expect(Math.sign(signedArea(square))).toBe(-Math.sign(signedArea(reversed)))
  })

  it('is zero for degenerate rings', () => {
    expect(signedArea([])).toBe(0)
    expect(signedArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0)
    expect(signedArea([{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }])).toBeCloseTo(0, 12)
  })

  it('centroid of a symmetric polygon is its centre of symmetry', () => {
    expect(centroid(square).x).toBeCloseTo(0.5, 12)
    expect(centroid(square).y).toBeCloseTo(0.5, 12)
  })

  it('is the area centroid, not the vertex mean', () => {
    // Extra vertices crowded along one edge move the mean but not the area centroid.
    const crowded: Polygon = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.75, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    const c = centroid(crowded)
    const meanY = crowded.reduce((s, p) => s + p.y, 0) / crowded.length
    expect(c.y).toBeCloseTo(0.5, 9)
    expect(Math.abs(c.y - meanY)).toBeGreaterThan(0.1)
  })

  it('falls back to the vertex mean for a zero-area ring', () => {
    const line: Polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]
    const c = centroid(line)
    expect(Number.isFinite(c.x)).toBe(true)
    expect(c.x).toBeCloseTo(1, 12)
    expect(c.y).toBeCloseTo(0, 12)
  })
})

describe('bounds', () => {
  it('brackets every vertex', () => {
    const b = bounds(triangle)
    expect(b.minX).toBeCloseTo(-0.7, 12)
    expect(b.maxX).toBeCloseTo(0.7, 12)
    expect(b.minY).toBeCloseTo(-0.8, 12)
    expect(b.maxY).toBeCloseTo(0.5, 12)
  })

  it('is all zeros for an empty ring', () => {
    expect(bounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })
})

/**
 * These two size the drag handles, so what they measure is an editability property: a
 * handle wider than half the gap to its neighbour overlaps it, and whichever circle SVG
 * paints last wins the pointer.
 */
describe('minAdjacentDistance', () => {
  it('is the side length of a regular ring', () => {
    const square: Polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]
    expect(minAdjacentDistance(square)).toBeCloseTo(1, 12)
  })

  it('closes the ring, so the last-to-first edge counts', () => {
    const poly: Polygon = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0.25, y: 0 },
    ]
    // The short edge is the closing one, from {0.25,0} back to {0,0}.
    expect(minAdjacentDistance(poly)).toBeCloseTo(0.25, 12)
  })

  it('ignores coincident NON-adjacent vertices', () => {
    // A bowtie: vertices 0 and 2 are far apart, but the crossing means two edges pass
    // through the same region. D24 permits this shape and its handles are not crowded,
    // so a global minimum over all pairs would shrink them for no reason.
    const bowtie: Polygon = [
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
    ]
    expect(minAdjacentDistance(bowtie)).toBeCloseTo(2, 12)
  })

  it('is Infinity when there is no pair', () => {
    expect(minAdjacentDistance([])).toBe(Infinity)
    expect(minAdjacentDistance([{ x: 0, y: 0 }])).toBe(Infinity)
  })

  /**
   * Documents the measurement that motivated scaling the handles at all: the arc-based
   * presets are crowded at FULL size, not only when shrunk. Two hit circles of radius
   * 0.055 (HANDLE_HIT_RADIUS in MaskOverlay.tsx) need 0.11 of clearance.
   */
  it('shows the arc presets are already crowded at full size', () => {
    expect(minAdjacentDistance(buildPreset('triad', 0))).toBeGreaterThan(0.11)
    expect(minAdjacentDistance(buildPreset('split', 0))).toBeGreaterThan(0.11)
    expect(minAdjacentDistance(buildPreset('analogous', 0))).toBeLessThan(0.11)
    expect(minAdjacentDistance(buildPreset('atmospheric', 0))).toBeGreaterThan(0.11)
  })

  it('shrinks with the mask, which is what makes a fixed handle size wrong', () => {
    const full = buildPreset('triad', 0)
    const small = full.map((p) => ({ x: p.x * 0.2, y: p.y * 0.2 }))
    expect(minAdjacentDistance(small)).toBeCloseTo(minAdjacentDistance(full) * 0.2, 12)
  })
})

describe('centroidExtent', () => {
  it('is the circumradius of a square about its centre', () => {
    const square: Polygon = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
    ]
    expect(centroidExtent(square)).toBeCloseTo(Math.SQRT2, 12)
  })

  it('measures from the mask, not from the wheel centre', () => {
    // An off-centre triangle: its reach is small even though it sits far from the origin.
    const poly: Polygon = [
      { x: 0.8, y: 0 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: -0.1 },
    ]
    expect(centroidExtent(poly)).toBeLessThan(0.15)
  })

  it('is zero for an empty ring', () => {
    expect(centroidExtent([])).toBe(0)
  })
})
