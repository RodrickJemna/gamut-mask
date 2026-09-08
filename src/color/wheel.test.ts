import { describe, expect, it } from 'vitest'
import { oklabToSrgb8, type Oklab } from './oklab.ts'
import {
  ANCHORS,
  CENTRE_OKLAB,
  angleOf,
  dir,
  normalizeAngle,
  polar,
  radiusOf,
  rimOklab,
  rimSrgb,
  sample,
  sampleSrgb8,
} from './wheel.ts'

const chroma = (c: Oklab): number => Math.hypot(c.a, c.b)
const sweep = (n: number): number[] => Array.from({ length: n }, (_, i) => (i * 360) / n)

describe('coordinate convention (implementation-plan section 2)', () => {
  it('dir(0) points up', () => {
    const d = dir(0)
    expect(d.x).toBeCloseTo(0, 12)
    expect(d.y).toBeCloseTo(-1, 12)
  })

  it('is clockwise on screen: 90 right, 180 down, 270 left', () => {
    expect(dir(90).x).toBeCloseTo(1, 12)
    expect(dir(90).y).toBeCloseTo(0, 12)
    expect(dir(180).y).toBeCloseTo(1, 12)
    expect(dir(270).x).toBeCloseTo(-1, 12)
  })

  it('angleOf inverts dir', () => {
    for (let t = 0; t < 360; t++) {
      const d = dir(t)
      expect(angleOf(d.x, d.y)).toBeCloseTo(t, 9)
    }
  })

  it('normalizeAngle wraps negatives and values over 360 into [0,360)', () => {
    expect(normalizeAngle(-90)).toBeCloseTo(270, 12)
    expect(normalizeAngle(450)).toBeCloseTo(90, 12)
    expect(normalizeAngle(360)).toBe(0)
    expect(normalizeAngle(-0.0001)).toBeLessThan(360)
  })

  it('polar / angleOf / radiusOf round trip', () => {
    for (const theta of sweep(72)) {
      for (const t of [0.1, 0.5, 0.9, 1]) {
        const p = polar(theta, t)
        expect(radiusOf(p.x, p.y)).toBeCloseTo(t, 12)
        expect(angleOf(p.x, p.y)).toBeCloseTo(theta, 9)
      }
    }
  })

  it('the disk centre has radius 0', () => {
    expect(radiusOf(0, 0)).toBe(0)
  })
})

describe('anchors (D21, D34)', () => {
  it('has six anchors exactly 60 degrees apart', () => {
    expect(ANCHORS).toHaveLength(6)
    ANCHORS.forEach((a, i) => expect(a.angle).toBe(i * 60))
  })

  it('is ordered R Y G C B M clockwise from the top', () => {
    expect(ANCHORS.map((a) => a.letter)).toEqual(['R', 'Y', 'G', 'C', 'B', 'M'])
  })

  it('places complements opposite: R-C, Y-B, G-M', () => {
    const at = (l: string) => ANCHORS.find((a) => a.letter === l)!.angle
    expect(normalizeAngle(at('R') + 180)).toBe(at('C'))
    expect(normalizeAngle(at('Y') + 180)).toBe(at('B'))
    expect(normalizeAngle(at('G') + 180)).toBe(at('M'))
  })
})

