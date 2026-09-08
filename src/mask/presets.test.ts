import { describe, expect, it } from 'vitest'
import { angleOf, radiusOf } from '../color/wheel.ts'
import { containsPoint, signedArea } from '../geom/polygon.ts'
import { PRESETS, buildPreset, type BuildablePresetId } from './presets.ts'

/**
 * Geometry only. These are the shapes every other module is fed, so the invariants worth
 * pinning are: inside the disk (D22), consistent winding, enclosing real area, and
 * responding to the base angle.
 */

const ALL: BuildablePresetId[] = ['triad', 'split', 'analogous', 'atmospheric']

describe('every preset', () => {
  it('is listed as available', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(ALL)
    expect(PRESETS.every((p) => p.available)).toBe(true)
  })

  it('has at least 3 vertices, all inside the disk (D22)', () => {
    for (const id of ALL) {
      const poly = buildPreset(id, 0)
      expect(poly.length).toBeGreaterThanOrEqual(3)
      for (const v of poly) expect(radiusOf(v.x, v.y)).toBeLessThanOrEqual(1 + 1e-12)
    }
  })

  it('encloses real area with consistent winding', () => {
    for (const id of ALL) {
      expect(signedArea(buildPreset(id, 0))).toBeGreaterThan(0.01)
    }
  })

  it('is deterministic', () => {
    for (const id of ALL) {
      expect(buildPreset(id, 41)).toEqual(buildPreset(id, 41))
    }
  })

  it('rotates rigidly with the base angle — radii are unchanged', () => {
    for (const id of ALL) {
      const at0 = buildPreset(id, 0).map((v) => radiusOf(v.x, v.y)).sort()
      const at97 = buildPreset(id, 97).map((v) => radiusOf(v.x, v.y)).sort()
      at97.forEach((r, i) => expect(r).toBeCloseTo(at0[i], 9))
    }
  })

  it('spaces adjacent vertices far enough apart to grab individually', () => {
    // Regression: the analogous inner arc used to collapse into an overlapping cluster
    // because arc length scales with radius but the step was a fixed angle.
    for (const id of ALL) {
      const poly = buildPreset(id, 0)
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]
        const b = poly[(i + 1) % poly.length]
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.06)
      }
    }
  })
})

describe('triad', () => {
  it('is three vertices 120 degrees apart at one radius', () => {
    const poly = buildPreset('triad', 0)
    expect(poly).toHaveLength(3)
    const radii = poly.map((v) => radiusOf(v.x, v.y))
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-9)
    const angles = poly.map((v) => angleOf(v.x, v.y)).sort((a, b) => a - b)
    expect(angles[1] - angles[0]).toBeCloseTo(120, 6)
    expect(angles[2] - angles[1]).toBeCloseTo(120, 6)
  })
})

describe('split complementary', () => {
  it('places two arms either side of the base hue complement', () => {
    const poly = buildPreset('split', 0)
    expect(poly).toHaveLength(3)
    const angles = poly.map((v) => angleOf(v.x, v.y))
    expect(angles).toContainEqual(expect.closeTo(0, 6))
    // The complement of 0 is 180; the arms sit symmetrically about it.
    const arms = angles.filter((a) => a > 90 && a < 270).sort((a, b) => a - b)
    expect(arms).toHaveLength(2)
    expect(180 - arms[0]).toBeCloseTo(arms[1] - 180, 6)
  })
})

describe('analogous', () => {
  it('is a wedge spanning a narrow hue band between two radii', () => {
    const poly = buildPreset('analogous', 90)
    const radii = [...new Set(poly.map((v) => +radiusOf(v.x, v.y).toFixed(6)))]
    expect(radii).toHaveLength(2)
    const angles = poly.map((v) => angleOf(v.x, v.y))
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(60)
  })
})

describe('atmospheric (D38)', () => {
  it('contains the neutral centre, so it yields near-neutrals of every hue', () => {
    expect(containsPoint(buildPreset('atmospheric', 0), { x: 0, y: 0 })).toBe(true)
  })

  it('is OFF-CENTRE — the property no other preset or slider can produce', () => {
    // Rotation and scaling both pivot on the wheel centre (F5), so a mask whose own
    // centroid is away from the origin is unreachable by any other means. This is the
    // whole justification for the shape, so it is asserted rather than assumed.
    const poly = buildPreset('atmospheric', 0)
    const cx = poly.reduce((s, v) => s + v.x, 0) / poly.length
    const cy = poly.reduce((s, v) => s + v.y, 0) / poly.length
    expect(Math.hypot(cx, cy)).toBeGreaterThan(0.2)
  })

  it('leans toward the base hue: the far side reaches well past the near side', () => {
    for (const base of [0, 90, 200, 300]) {
      const poly = buildPreset('atmospheric', base)
      const outermost = poly.reduce((a, b) =>
        radiusOf(a.x, a.y) > radiusOf(b.x, b.y) ? a : b,
      )
      // Angular distance from the base hue, wrapped to [0,180]. The furthest point sits
      // along the base hue, so this is small.
      const delta = Math.abs(((angleOf(outermost.x, outermost.y) - base + 540) % 360) - 180)
      expect(delta).toBeLessThan(30)
    }
  })

  it('stays muted — nothing reaches the saturated rim', () => {
    const radii = buildPreset('atmospheric', 0).map((v) => radiusOf(v.x, v.y))
    expect(Math.max(...radii)).toBeLessThan(0.7)
  })
})
