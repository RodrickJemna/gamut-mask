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
 * That is why the dominant is always the most muted colour of the three and the accent the
 * most vivid — the roles are not a stylistic choice, they follow from the areas.
 *
 * STRENGTH IS NOT ENOUGH, and this file got that wrong first. Scoring trios on magnitudes
 * alone says nothing about WHERE on the wheel they sit, so "a green at 60% and another
 * green at 30%" scored as well as green against red. It picked palettes like three cyans,
 * or two greens and a cyan, leaving half the gamut unused — which is not what Munsell
 * says. His illustration is directional: "a brilliant point of strong red will balance a
 * larger field of the grayest blue-green". Red against BLUE-GREEN.
 *
 * So a colour's power is treated as a VECTOR — value times chroma, pointing along its hue,
 * which in Oklab is simply `L * (a, b)` — and a palette balances when the area-weighted
 * sum of those vectors lands on the neutral. That single condition contains both halves of
 * the rule: for two colours, `w1*m1 = -w2*m2` forces the areas to be inversely
 * proportional to strength AND the hues to oppose. It is strictly more faithful than the
 * magnitude test it replaces, and measured over the presets it moved the chosen schemes
 * from 0.60-0.98 off-neutral down to 0.03-0.14.
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
 * GREY IS FREE, which is faithful rather than a loophole: a colour with no chroma has a
 * zero moment, so it cannot unbalance anything. It is the point the others balance on. A
 * neutral can therefore hold any area, and only the chromatic members have to cancel —
 * which is exactly how a big muted basecoat with two chromatic accents works at the bench.
 *
 * A NARROW GAMUT CANNOT BALANCE, and the score says so instead of pretending. Every colour
 * in an analogous mask points roughly the same way, so no weighting cancels them: its best
 * schemes score 0.94 and up. That is true of the scheme, not a failure of the search — an
 * analogous gamut is deliberately one-sided, which is the whole reason to choose one.
 */

import { wedgeIndexOf } from '../color/wheel.ts'
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

/**
 * The same strength as a VECTOR, pointing along the colour's hue: `L * (a, b)`.
 *
 * Its length is exactly `strength`, so nothing about the magnitude rule changes — this
 * only adds the direction that the magnitude alone threw away.
 */
export function moment(sample: Sample): { x: number; y: number } {
  return { x: sample.oklab.L * sample.oklab.a, y: sample.oklab.L * sample.oklab.b }
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
   * How far off the neutral the area-weighted palette lands, from 0 to 1.
   *
   * `|sum of w*m| / sum of |w*m|`: zero when the moments cancel exactly, one when they
   * all pull the same way. Normalising by the total makes it a direction-only measure, so
   * it is comparable between a vivid palette and a muted one rather than reporting the
   * vivid one as worse for being vivid.
   */
  bias: number
}

function scoreTrio(trio: Sample[]): Scheme | null {
  /**
   * Roles are NOT searched over: the magnitude rule fixes them. Areas inversely
   * proportional to strength means the weakest colour takes the largest area, so ordering
   * by strength IS the assignment. Trying all six permutations would find lower bias by
   * putting a vivid colour on 60% of the model, which is the one thing the rule exists to
   * prevent.
   */
  const ordered = [...trio].sort((a, b) => strength(a) - strength(b))
  const accent = ordered[2]
  // With no chromatic accent there is nothing to balance and nothing worth painting.
  if (strength(accent) <= NEUTRAL_STRENGTH) return null

  let sumX = 0
  let sumY = 0
  let total = 0
  ordered.forEach((sample, i) => {
    const m = moment(sample)
    sumX += SHARES[i] * m.x
    sumY += SHARES[i] * m.y
    total += SHARES[i] * Math.hypot(m.x, m.y)
  })

  return {
    roles: ordered.map((sample, i) => ({ share: SHARES[i], sample })),
    bias: total <= NEUTRAL_STRENGTH ? 0 : Math.hypot(sumX, sumY) / total,
  }
}

/**
 * Which hue family a colour belongs to, for the spread preference below. The neutral gets
 * its own marker rather than a wedge: it has no hue, so it is not "another" of anything.
 */
const family = (sample: Sample): number =>
  sample.t === 0 ? -1 : wedgeIndexOf(sample.theta)

/**
 * The best `limit` schemes the mask can offer, least biased first.
 *
 * DIVERSITY IS RELAXED IN STAGES rather than allowed to starve.
 *
 * The first pass also wants THREE DISTINCT HUE FAMILIES, because a balanced palette can
 * still double up — two yellows whose combined pull cancels one magenta balances perfectly
 * while leaving four wedges of the gamut unused, and that reads as an oversight even
 * though the arithmetic is right. Measured, the preference is nearly free: insisting on
 * three families costs between 0 and 2 points of bias across the presets. Where it is
 * impossible it is dropped, which is the analogous wedge, where every colour is the same
 * family by construction.
 *
 * Then a distinct accent AND a distinct dominant per scheme, which is what makes three
 * schemes read as three different ideas instead of one idea with a substitution. On a
 * small mask that can only fill one slot, so the next pass asks only for a distinct accent
 * — the accent is what gives a scheme its character — and the last takes whatever is left.
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
  all.sort((a, b) => a.bias - b.bias)

  const key = (s: Scheme, i: number) =>
    `${s.roles[i].sample.x.toFixed(6)},${s.roles[i].sample.y.toFixed(6)}`

  const chosen: Scheme[] = []
  const accents = new Set<string>()
  const dominants = new Set<string>()
  const spread = (s: Scheme) =>
    new Set(s.roles.map((role) => family(role.sample))).size === 3
  const fresh = (s: Scheme) => !accents.has(key(s, 2)) && !dominants.has(key(s, 0))

  const stages: ((s: Scheme) => boolean)[] = [
    (s) => spread(s) && fresh(s),
    fresh,
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
  return chosen.sort((a, b) => a.bias - b.bias)
}
