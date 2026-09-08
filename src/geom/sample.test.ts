import { describe, expect, it } from 'vitest'
import { oklabDistance } from '../color/oklab.ts'
import { angleOf, polar, radiusOf, sample as wheelSample, sampleSrgb8 } from '../color/wheel.ts'
import { buildPreset } from '../mask/presets.ts'
import { centroid, signedArea, type Polygon } from './polygon.ts'
import { sampleMask } from './sample.ts'

/**
 * The sample set is the mask's own geometry (D47): centre, vertices, edge midpoints,
 * with near-duplicates dropped. So the tests are about which points get chosen, not
 * about the statistics of a scatter.
 *
 * CLAUDE.md's determinism requirement (D17) is now satisfied by construction rather than
 * by care, but it is still asserted — it is the property the whole list depends on.
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

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 1e-9) =>
  Math.hypot(a.x - b.x, a.y - b.y) < tol

describe('which points are sampled (D47)', () => {
  it('includes every vertex of a triangle', () => {
    const samples = sampleMask(bigTriad)
    for (const v of bigTriad) {
      expect(samples.some((s) => near(s, v))).toBe(true)
    }
  })

  it('includes the midpoint of every edge', () => {
    const samples = sampleMask(bigTriad)
    for (let i = 0; i < bigTriad.length; i++) {
      const a = bigTriad[i]
      const b = bigTriad[(i + 1) % bigTriad.length]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      expect(samples.some((s) => near(s, mid))).toBe(true)
    }
  })

  it('includes the centre', () => {
    const samples = sampleMask(bigTriad)
    expect(samples.some((s) => near(s, centroid(bigTriad), 1e-6))).toBe(true)
  })

  it('gives a triangle exactly 1 + 3 + 3 colours', () => {
    expect(sampleMask(bigTriad)).toHaveLength(7)
  })

  it('the centre of a centred mask is neutral', () => {
    const samples = sampleMask(bigTriad)
    const middle = samples.find((s) => s.t < 1e-6)
    expect(middle).toBeDefined()
    const [r, g, b] = middle!.rgb8
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('adding a vertex adds colours — the count follows the shape', () => {
    const quad: Polygon = [...bigTriad, polar(300, 0.5)]
    expect(sampleMask(quad).length).toBeGreaterThan(sampleMask(bigTriad).length)
  })

  it('uses the area centroid, not the vertex mean, for the centre', () => {
    // A polygon with vertices crowded along one edge separates the two.
    const crowded: Polygon = [
      polar(0, 0.8), polar(10, 0.8), polar(20, 0.8), polar(30, 0.8), polar(200, 0.8),
    ]
    const samples = sampleMask(crowded)
    const mean = {
      x: crowded.reduce((s, p) => s + p.x, 0) / crowded.length,
      y: crowded.reduce((s, p) => s + p.y, 0) / crowded.length,
    }
    expect(samples.some((s) => near(s, centroid(crowded), 1e-6))).toBe(true)
    expect(samples.some((s) => near(s, mean, 1e-6))).toBe(false)
  })
})

describe('separation', () => {
  /**
   * The arc-based presets carry vertices to make a curve look smooth, not to mark
   * anything. Raw, the analogous wedge produces 31 candidates that are nearly all
   * duplicates of their neighbours.
   */
  it('drops candidates that would resolve to the same colour', () => {
    const analogous = buildPreset('analogous', 0)
    const raw = 1 + analogous.length * 2
    const samples = sampleMask(analogous)
    expect(raw).toBeGreaterThan(25)
    expect(samples.length).toBeLessThan(raw / 2)
    expect(samples.length).toBeGreaterThan(3)
  })

  it('leaves no two listed colours closer than the separation', () => {
    for (const id of ['triad', 'split', 'analogous', 'atmospheric'] as const) {
      const samples = sampleMask(buildPreset(id, 0))
      for (let i = 0; i < samples.length; i++) {
        for (let j = i + 1; j < samples.length; j++) {
          expect(oklabDistance(samples[i].oklab, samples[j].oklab)).toBeGreaterThanOrEqual(0.05)
        }
      }
    }
  })

  it('keeps the corners in preference to the edge midpoints between them', () => {
    // Candidates are ordered centre, vertices, midpoints, and earlier ones win, so a
    // vertex is never dropped in favour of the midpoint beside it.
    const samples = sampleMask(buildPreset('analogous', 0))
    const verts = buildPreset('analogous', 0)
    const outerKept = verts
      .filter((v) => radiusOf(v.x, v.y) > 0.9)
      .filter((v) => samples.some((s) => near(s, v)))
    expect(outerKept.length).toBeGreaterThan(0)
  })

  /**
   * D25, finally real. The grid sampler adapted its pitch without limit, so a tiny mask
   * still returned the full count of near-identical greys. Now the candidates collapse
   * into each other and genuinely fewer colours come back.
   */
  it('returns fewer colours as the mask shrinks', () => {
    const counts = [0.9, 0.4, 0.1, 0.02].map(
      (r) => sampleMask([polar(0, r), polar(120, r), polar(240, r)]).length,
    )
    expect(counts[0]).toBe(7)
    expect(counts[3]).toBeLessThan(counts[0])
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
      expect(counts[i]).toBeGreaterThan(0)
    }
  })
})

