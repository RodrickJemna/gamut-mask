import { describe, expect, it } from 'vitest'
import { buildPreset } from '../mask/presets.ts'
import { sampleMask } from '../geom/sample.ts'
import { WHEELS, wedgeIndexOf, wheelById } from '../color/wheel.ts'
import type { Sample } from '../geom/sample.ts'
import { SHARES, buildSchemes, moment, strength } from './scheme.ts'

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

  it('is a vector: its length is the scalar strength', () => {
    const s = at(0.7, 0.12, -0.05)
    const m = moment(s)
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(strength(s), 12)
  })

  /**
   * The whole point of the vector form: cancelling requires OPPOSING hues as well as the
   * right magnitudes. Same strengths, same areas, only the directions differ.
   */
  it('scores a cancelling trio as balanced and a same-hue trio as biased', () => {
    /*
      Strengths 1 : 2 : 6 against areas 0.6 : 0.3 : 0.1 make the three WEIGHTED moments
      equal in length, so they cancel exactly when their hues are 120 degrees apart — and
      they cannot cancel at all if the three sit on one line, whatever the magnitudes,
      since three equal vectors on a line never sum to zero. That is the arithmetic reason
      a triad mask scores so well and an analogous one cannot.
    */
    const k = 0.04
    const spoke = (strengthWanted: number, degrees: number) => {
      const rad = (degrees * Math.PI) / 180
      const scale = strengthWanted / 0.5
      return at(0.5, scale * Math.cos(rad), scale * Math.sin(rad), degrees, 0)
    }
    const opposed = [spoke(k / 2, 0), spoke(k, 120), spoke(3 * k, 240)]
    expect(buildSchemes(opposed, 1)[0].bias).toBeCloseTo(0, 6)

    // Identical magnitudes, but all three pointing the same way: nothing cancels.
    const sameWay = [
      at(0.5, k, 0, 0.1, 0),
      at(0.5, 2 * k, 0, 0.2, 0),
      at(0.5, 6 * k, 0, 0.3, 0),
    ]
    expect(buildSchemes(sameWay, 1)[0].bias).toBeCloseTo(1, 6)
  })

  it('is scale-free, so a vivid palette is not penalised for being vivid', () => {
    const trio = (k: number) => [
      at(0.5, k, 0, 0.1, 0),
      at(0.5, 2 * k, 0, 0.2, 0),
      at(0.5, -4 * k, 0, 0.3, 0),
    ]
    expect(buildSchemes(trio(0.02), 1)[0].bias).toBeCloseTo(
      buildSchemes(trio(0.08), 1)[0].bias,
      9,
    )
  })

  it('treats a neutral as free, since its moment is zero', () => {
    // The grey may take any area; only the two chromatic members have to cancel.
    const trio = [
      at(0.6, 0, 0, 0, 0),
      at(0.5, 0.06, 0, 0.2, 0),
      at(0.5, -0.18, 0, 0.3, 0),
    ]
    const [scheme] = buildSchemes(trio, 1)
    // 0.3 * (0.5*0.06) against 0.1 * (0.5*0.18), opposed: exactly cancelling.
    expect(scheme.bias).toBeCloseTo(0, 6)
    expect(scheme.roles[0].sample.oklab.a).toBe(0)
  })

  it('refuses a trio whose accent is neutral', () => {
    // Three greys have nothing to balance and nothing worth planning.
    expect(buildSchemes([at(0.3, 0, 0, 0, 0), at(0.6, 0, 0, 1, 0), at(0.9, 0, 0, 2, 0)])).toEqual([])
  })

  it('returns schemes least-biased first', () => {
    for (const preset of ['triad', 'split', 'analogous', 'atmospheric'] as const) {
      const samples = sampleMask(buildPreset(preset, 0), WHEELS[0])
      const found = buildSchemes(samples, 3)
      for (let i = 1; i < found.length; i++) {
        expect(found[i].bias).toBeGreaterThanOrEqual(found[i - 1].bias)
      }
    }
  })

  const SPANNING = ['triad', 'split', 'complement', 'rectangle'] as const

  /**
   * The bug this criterion fixes. Scoring on magnitudes alone chose palettes like three
   * cyans, landing 0.60-0.98 off the neutral. The BEST scheme on a mask that spans the
   * wheel must now come out close to balanced. Only the best is pinned: the second and
   * third are additionally required to bring a fresh accent and dominant, and that
   * competes with balance — which is why the figure is on screen for each of them.
   */
  it('finds a well balanced palette on every mask that spans the wheel', () => {
    for (const preset of SPANNING) {
      const samples = sampleMask(buildPreset(preset, 0), WHEELS[0])
      const found = buildSchemes(samples, 3)
      expect(found.length).toBe(3)
      expect(found[0].bias, `${preset} best scheme at bias ${found[0].bias.toFixed(2)}`)
        .toBeLessThan(0.12)
    }
  })

  /**
   * ...and spreads across the wheel, which was the other half of the complaint: a
   * balanced palette can still double up on one family while leaving four wedges unused.
   * The neutral counts as its own family, since it is not "another" of any hue.
   */
  it('uses three distinct hue families wherever the mask allows it', () => {
    for (const preset of SPANNING) {
      const samples = sampleMask(buildPreset(preset, 0), WHEELS[0])
      for (const scheme of buildSchemes(samples, 3)) {
        const families = new Set(
          scheme.roles.map((r) => (r.sample.t === 0 ? -1 : wedgeIndexOf(r.sample.theta))),
        )
        expect(families.size, `${preset} reused a hue family`).toBe(3)
      }
    }
  })

  /**
   * ...and says so when a mask cannot. Every colour of an analogous wedge points the same
   * way, so no weighting cancels them. Reporting a good score here would be a lie about
   * the scheme, not a better search.
   */
  it('reports a narrow gamut as unbalanced rather than pretending', () => {
    const samples = sampleMask(buildPreset('analogous', 0), WHEELS[0])
    for (const scheme of buildSchemes(samples, 3)) {
      expect(scheme.bias).toBeGreaterThan(0.8)
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
