import { describe, expect, it } from 'vitest'
import { sample as wheelSample } from '../color/wheel.ts'
import { PAINTS } from './catalogue.ts'
import {
  MATCH_TOLERANCE_PERCENT,
  closestOverall,
  differencePercent,
  hexToOklab,
  isWithinTolerance,
  matchingPaints,
  nearestPaintOfBrand,
  nearestPerBrand,
  oklabDistance,
} from './match.ts'
import { BRANDS } from './types.ts'

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
    const match = nearestPaintOfBrand(hexToOklab('#3e4c28'), 'AK')
    expect(refs.has(match.paint.ref)).toBe(true)
  })

  it('matches every catalogue colour to itself at distance ~0', () => {
    for (const p of PAINTS) {
      const match = nearestPaintOfBrand(hexToOklab(p.hex), p.brand)
      // Ties are possible — 18 paints share a swatch colour with another — so assert the
      // distance rather than the identity.
      expect(match.distance).toBeLessThan(1e-9)
    }
  })

  it('is deterministic', () => {
    const target = hexToOklab('#7d5b33')
    expect(nearestPerBrand(target)).toEqual(nearestPerBrand(target))
  })

  it('never returns a distance larger than the true minimum', () => {
    // Brute force against the same data by an independent path.
    const target = wheelSample(210, 0.45)
    for (const brand of BRANDS) {
      const brute = Math.min(
        ...PAINTS.filter((p) => p.brand === brand).map((p) =>
          oklabDistance(target, hexToOklab(p.hex)),
        ),
      )
      expect(nearestPaintOfBrand(target, brand).distance).toBeCloseTo(brute, 12)
    }
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
        for (const match of nearestPerBrand(wheelSample(theta, i / 20))) {
          const shown = differencePercent(match.distance)
          expect(isWithinTolerance(match)).toBe(shown <= MATCH_TOLERANCE_PERCENT)
        }
      }
    }
  })

  it('matches every near-neutral colour — muted palettes are well covered', () => {
    for (let theta = 0; theta < 360; theta += 15) {
      for (const t of [0, 0.05, 0.1, 0.15]) {
        expect(matchingPaints(wheelSample(theta, t)).length).toBeGreaterThan(0)
      }
    }
  })

  it('rejects most of the saturated rim — real pigment cannot reach sRGB primaries', () => {
    let matched = 0
    let total = 0
    for (let theta = 0; theta < 360; theta += 5) {
      total++
      if (matchingPaints(wheelSample(theta, 1)).length > 0) matched++
    }
    expect(matched / total).toBeLessThan(0.5)
  })

  it('discriminates: it neither accepts nor rejects the whole disk', () => {
    let matched = 0
    let total = 0
    for (let theta = 0; theta < 360; theta += 10) {
      for (let i = 0; i <= 20; i++) {
        total++
        if (matchingPaints(wheelSample(theta, i / 20)).length > 0) matched++
      }
    }
    const fraction = matched / total
    expect(fraction).toBeGreaterThan(0.3)
    expect(fraction).toBeLessThan(0.9)
  })
})

describe('two brands (D44)', () => {
  it('carries both catalogues, each a plausible size', () => {
    for (const brand of BRANDS) {
      expect(PAINTS.filter((p) => p.brand === brand).length).toBeGreaterThan(500)
    }
    expect(new Set(PAINTS.map((p) => p.brand))).toEqual(new Set(BRANDS))
  })

  it('gives every paint a ref in its brand’s own format', () => {
    for (const p of PAINTS) {
      if (p.brand === 'AK') expect(p.ref).toMatch(/^(AK|RC)\d{3,6}$/)
      else expect(p.ref).toMatch(/^\d{2}\.\d{3}$/)
    }
  })

  it('excludes Vallejo varnishes and mediums, whose swatches are blank white', () => {
    const refs = new Set(PAINTS.map((p) => p.ref))
    for (const ref of ['70.510', '70.520', '70.522', '70.596', '72.650', '69.701']) {
      expect(refs.has(ref)).toBe(false)
    }
    // ...while 70.951 White is a real paint that is also white, so it stays.
    expect(refs.has('70.951')).toBe(true)
  })

  it('returns exactly one nearest per brand, in BRANDS order', () => {
    const found = nearestPerBrand(wheelSample(120, 0.4))
    expect(found).toHaveLength(BRANDS.length)
    expect(found.map((m) => m.paint.brand)).toEqual([...BRANDS])
  })

  it('matches each brand against its own paints only', () => {
    for (const brand of BRANDS) {
      expect(nearestPaintOfBrand(wheelSample(300, 0.3), brand).paint.brand).toBe(brand)
    }
  })

  it('matchingPaints is the tolerance-filtered subset of nearestPerBrand', () => {
    for (let theta = 0; theta < 360; theta += 17) {
      for (const t of [0.1, 0.4, 0.7, 1]) {
        const target = wheelSample(theta, t)
        const all = nearestPerBrand(target)
        const kept = matchingPaints(target)
        expect(kept).toEqual(all.filter(isWithinTolerance))
        expect(kept.length).toBeLessThanOrEqual(BRANDS.length)
      }
    }
  })

  /**
   * The behaviour the feature was asked for: both brands when both are close, one when
   * only one is, none when neither. All three cases must actually occur, or the feature
   * is not doing anything.
   */
  it('produces all three outcomes across the disk', () => {
    const counts = { none: 0, one: 0, both: 0 }
    for (let theta = 0; theta < 360; theta += 3) {
      for (let i = 0; i <= 20; i++) {
        const n = matchingPaints(wheelSample(theta, i / 20)).length
        if (n === 0) counts.none++
        else if (n === 1) counts.one++
        else counts.both++
      }
    }
    expect(counts.none).toBeGreaterThan(0)
    expect(counts.one).toBeGreaterThan(0)
    expect(counts.both).toBeGreaterThan(0)
  })

  it('closestOverall is the minimum across brands', () => {
    for (let theta = 0; theta < 360; theta += 23) {
      const target = wheelSample(theta, 0.55)
      const best = closestOverall(target)
      const min = Math.min(...nearestPerBrand(target).map((m) => m.distance))
      expect(best.distance).toBeCloseTo(min, 12)
    }
  })

  it('two brands cover more of the disk than either alone', () => {
    let akOnly = 0
    let either = 0
    for (let theta = 0; theta < 360; theta += 5) {
      for (let i = 0; i <= 20; i++) {
        const target = wheelSample(theta, i / 20)
        const found = nearestPerBrand(target).filter(isWithinTolerance)
        if (found.length > 0) either++
        if (found.some((m) => m.paint.brand === 'AK')) akOnly++
      }
    }
    expect(either).toBeGreaterThan(akOnly)
  })
})

describe('differencePercent', () => {
  it('scales an Oklab distance to whole percent', () => {
    expect(differencePercent(0)).toBe(0)
    expect(differencePercent(0.05)).toBe(5)
    expect(differencePercent(0.123)).toBe(12)
  })
})
