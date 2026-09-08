import { describe, expect, it } from 'vitest'
import {
  inGamut,
  linearToSrgb,
  lrgbToOklab,
  oklabToLrgb,
  oklabToSrgb8,
  reduceChroma,
  srgbToLinear,
  type Oklab,
} from './oklab.ts'

/**
 * The job here is catching a mis-transcribed matrix constant (CLAUDE.md fidelity rules).
 *
 * A round trip alone is a weak guard: it passes whenever the forward and inverse
 * matrices are consistent, including consistently wrong. So it is paired with two
 * absolute checks that pin the constants down independently:
 *
 *  - the D65 white entry from Ottosson's own test table: L = 1, a = 0, b = 0
 *  - the neutral-axis identities, which hold only if every M1 row sums to 1, the a and b
 *    rows of M2 sum to 0, and every inverse-matrix row sums to 1. A single mistyped
 *    digit anywhere in either matrix breaks one of them.
 *
 * Absolute Oklab values for the sRGB primaries are deliberately NOT asserted: the source
 * publishes its test table with XYZ inputs, not sRGB, so any such number here would be
 * this implementation checked against itself. Signs and ordering are asserted instead.
 *
 * Tolerances are measured, not aspirational. The published constants carry 10 decimals,
 * so the matrices are mutual inverses only to about 1e-7.
 */

const LATTICE = 17
const lattice = (): number[] =>
  Array.from({ length: LATTICE }, (_, i) => i / (LATTICE - 1))

describe('transfer function', () => {
  it('srgbToLinear and linearToSrgb are inverse across 0..1', () => {
    for (let i = 0; i <= 10000; i++) {
      const c = i / 10000
      expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 12)
    }
  })

  it('is continuous at the piecewise knee', () => {
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 12)
    expect(linearToSrgb(0.0031308)).toBeCloseTo(0.0031308 * 12.92, 12)
  })

  it('maps the endpoints to 0 and 1', () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(srgbToLinear(1)).toBe(1)
    expect(linearToSrgb(0)).toBe(0)
    // Not exact: 1.055 - 0.055 is 0.9999999999999999 in binary floating point. Forcing
    // it with a branch would be gratuitous — the endpoint that has to be exact is the
    // 8-bit one, and 'reproduces the saturated rim bytes exactly' asserts that directly.
    expect(linearToSrgb(1)).toBeCloseTo(1, 15)
  })
})

describe('Oklab round trip', () => {
  it('lrgb -> oklab -> lrgb over the cube, max error < 1e-6', () => {
    let max = 0
    for (const r of lattice()) {
      for (const g of lattice()) {
        for (const b of lattice()) {
          const back = oklabToLrgb(lrgbToOklab({ r, g, b }))
          max = Math.max(
            max,
            Math.abs(back.r - r),
            Math.abs(back.g - g),
            Math.abs(back.b - b),
          )
        }
      }
    }
    expect(max).toBeLessThan(1e-6)
  })

  it('oklab -> lrgb -> oklab for in-gamut values, max error < 1e-7', () => {
    let max = 0
    for (const r of lattice()) {
      for (const g of lattice()) {
        for (const b of lattice()) {
          const lab = lrgbToOklab({ r, g, b })
          const back = lrgbToOklab(oklabToLrgb(lab))
          max = Math.max(
            max,
            Math.abs(back.L - lab.L),
            Math.abs(back.a - lab.a),
            Math.abs(back.b - lab.b),
          )
        }
      }
    }
    expect(max).toBeLessThan(1e-7)
  })
})

describe('absolute anchors (guard against a transcribed constant)', () => {
  it('linear white -> L = 1, a = 0, b = 0 (Ottosson test table, D65)', () => {
    const w = lrgbToOklab({ r: 1, g: 1, b: 1 })
    expect(w.L).toBeCloseTo(1, 6)
    expect(w.a).toBeCloseTo(0, 6)
    expect(w.b).toBeCloseTo(0, 6)
  })

  it('black -> 0, 0, 0 exactly', () => {
    expect(lrgbToOklab({ r: 0, g: 0, b: 0 })).toEqual({ L: 0, a: 0, b: 0 })
  })

  it('neutral linear grey v -> L = cbrt(v), a = b = 0 (pins both matrices row sums)', () => {
    for (const v of lattice()) {
      const lab = lrgbToOklab({ r: v, g: v, b: v })
      expect(lab.L).toBeCloseTo(Math.cbrt(v), 7)
      expect(lab.a).toBeCloseTo(0, 7)
      expect(lab.b).toBeCloseTo(0, 7)
    }
  })

  it('neutral Oklab L -> linear r = g = b = L^3 (pins the inverse matrix row sums)', () => {
    for (const L of lattice()) {
      const c = oklabToLrgb({ L, a: 0, b: 0 })
      expect(c.r).toBeCloseTo(L ** 3, 12)
      expect(c.g).toBeCloseTo(L ** 3, 12)
      expect(c.b).toBeCloseTo(L ** 3, 12)
    }
  })
})

