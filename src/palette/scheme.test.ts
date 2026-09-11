import { describe, expect, it } from 'vitest'
import { buildPreset } from '../mask/presets.ts'
import { sampleMask } from '../geom/sample.ts'
import { WHEELS, wheelById } from '../color/wheel.ts'
import type { Sample } from '../geom/sample.ts'
import { SHARES, buildSchemes, strength } from './scheme.ts'

/** A stand-in sample: only oklab and the position identity matter to this module. */
const at = (L: number, a: number, b: number, x = a, y = b): Sample => ({
  x,
  y,
  theta: 0,
  t: Math.hypot(a, b),
  rgb8: [0, 0, 0],
  oklab: { L, a, b },
})

describe('Munsell strength', () => {
  it('is lightness times chroma', () => {
    expect(strength(at(0.5, 0.3, 0.4))).toBeCloseTo(0.5 * 0.5, 12)
    expect(strength(at(0.8, 0.06, 0.08))).toBeCloseTo(0.8 * 0.1, 12)
  })

  it('is zero for a neutral, whatever its lightness', () => {
    for (const L of [0, 0.3, 0.6, 1]) expect(strength(at(L, 0, 0))).toBe(0)
  })

  /**
   * The ratios must not depend on the units, which is what lets Oklab stand in for
   * Munsell value and chroma at all. Rescaling both axes multiplies every strength by the
   * same factor, so every ratio — and therefore every balance score — is unchanged.
   */
  it('keeps ratios under a rescaling of lightness and chroma', () => {
    const a = at(0.4, 0.1, 0)
    const b = at(0.7, 0.2, 0)
    const scaled = (s: Sample, kL: number, kC: number) =>
      at(s.oklab.L * kL, s.oklab.a * kC, s.oklab.b * kC)
    const before = strength(b) / strength(a)
    const after = strength(scaled(b, 10, 25)) / strength(scaled(a, 10, 25))
    expect(after).toBeCloseTo(before, 12)
  })
})