describe('rim (D35)', () => {
  it('gives the exact sRGB primaries and secondaries at the anchors', () => {
    expect(oklabToSrgb8(rimOklab(0))).toEqual([255, 0, 0])
    expect(oklabToSrgb8(rimOklab(60))).toEqual([255, 255, 0])
    expect(oklabToSrgb8(rimOklab(120))).toEqual([0, 255, 0])
    expect(oklabToSrgb8(rimOklab(180))).toEqual([0, 255, 255])
    expect(oklabToSrgb8(rimOklab(240))).toEqual([0, 0, 255])
    expect(oklabToSrgb8(rimOklab(300))).toEqual([255, 0, 255])
  })

  it('always has one channel at 1 and one at 0 (it is the hue hexagon)', () => {
    for (const theta of sweep(360)) {
      const { r, g, b } = rimSrgb(theta)
      expect(Math.max(r, g, b)).toBeCloseTo(1, 12)
      expect(Math.min(r, g, b)).toBeCloseTo(0, 12)
    }
  })

  it('is continuous in theta', () => {
    for (const theta of sweep(720)) {
      const a = rimSrgb(theta)
      const b = rimSrgb(theta + 0.5)
      expect(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b))
        .toBeLessThan(0.02)
    }
  })

  it('is continuous across the 360/0 seam', () => {
    const a = rimSrgb(359.999)
    const b = rimSrgb(0)
    expect(a.r).toBeCloseTo(b.r, 4)
    expect(a.g).toBeCloseTo(b.g, 4)
    expect(a.b).toBeCloseTo(b.b, 4)
  })

  it('wraps: theta and theta + 360 are the same rim', () => {
    for (const theta of sweep(36)) {
      expect(rimSrgb(theta + 360)).toEqual(rimSrgb(theta))
      expect(rimSrgb(theta - 360)).toEqual(rimSrgb(theta))
    }
  })
})

describe('sample — the model (D35)', () => {
  it('t = 0 is exactly the neutral centre for every hue', () => {
    for (const theta of sweep(72)) {
      expect(sample(theta, 0)).toEqual(CENTRE_OKLAB)
    }
  })

  it('t = 1 is exactly the rim', () => {
    for (const theta of sweep(72)) {
      expect(sample(theta, 1)).toEqual(rimOklab(theta))
    }
  })

  it('t = 1 round-trips to the exact rim byte triple', () => {
    for (const theta of sweep(180)) {
      expect(sampleSrgb8(theta, 1)).toEqual(oklabToSrgb8(rimOklab(theta)))
    }
  })

  it('stays on its Oklab hue line, up to chroma reduction', () => {
    for (const theta of sweep(72)) {
      const rim = rimOklab(theta)
      const rimHue = Math.atan2(rim.b, rim.a)
      for (let i = 1; i <= 20; i++) {
        const s = sample(theta, i / 20)
        expect(Math.atan2(s.b, s.a)).toBeCloseTo(rimHue, 9)
      }
    }
  })

  it('is continuous across the 360/0 seam at every radius', () => {
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const a = sample(359.999, t)
      const b = sample(0, t)
      expect(a.L).toBeCloseTo(b.L, 4)
      expect(a.a).toBeCloseTo(b.a, 4)
      expect(a.b).toBeCloseTo(b.b, 4)
    }
  })

  it('never produces NaN or out-of-range bytes over a dense sweep', () => {
    for (const theta of sweep(360)) {
      for (let i = 0; i <= 50; i++) {
        const out = sampleSrgb8(theta, i / 50)
        for (const v of out) {
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(255)
        }
      }
    }
  })

  /**
   * D35 claims that within one hue, "further out is more saturated" still holds. It very
   * nearly does, but not exactly: D3's chroma reduction breaks it slightly. The raw
   * interpolation is monotone in chroma by construction, but the reduction clamps it to
   * the gamut boundary, and that boundary's chroma at constant L shrinks as L falls
   * toward a dark rim. Around blue the line leaves the gamut, so chroma dips.
   *
   * Measured: about 10 of 720 sampled hues dip at all, all near theta 240, worst case
   * 2.3e-4 (0.08% relative) at t = 0.93 — roughly a fifth of one 8-bit step, so not
   * visible. Asserted as a bounded guard rather than dropped, so a change that made the
   * violation meaningful would fail here.
   */
  it('chroma is non-decreasing outwards within one hue, up to the D3 reduction', () => {
    let worstDip = 0
    for (const theta of sweep(360)) {
      let prev = -1
      for (let i = 0; i <= 100; i++) {
        const c = chroma(sample(theta, i / 100))
        if (prev >= 0 && c < prev) worstDip = Math.max(worstDip, prev - c)
        prev = c
      }
    }
    expect(worstDip).toBeLessThan(1e-3)
  })
})