describe('sign and ordering conventions', () => {
  const prim = (r: number, g: number, b: number): Oklab =>
    lrgbToOklab({ r: srgbToLinear(r), g: srgbToLinear(g), b: srgbToLinear(b) })

  const red = prim(1, 0, 0)
  const green = prim(0, 1, 0)
  const blue = prim(0, 0, 1)

  it('a is positive for red, negative for green', () => {
    expect(red.a).toBeGreaterThan(0)
    expect(green.a).toBeLessThan(0)
  })

  it('b is negative for blue, positive for yellow', () => {
    expect(blue.b).toBeLessThan(0)
    expect(prim(1, 1, 0).b).toBeGreaterThan(0)
  })

  it('lightness orders green > red > blue', () => {
    expect(green.L).toBeGreaterThan(red.L)
    expect(red.L).toBeGreaterThan(blue.L)
  })
})

describe('chroma reduction (D3)', () => {
  const blue = lrgbToOklab({ r: 0, g: 0, b: 1 })
  // The centre of the wheel is Oklab L = 0.6 (D35); full blue chroma at that L is
  // outside sRGB, which is what makes this the natural regression case.
  const outside: Oklab = { L: 0.6, a: blue.a, b: blue.b }

  it('the test case really is out of gamut', () => {
    expect(inGamut(oklabToLrgb(outside))).toBe(false)
  })

  it('brings an out-of-gamut colour into gamut', () => {
    expect(inGamut(oklabToLrgb(reduceChroma(outside)))).toBe(true)
  })

  it('leaves an in-gamut colour bit-identical', () => {
    const good: Oklab = { L: 0.6, a: 0.02, b: -0.03 }
    expect(reduceChroma(good)).toBe(good)
  })

  it('preserves L exactly', () => {
    expect(reduceChroma(outside).L).toBe(outside.L)
  })

  it('preserves the Oklab hue angle', () => {
    const r = reduceChroma(outside)
    expect(Math.atan2(r.b, r.a)).toBeCloseTo(Math.atan2(outside.b, outside.a), 12)
  })

  it('returns the largest factor that fits', () => {
    const r = reduceChroma(outside)
    const s = Math.hypot(r.a, r.b) / Math.hypot(outside.a, outside.b)
    const over = s + 1e-3
    expect(inGamut(oklabToLrgb({ L: outside.L, a: outside.a * over, b: outside.b * over })))
      .toBe(false)
  })

  it('is idempotent', () => {
    const once = reduceChroma(outside)
    expect(reduceChroma(once)).toBe(once)
  })

  it('handles a = b = 0 without dividing by zero', () => {
    const grey: Oklab = { L: 0.6, a: 0, b: 0 }
    expect(reduceChroma(grey)).toBe(grey)
  })

  it('fires on the centre-to-rim line, which is why D3 exists (D35)', () => {
    // Straight Oklab interpolation from the neutral centre to saturated blue leaves the
    // gamut in the middle, even though both endpoints are inside it.
    let outsideSteps = 0
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      const lab: Oklab = {
        L: 0.6 + (blue.L - 0.6) * t,
        a: blue.a * t,
        b: blue.b * t,
      }
      if (!inGamut(oklabToLrgb(lab))) outsideSteps++
    }
    expect(outsideSteps).toBeGreaterThan(0)
  })
})

describe('oklabToSrgb8', () => {
  const rims = [
    lrgbToOklab({ r: 1, g: 0, b: 0 }),
    lrgbToOklab({ r: 1, g: 1, b: 0 }),
    lrgbToOklab({ r: 0, g: 1, b: 0 }),
    lrgbToOklab({ r: 0, g: 1, b: 1 }),
    lrgbToOklab({ r: 0, g: 0, b: 1 }),
    lrgbToOklab({ r: 1, g: 0, b: 1 }),
  ]

  it('returns integers in 0..255 with no NaN across the whole disk model', () => {
    for (const rim of rims) {
      for (let i = 0; i <= 200; i++) {
        const t = i / 200
        const out = oklabToSrgb8({
          L: 0.6 + (rim.L - 0.6) * t,
          a: rim.a * t,
          b: rim.b * t,
        })
        for (const v of out) {
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(255)
        }
      }
    }
  })

  it('reproduces the saturated rim bytes exactly at t = 1', () => {
    expect(oklabToSrgb8(lrgbToOklab({ r: 1, g: 0, b: 0 }))).toEqual([255, 0, 0])
    expect(oklabToSrgb8(lrgbToOklab({ r: 0, g: 1, b: 0 }))).toEqual([0, 255, 0])
    expect(oklabToSrgb8(lrgbToOklab({ r: 0, g: 0, b: 1 }))).toEqual([0, 0, 255])
    expect(oklabToSrgb8(lrgbToOklab({ r: 1, g: 1, b: 0 }))).toEqual([255, 255, 0])
  })

  it('t = 0 is the neutral centre, equal channels', () => {
    const [r, g, b] = oklabToSrgb8({ L: 0.6, a: 0, b: 0 })
    expect(r).toBe(g)
    expect(g).toBe(b)
  })
})
