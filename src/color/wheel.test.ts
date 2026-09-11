import { describe, expect, it } from 'vitest'
import { oklabDistance, oklabToSrgb8, type Oklab } from './oklab.ts'
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
  snapToAnchorAngle,
  WHEELS,
  DEFAULT_WHEEL,
  wheelById,
  wedgeIndexOf,
  wedgeOffsetOf,
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

describe('wedges', () => {
  it('assigns each anchor to its own wedge', () => {
    ANCHORS.forEach((anchor, i) => {
      expect(wedgeIndexOf(anchor.angle)).toBe(i)
    })
  })

  it('centres each wedge on its anchor', () => {
    ANCHORS.forEach((anchor, i) => {
      expect(wedgeIndexOf(anchor.angle - 29.9)).toBe(i)
      expect(wedgeIndexOf(anchor.angle + 29.9)).toBe(i)
    })
  })

  it('puts the boundary in the next wedge, so wedges do not overlap', () => {
    expect(wedgeIndexOf(30)).toBe(1)
    expect(wedgeIndexOf(29.999)).toBe(0)
  })

  it('keeps Red whole across the 0/360 seam', () => {
    // The default analogous wedge spans roughly 334..26, which is the case that used to
    // split across both ends of the sample list.
    for (const theta of [330, 345, 359, 0, 15, 29]) {
      expect(wedgeIndexOf(theta)).toBe(0)
    }
  })

  it('covers the whole circle with exactly six wedges', () => {
    const seen = new Set<number>()
    for (let theta = 0; theta < 360; theta += 0.25) seen.add(wedgeIndexOf(theta))
    expect(seen.size).toBe(6)
  })

  it('orders within a wedge in wheel order, seam included', () => {
    // 339 comes before 0 comes before 21 on the wheel; raw angle would reverse that.
    const offsets = [339, 0, 21].map(wedgeOffsetOf)
    expect(offsets[0]).toBeLessThan(offsets[1])
    expect(offsets[1]).toBeLessThan(offsets[2])
  })

  it('offset stays within 0..60 for every angle', () => {
    for (let theta = -720; theta < 720; theta += 3.3) {
      const o = wedgeOffsetOf(theta)
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThan(60)
    }
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

describe('snapToAnchorAngle', () => {
  it('lands exactly on an anchor for every anchor', () => {
    for (const anchor of ANCHORS) {
      expect(snapToAnchorAngle(anchor.angle)).toBe(anchor.angle)
    }
  })

  it('rounds to the nearest anchor from either side', () => {
    expect(snapToAnchorAngle(14)).toBe(0)
    expect(snapToAnchorAngle(46)).toBe(60)
    expect(snapToAnchorAngle(119)).toBe(120)
    expect(snapToAnchorAngle(271)).toBe(300)
  })

  it('always returns an anchor angle, for any input', () => {
    const anchorAngles = ANCHORS.map((a) => a.angle)
    for (let deg = -720; deg <= 1080; deg += 3) {
      expect(anchorAngles).toContain(snapToAnchorAngle(deg))
    }
  })

  it('wraps rather than returning 360', () => {
    // 340 is nearer to 360 than to 300, and 360 is not an angle the state may hold.
    expect(snapToAnchorAngle(340)).toBe(0)
    expect(snapToAnchorAngle(359)).toBe(0)
  })

  it('is idempotent', () => {
    for (let deg = 0; deg < 360; deg += 7) {
      expect(snapToAnchorAngle(snapToAnchorAngle(deg))).toBe(snapToAnchorAngle(deg))
    }
  })
})

/**
 * Wheel variants (D53). The property that matters is that a variant is still a WHEEL:
 * one colour per (angle, radius), in gamut, neutral at the centre, and continuous. If any
 * of those breaks, the mask, the sampler and the paint matcher all inherit the damage.
 */
describe('wheel variants', () => {
  it('starts on the saturated wheel, which stays the default', () => {
    expect(WHEELS[0].id).toBe('saturated')
    expect(DEFAULT_WHEEL).toBe('saturated')
    // The default parameter of `sample` must agree with the id the state starts on.
    for (let theta = 0; theta < 360; theta += 17) {
      for (const t of [0, 0.4, 1]) {
        expect(sample(theta, t)).toEqual(sample(theta, t, wheelById(DEFAULT_WHEEL)))
      }
    }
  })

  it('has unique ids and a label and hint for each', () => {
    expect(new Set(WHEELS.map((w) => w.id)).size).toBe(WHEELS.length)
    for (const wheel of WHEELS) {
      expect(wheel.label.length).toBeGreaterThan(0)
      expect(wheel.hint.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the default for an unknown id rather than throwing', () => {
    // A saved file from a later version could name a wheel this build does not have.
    expect(wheelById('nonsense' as never)).toBe(WHEELS[0])
  })

  it('is neutral at the centre on every wheel', () => {
    // t = 0 is the centre for all angles; a wheel whose centre had chroma would make the
    // sampler's neutral snap (geom/sample.ts) a lie.
    for (const wheel of WHEELS) {
      for (let theta = 0; theta < 360; theta += 23) {
        const centre = sample(theta, 0, wheel)
        expect(centre.a).toBeCloseTo(0, 12)
        expect(centre.b).toBeCloseTo(0, 12)
        expect(centre.L).toBeCloseTo(wheel.centre.L, 12)
      }
    }
  })

  it('stays inside sRGB everywhere on every wheel', () => {
    for (const wheel of WHEELS) {
      for (let theta = 0; theta < 360; theta += 7) {
        for (let i = 0; i <= 20; i++) {
          const [r, g, b] = sampleSrgb8(theta, i / 20, wheel)
          for (const c of [r, g, b]) {
            expect(Number.isInteger(c)).toBe(true)
            expect(c).toBeGreaterThanOrEqual(0)
            expect(c).toBeLessThanOrEqual(255)
          }
        }
      }
    }
  })

  it('is continuous around the 0/360 seam on every wheel', () => {
    for (const wheel of WHEELS) {
      for (const t of [0.3, 0.7, 1]) {
        const before = sample(359.9, t, wheel)
        const after = sample(0.1, t, wheel)
        expect(oklabDistance(before, after)).toBeLessThan(0.01)
      }
    }
  })

  it('keeps every variant lower in chroma than the saturated one', () => {
    // This is the whole point of the group: the variants are subsets of the same hue
    // circle, reached by pulling the rim inward or toward white or black.
    const chroma = (c: { a: number; b: number }) => Math.hypot(c.a, c.b)
    for (const wheel of WHEELS.slice(1)) {
      for (let theta = 0; theta < 360; theta += 11) {
        expect(chroma(sample(theta, 1, wheel))).toBeLessThan(
          chroma(sample(theta, 1, WHEELS[0])) + 1e-9,
        )
      }
    }
  })

  it('separates the variants, so no two are the same wheel', () => {
    for (let i = 0; i < WHEELS.length; i++) {
      for (let j = i + 1; j < WHEELS.length; j++) {
        let worst = 0
        for (let theta = 0; theta < 360; theta += 13) {
          worst = Math.max(
            worst,
            oklabDistance(sample(theta, 1, WHEELS[i]), sample(theta, 1, WHEELS[j])),
          )
        }
        expect(worst).toBeGreaterThan(0.05)
      }
    }
  })

  it('orders the variants by lightness the way their names claim', () => {
    // Pastel above the saturated centre, shadow below it — a "shadow" wheel that came
    // out lighter than the default would be a naming bug, not a taste question.
    const pastel = wheelById('pastel')
    const shadow = wheelById('shadow')
    expect(pastel.centre.L).toBeGreaterThan(WHEELS[0].centre.L)
    expect(shadow.centre.L).toBeLessThan(WHEELS[0].centre.L)
    for (let theta = 0; theta < 360; theta += 29) {
      expect(sample(theta, 1, pastel).L).toBeGreaterThan(sample(theta, 1, shadow).L)
    }
  })
})
