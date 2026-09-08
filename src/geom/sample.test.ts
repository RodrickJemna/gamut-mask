import { describe, expect, it } from 'vitest'
import { angleOf, polar, radiusOf, sample as wheelSample, sampleSrgb8 } from '../color/wheel.ts'
import { containsPoint, signedArea, type Polygon } from './polygon.ts'
import { sampleMask } from './sample.ts'

/**
 * CLAUDE.md test priority: "identical mask input must produce an identical sample list".
 * That is the first block, and it is the whole reason this module contains no randomness.
 */

const bigTriad: Polygon = [polar(0, 0.85), polar(120, 0.85), polar(240, 0.85)]

const lShape: Polygon = [
  { x: -0.8, y: -0.8 },
  { x: 0, y: -0.8 },
  { x: 0, y: 0 },
  { x: 0.8, y: 0 },
  { x: 0.8, y: 0.8 },
  { x: -0.8, y: 0.8 },
]

const bowtie: Polygon = [
  { x: -0.8, y: -0.6 },
  { x: 0.8, y: -0.6 },
  { x: -0.8, y: 0.6 },
  { x: 0.8, y: 0.6 },
]

describe('determinism (D17)', () => {
  it('is bit-identical when called twice', () => {
    expect(sampleMask(bigTriad, 12)).toEqual(sampleMask(bigTriad, 12))
  })

  it('does not depend on object identity — a fresh copy gives the same list', () => {
    const copy = bigTriad.map((p) => ({ x: p.x, y: p.y }))
    expect(sampleMask(copy, 12)).toEqual(sampleMask(bigTriad, 12))
  })

  it('does not depend on where the vertex list starts', () => {
    const rotated: Polygon = [bigTriad[1], bigTriad[2], bigTriad[0]]
    expect(sampleMask(rotated, 12)).toEqual(sampleMask(bigTriad, 12))
  })

  it('does not depend on winding direction', () => {
    const reversed = [...bigTriad].reverse()
    expect(sampleMask(reversed, 12)).toEqual(sampleMask(bigTriad, 12))
  })

  it('does not depend on call order or leak state between calls', () => {
    const first = sampleMask(bigTriad, 12)
    sampleMask(lShape, 7)
    sampleMask(bowtie, 31)
    expect(sampleMask(bigTriad, 12)).toEqual(first)
  })

  it('reproduces the list after a full 360 degree rotation', () => {
    const spun: Polygon = bigTriad.map((p) => polar(angleOf(p.x, p.y) + 360, radiusOf(p.x, p.y)))
    const a = sampleMask(bigTriad, 12)
    const b = sampleMask(spun, 12)
    expect(b).toHaveLength(a.length)
    b.forEach((s, i) => {
      expect(s.x).toBeCloseTo(a[i].x, 9)
      expect(s.y).toBeCloseTo(a[i].y, 9)
    })
  })
})

describe('count (D17, D25)', () => {
  it('returns exactly n across the whole 4..32 range', () => {
    for (const n of [4, 8, 12, 20, 32]) {
      expect(sampleMask(bigTriad, n)).toHaveLength(n)
    }
  })

  it('never returns more than n', () => {
    for (const poly of [bigTriad, lShape, bowtie]) {
      for (const n of [4, 12, 32]) {
        expect(sampleMask(poly, n).length).toBeLessThanOrEqual(n)
      }
    }
  })

  it('returns an empty list for degenerate rings rather than throwing', () => {
    expect(sampleMask([], 12)).toEqual([])
    expect(sampleMask([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }], 12)).toEqual([])
    expect(sampleMask([{ x: -0.5, y: 0 }, { x: 0, y: 0 }, { x: 0.5, y: 0 }], 12)).toEqual([])
  })

  it('returns an empty list for a non-positive n', () => {
    expect(sampleMask(bigTriad, 0)).toEqual([])
    expect(sampleMask(bigTriad, -3)).toEqual([])
  })

  it('fills any mask of ordinary size', () => {
    for (const r of [0.5, 0.2, 0.1] ) {
      const poly: Polygon = [polar(0, r), polar(120, r), polar(240, r)]
      expect(sampleMask(poly, 12)).toHaveLength(12)
    }
  })

  /**
   * D25 via D39. The pitch floor is what makes the shortfall reachable: without it the
   * grid just gets finer as the mask shrinks, so N always fit and a radius-0.002 mask
   * returned 12 indistinguishable greys.
   */
  it('returns progressively fewer samples as the mask shrinks past the pitch floor', () => {
    const counts = [0.1, 0.06, 0.02, 0.01].map((r) =>
      sampleMask([polar(0, r), polar(120, r), polar(240, r)], 12).length,
    )
    expect(counts[0]).toBe(12)
    expect(counts[1]).toBeLessThan(12)
    expect(counts[3]).toBeLessThanOrEqual(counts[2])
    expect(counts[2]).toBeLessThanOrEqual(counts[1])
    for (const c of counts) expect(c).toBeGreaterThan(0)
  })

  it('never returns two samples with the same colour, at any mask size', () => {
    for (const r of [0.5, 0.1, 0.06, 0.02, 0.01]) {
      const samples = sampleMask([polar(0, r), polar(120, r), polar(240, r)], 12)
      const hexes = new Set(samples.map((s) => s.rgb8.join(',')))
      expect(hexes.size).toBe(samples.length)
    }
  })

  /**
   * Regression guard for a real bug, not a hypothetical one. The first pitch probe used
   * to run with no cell-cap check, so a hair-thin diagonal sliver — which a user can
   * produce just by dragging three vertices nearly collinear — scanned about 15 million
   * grid cells and cost 162 ms. Per drag frame. It is now ~0.3 ms; the bound is loose so
   * this does not turn into a flaky timing test.
   */
  it('handles a hair-thin sliver quickly instead of grinding (perf regression)', () => {
    const sliver: Polygon = [
      { x: -0.65, y: -0.65 },
      { x: 0.65, y: 0.65 },
      { x: 0.65 + 1e-6, y: 0.65 - 1e-6 },
    ]
    const started = performance.now()
    const out = sampleMask(sliver, 12)
    const elapsed = performance.now() - started
    expect(out.length).toBeLessThanOrEqual(12)
    expect(elapsed).toBeLessThan(50)
  })
})

