import { describe, expect, it } from 'vitest'
import { angleOf, normalizeAngle, polar, radiusOf } from '../color/wheel.ts'
import { signedArea, type Polygon } from './polygon.ts'
import { rotate, scale, translate } from './transform.ts'

/**
 * Tolerances here are measured: the polar formulation drifts by about 2e-16 in radius
 * over a full sweep and 3e-16 in position across rotate(360), so 1e-12 is generous
 * headroom rather than a guess.
 */

const poly: Polygon = [
  polar(0, 0.8),
  polar(120, 0.6),
  polar(250, 0.95),
  polar(310, 0.3),
]

describe('rotate', () => {
  it('rotate by 0 is the identity, same object', () => {
    expect(rotate(poly, 0)).toBe(poly)
  })

  it('rotate by 360 returns the original', () => {
    rotate(poly, 360).forEach((p, i) => {
      expect(p.x).toBeCloseTo(poly[i].x, 12)
      expect(p.y).toBeCloseTo(poly[i].y, 12)
    })
  })

  it('preserves every vertex radius', () => {
    for (let d = 0; d < 360; d += 11) {
      rotate(poly, d).forEach((p, i) => {
        expect(radiusOf(p.x, p.y)).toBeCloseTo(radiusOf(poly[i].x, poly[i].y), 12)
      })
    }
  })

  it('advances every vertex angle by exactly delta', () => {
    for (const d of [1, 37, 90, 180, 271]) {
      rotate(poly, d).forEach((p, i) => {
        const expected = normalizeAngle(angleOf(poly[i].x, poly[i].y) + d)
        expect(angleOf(p.x, p.y)).toBeCloseTo(expected, 9)
      })
    }
  })

  it('composes: rotate(a) then rotate(b) equals rotate(a + b)', () => {
    const twice = rotate(rotate(poly, 37), 88)
    const once = rotate(poly, 125)
    twice.forEach((p, i) => {
      expect(p.x).toBeCloseTo(once[i].x, 12)
      expect(p.y).toBeCloseTo(once[i].y, 12)
    })
  })

  it('preserves vertex count and area', () => {
    const r = rotate(poly, 47)
    expect(r).toHaveLength(poly.length)
    expect(Math.abs(signedArea(r))).toBeCloseTo(Math.abs(signedArea(poly)), 12)
  })

  it('does not mirror: winding sign is unchanged', () => {
    for (const d of [13, 97, 200, 359]) {
      expect(Math.sign(signedArea(rotate(poly, d)))).toBe(Math.sign(signedArea(poly)))
    }
  })

  it('accepts negative and over-360 deltas', () => {
    const neg = rotate(poly, -90)
    const equiv = rotate(poly, 270)
    neg.forEach((p, i) => {
      expect(p.x).toBeCloseTo(equiv[i].x, 12)
      expect(p.y).toBeCloseTo(equiv[i].y, 12)
    })
    const over = rotate(poly, 450)
    const same = rotate(poly, 90)
    over.forEach((p, i) => {
      expect(p.x).toBeCloseTo(same[i].x, 12)
      expect(p.y).toBeCloseTo(same[i].y, 12)
    })
  })

  it('leaves a vertex at the centre at the centre', () => {
    const withCentre: Polygon = [{ x: 0, y: 0 }, polar(10, 0.5), polar(200, 0.5)]
    const r = rotate(withCentre, 45)
    expect(r[0].x).toBe(0)
    expect(r[0].y).toBe(0)
  })

  it('keeps every vertex inside the disk (D22)', () => {
    const onRim: Polygon = [polar(0, 1), polar(90, 1), polar(200, 1)]
    for (let d = 0; d < 360; d += 7) {
      for (const p of rotate(onRim, d)) {
        expect(radiusOf(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-12)
      }
    }
  })
})

describe('scale', () => {
  it('scale by 1 is the identity, same object', () => {
    expect(scale(poly, 1)).toBe(poly)
  })

  it('preserves every vertex angle exactly when nothing clamps', () => {
    for (const f of [0.1, 0.5, 0.9]) {
      scale(poly, f).forEach((p, i) => {
        expect(angleOf(p.x, p.y)).toBe(angleOf(poly[i].x, poly[i].y))
      })
    }
  })

  it('multiplies interior radii by the factor', () => {
    for (const f of [0.25, 0.5, 0.75]) {
      scale(poly, f).forEach((p, i) => {
        expect(radiusOf(p.x, p.y)).toBeCloseTo(radiusOf(poly[i].x, poly[i].y) * f, 12)
      })
    }
  })

  it('clamps vertices that would leave the disk, keeping their angle (D22)', () => {
    const scaled = scale(poly, 4)
    scaled.forEach((p, i) => {
      expect(radiusOf(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-12)
      expect(angleOf(p.x, p.y)).toBeCloseTo(angleOf(poly[i].x, poly[i].y), 9)
    })
    // The 0.95 vertex must have hit the rim.
    expect(radiusOf(scaled[2].x, scaled[2].y)).toBeCloseTo(1, 12)
  })

  it('scale by 0 collapses to the origin without NaN', () => {
    for (const p of scale(poly, 0)) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(radiusOf(p.x, p.y)).toBe(0)
    }
  })

  it('stays inside the disk for very large factors', () => {
    for (const f of [10, 1e3, 1e6]) {
      for (const p of scale(poly, f)) {
        expect(radiusOf(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-12)
      }
    }
  })

  /**
   * The reason `size` is a scalar in state rather than baked into the vertices (D22 is
   * lossy). Scaling up past the rim and back down does NOT restore the shape — this test
   * pins that down so the state design has a concrete reason attached to it.
   */
  it('is lossy once a vertex hits the rim, which is why size is stored as a scalar', () => {
    const there = scale(poly, 4)
    const andBack = scale(there, 0.25)
    const worst = Math.max(
      ...andBack.map((p, i) => Math.hypot(p.x - poly[i].x, p.y - poly[i].y)),
    )
    expect(worst).toBeGreaterThan(0.01)
  })
})

describe('translate (D42)', () => {
  it('a zero offset is the identity, same object', () => {
    expect(translate(poly, { x: 0, y: 0 })).toBe(poly)
  })

  it('shifts every vertex by the offset', () => {
    const moved = translate(poly, { x: 0.05, y: -0.04 })
    moved.forEach((p, i) => {
      expect(p.x).toBeCloseTo(poly[i].x + 0.05, 12)
      expect(p.y).toBeCloseTo(poly[i].y - 0.04, 12)
    })
  })

  it('preserves shape — area and vertex count are unchanged', () => {
    const moved = translate(poly, { x: 0.03, y: 0.02 })
    expect(moved).toHaveLength(poly.length)
    expect(Math.abs(signedArea(moved))).toBeCloseTo(Math.abs(signedArea(poly)), 12)
  })

  it('clamps vertices to the disk itself (D22)', () => {
    // rotate and scale short-circuit on their identity values, so at rotation 0 and
    // size 1 nothing downstream would clamp a dragged mask.
    for (const p of translate(poly, { x: 0.9, y: 0.9 })) {
      expect(radiusOf(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-12)
    }
  })

  it('composes: two translations equal their sum, while nothing clamps', () => {
    const twice = translate(translate(poly, { x: 0.02, y: 0.01 }), { x: 0.03, y: 0.02 })
    const once = translate(poly, { x: 0.05, y: 0.03 })
    twice.forEach((p, i) => {
      expect(p.x).toBeCloseTo(once[i].x, 12)
      expect(p.y).toBeCloseTo(once[i].y, 12)
    })
  })
})

describe('rotate and scale commute when nothing clamps', () => {
  it('rotate then scale equals scale then rotate', () => {
    const a = scale(rotate(poly, 63), 0.5)
    const b = rotate(scale(poly, 0.5), 63)
    a.forEach((p, i) => {
      expect(p.x).toBeCloseTo(b[i].x, 12)
      expect(p.y).toBeCloseTo(b[i].y, 12)
    })
  })
})
