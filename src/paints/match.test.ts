import { describe, expect, it } from 'vitest'
import { sample as wheelSample } from '../color/wheel.ts'
import { PAINTS } from './catalogue.ts'
import {
  MATCH_TOLERANCE_PERCENT,
  differencePercent,
  hexToOklab,
  isWithinTolerance,
  nearestPaint,
  oklabDistance,
} from './match.ts'

/**
 * Colour maths, so in scope per CLAUDE.md. Two things are worth testing here: that the
 * distance metric behaves like a metric, and that the tolerance is actually calibrated
 * against the real catalogue rather than picked out of the air.
 */

describe('catalogue integrity', () => {
  it('is a plausible size and has no duplicate refs', () => {
    expect(PAINTS.length).toBeGreaterThan(600)
    expect(new Set(PAINTS.map((p) => p.ref)).size).toBe(PAINTS.length)
  })

  it('has a well-formed hex and a non-empty name for every entry', () => {
    for (const p of PAINTS) {
      expect(p.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.range.length).toBeGreaterThan(0)
    }
  })

  it('excludes the auxiliary media and varnishes, which carry placeholder swatches', () => {
    // The five AK mediums all share #636363; leaving them in would let any neutral
    // sample "match" Matte Medium.
    const refs = new Set(PAINTS.map((p) => p.ref))
    for (const ref of ['AK11231', 'AK11232', 'AK11233', 'AK11234', 'AK11235',
                       'RC801', 'RC802', 'RC803']) {
      expect(refs.has(ref)).toBe(false)
    }
  })

  it('covers more than one product range', () => {
    expect(new Set(PAINTS.map((p) => p.range)).size).toBeGreaterThan(1)
  })
})

describe('oklabDistance', () => {
  const a = hexToOklab('#ce5d4f')
  const b = hexToOklab('#3e4c28')

  it('is zero for identical colours', () => {
    expect(oklabDistance(a, a)).toBe(0)
  })

  it('is symmetric', () => {
    expect(oklabDistance(a, b)).toBeCloseTo(oklabDistance(b, a), 15)
  })

  it('is positive for different colours', () => {
    expect(oklabDistance(a, b)).toBeGreaterThan(0)
  })

  it('obeys the triangle inequality', () => {
    const c = hexToOklab('#ffffff')
    expect(oklabDistance(a, c)).toBeLessThanOrEqual(
      oklabDistance(a, b) + oklabDistance(b, c) + 1e-12,
    )
  })

  it('ranks an obviously closer colour as closer', () => {
    const target = hexToOklab('#ce5d4f')
    const near = hexToOklab('#d0604f')
    const far = hexToOklab('#204080')
    expect(oklabDistance(target, near)).toBeLessThan(oklabDistance(target, far))
  })
})

describe('nearestPaint', () => {
  it('returns a member of the catalogue', () => {
    const refs = new Set(PAINTS.map((p) => p.ref))
    const match = nearestPaint(hexToOklab('#3e4c28'))
    expect(refs.has(match.paint.ref)).toBe(true)
  })

  it('matches every catalogue colour to itself at distance ~0', () => {
    for (const p of PAINTS) {
      const match = nearestPaint(hexToOklab(p.hex))
      // Ties are possible — 18 paints share a swatch colour with another — so assert the
      // distance rather than the identity.
      expect(match.distance).toBeLessThan(1e-9)
    }
  })

  it('is deterministic', () => {
    const target = hexToOklab('#7d5b33')
    expect(nearestPaint(target)).toEqual(nearestPaint(target))
  })

  it('never returns a distance larger than the true minimum', () => {
    // Brute force against the same data by an independent path.
    const target = wheelSample(210, 0.45)
    const brute = Math.min(
      ...PAINTS.map((p) => oklabDistance(target, hexToOklab(p.hex))),
    )
    expect(nearestPaint(target).distance).toBeCloseTo(brute, 12)
  })
})

describe('tolerance calibration', () => {
  /**
   * The tolerance is the "±5%" the feature was specified with, expressed as an Oklab
   * distance of 0.05. These tests pin the measured behaviour that made it a sensible
   * number rather than an arbitrary one — if the catalogue or the wheel model changes
   * enough to break them, the threshold deserves rechecking.
   */
  it('is 5% on the displayed scale', () => {
    expect(MATCH_TOLERANCE_PERCENT).toBe(5)
  })

  /**
   * The decision and the displayed number must agree. Comparing the raw distance against
   * 0.05 produced rows reading "No paint found" beside "Δ5%", since 0.0504 rounds to 5
   * but exceeds 0.05.
   */
  it('never disagrees with the percentage it displays', () => {
    for (let theta = 0; theta < 360; theta += 3) {
      for (let i = 0; i <= 20; i++) {
        const match = nearestPaint(wheelSample(theta, i / 20))
        const shown = differencePercent(match.distance)
        expect(isWithinTolerance(match)).toBe(shown <= MATCH_TOLERANCE_PERCENT)
      }
    }
  })

  it('matches every near-neutral colour — muted palettes are well covered', () => {
    for (let theta = 0; theta < 360; theta += 15) {
      for (const t of [0, 0.05, 0.1, 0.15]) {
        expect(isWithinTolerance(nearestPaint(wheelSample(theta, t)))).toBe(true)
      }
    }
  })

  it('rejects most of the saturated rim — real pigment cannot reach sRGB primaries', () => {
    let matched = 0
    let total = 0
    for (let theta = 0; theta < 360; theta += 5) {
      total++
      if (isWithinTolerance(nearestPaint(wheelSample(theta, 1)))) matched++
    }
    expect(matched / total).toBeLessThan(0.5)
  })

  it('discriminates: it neither accepts nor rejects the whole disk', () => {
    let matched = 0
    let total = 0
    for (let theta = 0; theta < 360; theta += 10) {
      for (let i = 0; i <= 20; i++) {
        total++
        if (isWithinTolerance(nearestPaint(wheelSample(theta, i / 20)))) matched++
      }
    }
    const fraction = matched / total
    expect(fraction).toBeGreaterThan(0.3)
    expect(fraction).toBeLessThan(0.9)
  })
})

describe('differencePercent', () => {
  it('scales an Oklab distance to whole percent', () => {
    expect(differencePercent(0)).toBe(0)
    expect(differencePercent(0.05)).toBe(5)
    expect(differencePercent(0.123)).toBe(12)
  })
})