describe('determinism (D17)', () => {
  it('is bit-identical when called twice', () => {
    expect(sampleMask(bigTriad)).toEqual(sampleMask(bigTriad))
  })

  it('does not depend on object identity', () => {
    expect(sampleMask(bigTriad.map((p) => ({ x: p.x, y: p.y })))).toEqual(sampleMask(bigTriad))
  })

  it('does not leak state between calls', () => {
    const first = sampleMask(bigTriad)
    sampleMask(lShape)
    sampleMask(buildPreset('atmospheric', 90))
    expect(sampleMask(bigTriad)).toEqual(first)
  })

  it('reproduces the list after a full 360 degree rotation', () => {
    const spun: Polygon = bigTriad.map((p) =>
      polar(angleOf(p.x, p.y) + 360, radiusOf(p.x, p.y)),
    )
    const a = sampleMask(bigTriad)
    const b = sampleMask(spun)
    expect(b).toHaveLength(a.length)
    b.forEach((s, i) => {
      expect(s.x).toBeCloseTo(a[i].x, 9)
      expect(s.y).toBeCloseTo(a[i].y, 9)
    })
  })
})

describe('degenerate input', () => {
  it('returns nothing for rings of fewer than three vertices', () => {
    expect(sampleMask([])).toEqual([])
    expect(sampleMask([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }])).toEqual([])
  })

  it('returns at least the centre for a zero-area ring rather than throwing', () => {
    const line: Polygon = [{ x: -0.5, y: 0 }, { x: 0, y: 0 }, { x: 0.5, y: 0 }]
    expect(Math.abs(signedArea(line))).toBeLessThan(1e-12)
    const samples = sampleMask(line)
    expect(samples.length).toBeGreaterThan(0)
    for (const s of samples) expect(Number.isFinite(s.x)).toBe(true)
  })

  it('handles a bowtie, whose algebraic area is zero', () => {
    const bowtie: Polygon = [
      { x: -0.8, y: -0.6 }, { x: 0.8, y: -0.6 },
      { x: -0.8, y: 0.6 }, { x: 0.8, y: 0.6 },
    ]
    expect(Math.abs(signedArea(bowtie))).toBeLessThan(1e-12)
    expect(sampleMask(bowtie).length).toBeGreaterThan(2)
  })
})

describe('ordering and payload', () => {
  it('is sorted by angle ascending (D17)', () => {
    for (const poly of [bigTriad, lShape, buildPreset('atmospheric', 30)]) {
      const samples = sampleMask(poly)
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i].theta).toBeGreaterThanOrEqual(samples[i - 1].theta)
      }
    }
  })

  it('stays inside the disk', () => {
    const wide: Polygon = [polar(0, 1), polar(120, 1), polar(240, 1)]
    for (const s of sampleMask(wide)) {
      expect(radiusOf(s.x, s.y)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('reports theta and t consistent with its own coordinates', () => {
    for (const s of sampleMask(lShape)) {
      // A neutral has no hue, so its theta is fixed at 0 rather than read off noise.
      if (s.t > 0) expect(s.theta).toBeCloseTo(angleOf(s.x, s.y), 9)
      expect(s.t).toBeCloseTo(Math.min(1, radiusOf(s.x, s.y)), 12)
    }
  })

  it('gives the neutral centre one fixed, reproducible entry', () => {
    const samples = sampleMask(bigTriad)
    const middle = samples.filter((s) => s.t === 0)
    expect(middle).toHaveLength(1)
    expect(middle[0].x).toBe(0)
    expect(middle[0].y).toBe(0)
    expect(middle[0].theta).toBe(0)
  })

  it('carries the colour the wheel model gives for that position', () => {
    for (const s of sampleMask(bigTriad)) {
      expect(s.rgb8).toEqual(sampleSrgb8(s.theta, s.t))
      expect(s.oklab.L).toBeCloseTo(wheelSample(s.theta, s.t).L, 12)
    }
  })
})