describe('placement', () => {
  it('puts every sample inside the polygon, by the same even-odd rule (D24)', () => {
    for (const poly of [bigTriad, lShape, bowtie]) {
      for (const s of sampleMask(poly, 24)) {
        expect(containsPoint(poly, { x: s.x, y: s.y })).toBe(true)
      }
    }
  })

  it('puts every sample inside the disk', () => {
    const wide: Polygon = [polar(0, 1), polar(120, 1), polar(240, 1)]
    for (const s of sampleMask(wide, 32)) {
      expect(radiusOf(s.x, s.y)).toBeLessThanOrEqual(1 + 1e-12)
    }
  })

  it('avoids the notch of a non-convex mask', () => {
    for (const s of sampleMask(lShape, 20)) {
      // The notch is the quadrant x > 0, y < 0.
      expect(s.x > 0 && s.y < 0).toBe(false)
    }
  })

  /**
   * Regression for a real bug. The pitch used to be seeded from signedArea, which is the
   * ALGEBRAIC area: a self-intersecting ring's lobes carry opposite signs, so a symmetric
   * bowtie measures exactly zero. sampleMask therefore returned an empty list for a shape
   * D24 explicitly permits — drag one vertex across another and the colour list silently
   * emptied. The pitch is now seeded from the bounding box, which has no such failure.
   */
  it('fills a bowtie whose algebraic area is exactly zero', () => {
    expect(Math.abs(signedArea(bowtie))).toBeLessThan(1e-12)
    expect(sampleMask(bowtie, 12)).toHaveLength(12)
  })

  it('lands in both lobes of a bowtie and never in the excluded middle', () => {
    const samples = sampleMask(bowtie, 24)
    expect(samples.some((s) => s.y < -0.1)).toBe(true)
    expect(samples.some((s) => s.y > 0.1)).toBe(true)
    for (const s of samples) {
      expect(containsPoint(bowtie, { x: s.x, y: s.y })).toBe(true)
    }
  })

  it('never places two samples at the same point', () => {
    for (const poly of [bigTriad, lShape, bowtie]) {
      const samples = sampleMask(poly, 32)
      const keys = new Set(samples.map((s) => `${s.x},${s.y}`))
      expect(keys.size).toBe(samples.length)
    }
  })
})

describe('ordering and payload', () => {
  it('is sorted by angle ascending (D17)', () => {
    for (const poly of [bigTriad, lShape, bowtie]) {
      const samples = sampleMask(poly, 20)
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i].theta).toBeGreaterThanOrEqual(samples[i - 1].theta)
      }
    }
  })

  it('reports theta and t consistent with its own coordinates', () => {
    for (const s of sampleMask(bigTriad, 16)) {
      expect(s.theta).toBeCloseTo(angleOf(s.x, s.y), 9)
      expect(s.t).toBeCloseTo(radiusOf(s.x, s.y), 12)
    }
  })

  it('carries the colour the wheel model gives for that position', () => {
    for (const s of sampleMask(bigTriad, 16)) {
      expect(s.rgb8).toEqual(sampleSrgb8(s.theta, s.t))
      expect(s.oklabL).toBeCloseTo(wheelSample(s.theta, s.t).L, 12)
    }
  })

  it('spans a narrow angle range for a mask confined to one hue family', () => {
    const wedge: Polygon = [polar(80, 0.2), polar(80, 0.95), polar(100, 0.95), polar(100, 0.2)]
    const thetas = sampleMask(wedge, 12).map((s) => s.theta)
    expect(Math.max(...thetas) - Math.min(...thetas)).toBeLessThan(30)
  })
})