describe('60-30-10 schemes', () => {
  it('uses the 60/30/10 shares, largest first', () => {
    expect([...SHARES]).toEqual([0.6, 0.3, 0.1])
  })

  it('needs at least three colours', () => {
    expect(buildSchemes([])).toEqual([])
    expect(buildSchemes([at(0.5, 0.1, 0)])).toEqual([])
    expect(buildSchemes([at(0.5, 0.1, 0), at(0.6, 0.2, 0)])).toEqual([])
  })

  /**
   * The point of the derivation: with the areas fixed, the roles are forced. A * V * C
   * constant means V*C runs 1 : 2 : 6, so the dominant is always the weakest colour and
   * the accent the strongest — never the other way round.
   */
  it('always gives the largest area to the weakest colour', () => {
    const samples = sampleMask(buildPreset('triad', 0), WHEELS[0])
    for (const scheme of buildSchemes(samples, 3)) {
      const strengths = scheme.roles.map((r) => strength(r.sample))
      expect(strengths[0]).toBeLessThanOrEqual(strengths[1])
      expect(strengths[1]).toBeLessThanOrEqual(strengths[2])
      expect(scheme.roles.map((r) => r.share)).toEqual([0.6, 0.3, 0.1])
    }
  })

  it('scores a perfectly balanced trio as 1', () => {
    // Strengths 1 : 2 : 6 against areas 0.6 : 0.3 : 0.1 give equal products.
    const base = 0.02
    const trio = [
      at(0.5, base / 0.5, 0, 0.1, 0),
      at(0.5, (2 * base) / 0.5, 0, 0.2, 0),
      at(0.5, (6 * base) / 0.5, 0, 0.3, 0),
    ]
    const [scheme] = buildSchemes(trio, 1)
    expect(scheme.balance).toBeCloseTo(1, 9)
  })

  it('scores an unbalanced trio above 1, and worse the further off it is', () => {
    const equalStrengths = [
      at(0.5, 0.1, 0, 0.1, 0),
      at(0.5, 0.1, 0, 0.2, 0),
      at(0.5, 0.1, 0, 0.3, 0),
    ]
    // Equal strengths with unequal areas: the products run 0.6 : 0.3 : 0.1, so 6x off.
    expect(buildSchemes(equalStrengths, 1)[0].balance).toBeCloseTo(6, 9)
  })

  it('treats a neutral as free, since it has no strength to balance', () => {
    // The grey may take any area; only the two chromatic members are constrained.
    const trio = [
      at(0.6, 0, 0, 0, 0),
      at(0.5, 0.06, 0, 0.2, 0),
      at(0.5, 0.18, 0, 0.3, 0),
    ]
    const [scheme] = buildSchemes(trio, 1)
    // 0.3 * (0.5*0.06) = 0.009 and 0.1 * (0.5*0.18) = 0.009: exactly balanced.
    expect(scheme.balance).toBeCloseTo(1, 9)
    expect(scheme.roles[0].sample.oklab.a).toBe(0)
  })

  it('refuses a trio whose accent is neutral', () => {
    // Three greys have nothing to balance and nothing worth planning.
    expect(buildSchemes([at(0.3, 0, 0, 0, 0), at(0.6, 0, 0, 1, 0), at(0.9, 0, 0, 2, 0)])).toEqual([])
  })

  it('returns schemes best-balanced first', () => {
    for (const preset of ['triad', 'split', 'analogous', 'atmospheric'] as const) {
      const samples = sampleMask(buildPreset(preset, 0), WHEELS[0])
      const found = buildSchemes(samples, 3)
      for (let i = 1; i < found.length; i++) {
        expect(found[i].balance).toBeGreaterThanOrEqual(found[i - 1].balance)
      }
    }
  })

  /**
   * Three schemes wherever the mask has four colours to choose from, and always three
   * DIFFERENT ones. Four is the real threshold: three colours admit exactly one trio.
   */
  it('offers three distinct schemes whenever the mask has four colours', () => {
    let checked = 0
    for (const wheel of WHEELS) {
      for (const preset of ['triad', 'split', 'analogous', 'atmospheric'] as const) {
        const samples = sampleMask(buildPreset(preset, 0), wheel)
        if (samples.length < 4) continue
        const found = buildSchemes(samples, 3)
        expect(found.length).toBe(3)
        const signatures = found.map((s) =>
          s.roles.map((r) => `${r.sample.x.toFixed(4)},${r.sample.y.toFixed(4)}`).join('|'),
        )
        expect(new Set(signatures).size).toBe(3)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(12)
  })

  /**
   * The pastel wheel is the case that proves the limit is real rather than theoretical.
   * Its colours are so close together that D47's 0.05 separation merges a tight mask down
   * to TWO samples, and two colours cannot make a three-part palette. The UI has to say
   * so; padding the list would be inventing colours the mask does not contain.
   */
  it('returns nothing when the wheel leaves too few distinguishable colours', () => {
    const pastel = wheelById('pastel')
    for (const preset of ['analogous', 'atmospheric'] as const) {
      const samples = sampleMask(buildPreset(preset, 0), pastel)
      expect(samples.length).toBeLessThan(3)
      expect(buildSchemes(samples, 3)).toEqual([])
    }
  })

  it('gives what it can when the mask is too small for three', () => {
    // Exactly three colours admit exactly one choice of three, and it says so rather
    // than padding the list with repeats.
    const samples = sampleMask(buildPreset('triad', 0), WHEELS[0]).slice(0, 3)
    expect(buildSchemes(samples, 3)).toHaveLength(1)
  })

  it('is deterministic for identical input', () => {
    const samples = sampleMask(buildPreset('split', 0), wheelById('muted'))
    const a = buildSchemes(samples, 3)
    const b = buildSchemes(samples, 3)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
