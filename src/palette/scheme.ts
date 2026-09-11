/**
 * 60-30-10 palettes derived from the mask's colours. Spec: D54.
 *
 * WHAT IS AND IS NOT SCIENCE HERE, because the difference matters.
 *
 * 60-30-10 itself is a design-industry rule of thumb — one dominant colour, one
 * secondary, one accent — not a result from vision science. What IS a stated, century-old
 * principle is MUNSELL'S BALANCE: "the stronger the color we wish to employ, the smaller
 * must be its area; while the larger the area, the grayer the Chroma", with colour
 * balancing on middle grey. Munsell made it quantitative: a colour's strength is the
 * product of its VALUE and its CHROMA, and areas balance INVERSELY to that product.
 *
 *   A1 / A2 = (V2 * C2) / (V1 * C1),   equivalently   A * V * C is constant
 *
 * Two worked examples from Munsell's own material fix the formula beyond doubt: R7/6
 * (7 x 6 = 42) balances R3/3 (3 x 3 = 9) in the proportion 9 parts to 42; and Blue 4/5
 * (20) against Yellow-Red 6/7 (42) is used as 42 parts to 20.
 *
 * SO 60-30-10 BECOMES CHECKABLE. Fixing the areas at 0.6, 0.3 and 0.1 forces the
 * strengths: since A * V * C must be equal, V*C has to run 1 : 2 : 6 across the three.
 * The accent must be six times as strong as the dominant, and the secondary twice.
 * That is the whole criterion, and it is why the dominant is always the most muted colour
 * of the three and the accent the most vivid — the roles are not a stylistic choice, they
 * follow from the areas.
 *
 * WHERE THIS APPROXIMATES. Munsell value and chroma are specific scales; we use Oklab
 * lightness and Oklab chroma instead, because that is what the wheel is built in (D35)
 * and because Munsell renotation is an explicit non-goal (section 7). Oklab L is a
 * monotone but NOT identical remapping of Munsell value, so the strengths are not Munsell
 * numbers. The ratios are unaffected by the units — rescaling L and C by any constants
 * multiplies every strength by the same factor and cancels — but the non-linearity
 * between the two lightness scales does perturb them. Treat `balance` as a good relative
 * ordering, not as a Munsell measurement.
 *
 * GREY IS FREE, which is faithful rather than a loophole: a colour with no chroma has no
 * strength, so it cannot unbalance anything. It is the point the others balance on. A
 * neutral can therefore hold any area, and the score only constrains the chromatic
 * members — which is exactly how a big muted basecoat with two chromatic accents works at
 * the bench.
 */

import type { Sample } from '../geom/sample.ts'

/** The areas, largest first. Fixed by the request: this is a 60-30-10 planner. */
export const SHARES = [0.6, 0.3, 0.1] as const

/**
 * Below this a colour counts as neutral and contributes no strength. Well under the
 * chroma of any colour the wheel produces off its exact centre, so only the true neutral
 * sample (which the sampler snaps to the origin) lands here.
 */
const NEUTRAL_STRENGTH = 1e-6

/** Munsell's colour strength, in Oklab units: lightness times chroma. */
export function strength(sample: Sample): number {
  return sample.oklab.L * Math.hypot(sample.oklab.a, sample.oklab.b)
}

export type SchemeRole = {
  /** 0.6, 0.3 or 0.1. */
  share: number
  sample: Sample
}

export type Scheme = {
  /** Dominant, secondary, accent — in that order, weakest strength first. */
  roles: SchemeRole[]
  /**
   * How well the three satisfy Munsell's balance: the ratio of the largest
   * `area * strength` product to the smallest, over the chromatic members. 1 is exact
   * balance and larger is worse. Above about 2 the mask simply does not hold three
   * colours whose strengths span the 6x that 60-30-10 needs.
   */
  balance: number
}

function scoreTrio(trio: Sample[]): Scheme | null {
  // Roles follow from the areas, so the trio is ordered by strength rather than chosen.
  const ordered = [...trio].sort((a, b) => strength(a) - strength(b))
  const accent = ordered[2]
  // With no chromatic accent there is nothing to balance and nothing worth painting.
  if (strength(accent) <= NEUTRAL_STRENGTH) return null

  const products = ordered
    .map((sample, i) => SHARES[i] * strength(sample))
    .filter((_, i) => strength(ordered[i]) > NEUTRAL_STRENGTH)

  return {
    roles: ordered.map((sample, i) => ({ share: SHARES[i], sample })),
    balance: Math.max(...products) / Math.min(...products),
  }
}

/**
 * The best `limit` schemes the mask can offer, best balance first.
 *
 * DIVERSITY IS RELAXED IN STAGES rather than allowed to starve. The first pass demands a
 * distinct accent AND a distinct dominant per scheme, which is what makes three schemes
 * read as three different ideas instead of one idea with a substitution. On a small mask
 * that rule can only fill one slot, so the second pass asks only for a distinct accent —
 * the accent is what gives a scheme its character — and the third takes whatever is left.
 * A four-colour mask yields three schemes this way; a three-colour mask yields one,
 * honestly, because there is only one way to choose three of three.
 */
export function buildSchemes(samples: Sample[], limit = 3): Scheme[] {
  if (samples.length < 3) return []

  const all: Scheme[] = []
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      for (let k = j + 1; k < samples.length; k++) {
        const scheme = scoreTrio([samples[i], samples[j], samples[k]])
        if (scheme) all.push(scheme)
      }
    }
  }
  all.sort((a, b) => a.balance - b.balance)

  const key = (s: Scheme, i: number) =>
    `${s.roles[i].sample.x.toFixed(6)},${s.roles[i].sample.y.toFixed(6)}`

  const chosen: Scheme[] = []
  const accents = new Set<string>()
  const dominants = new Set<string>()
  const stages: ((s: Scheme) => boolean)[] = [
    (s) => !accents.has(key(s, 2)) && !dominants.has(key(s, 0)),
    (s) => !accents.has(key(s, 2)),
    () => true,
  ]

  for (const passes of stages) {
    for (const scheme of all) {
      if (chosen.length >= limit) break
      if (chosen.includes(scheme)) continue
      if (!passes(scheme)) continue
      chosen.push(scheme)
      accents.add(key(scheme, 2))
      dominants.add(key(scheme, 0))
    }
    if (chosen.length >= limit) break
  }

  // Re-sorted after the staged picking, or a scheme admitted by a later, looser stage
  // would sit above a better-balanced one that the first stage had already taken.
  return chosen.sort((a, b) => a.balance - b.balance)
}
