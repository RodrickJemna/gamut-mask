/**
 * The wheel model. Spec: section 2, D21, D34, D35.
 *
 * Wheel space (docs/implementation-plan.md section 2): origin at the disk centre, radius
 * 1, x right, y DOWN so it matches canvas and SVG user space. Angle in degrees, 0 = R =
 * straight up, increasing clockwise on screen.
 *
 * `Point` lives here rather than in geom/: this module defines wheel space, and every
 * point in the app is a wheel-space point.
 */

import {
  lrgbToOklab,
  oklabToSrgb8,
  reduceChroma,
  srgbToLinear,
  type Oklab,
  type Rgb,
} from './oklab.ts'

export type Point = { x: number; y: number }

/**
 * D21: red up, clockwise, exactly 60 degrees apart. D34: all six always drawn.
 *
 * `name` is display text (English, D26) used by the sample list's wedge headings. It sits
 * here rather than in a component because it belongs with the letter it labels.
 */
export const ANCHORS = [
  { letter: 'R', angle: 0, name: 'Red' },
  { letter: 'Y', angle: 60, name: 'Yellow' },
  { letter: 'G', angle: 120, name: 'Green' },
  { letter: 'C', angle: 180, name: 'Cyan' },
  { letter: 'B', angle: 240, name: 'Blue' },
  { letter: 'M', angle: 300, name: 'Magenta' },
] as const

/** Width of one anchor's wedge in degrees — the six divide the wheel exactly. */
export const WEDGE_SPAN = 60

/**
 * The nearest anchor angle to `deg` (D49).
 *
 * The six anchors sit at multiples of WEDGE_SPAN, so this is a rounding — but it is
 * expressed in terms of the anchors rather than of 60 because that is what makes it
 * meaningful: the presets are built on the anchor angles, so a rotation that is a
 * multiple of the wedge span is one that puts the mask's vertices back on named hues.
 * That is the property worth snapping to, and it is why writing down "triad at 120" is
 * enough to reproduce a scheme exactly.
 */
export function snapToAnchorAngle(deg: number): number {
  return normalizeAngle(Math.round(deg / WEDGE_SPAN) * WEDGE_SPAN)
}

/**
 * Which anchor's wedge an angle falls in, as an index into ANCHORS.
 *
 * Each wedge is centred on its anchor, so it runs from anchor - 30 to anchor + 30. Red's
 * wedge therefore straddles the 0/360 seam: 330 and 10 are both Red.
 */
export function wedgeIndexOf(theta: number): number {
  return Math.floor((normalizeAngle(theta) + WEDGE_SPAN / 2) / WEDGE_SPAN) % ANCHORS.length
}

/**
 * Position within its own wedge, 0 to 60, measured from the wedge's leading edge.
 *
 * This is what lets the Red wedge be ordered correctly despite the seam: 339 maps to 9
 * and 0 maps to 30, so they sort in the order they appear on the wheel. Sorting Red by
 * raw angle instead splits it across both ends of the list.
 */
export function wedgeOffsetOf(theta: number): number {
  return (normalizeAngle(theta) + WEDGE_SPAN / 2) % WEDGE_SPAN
}

/** D35: the neutral centre. */
export const CENTRE_OKLAB: Oklab = { L: 0.6, a: 0, b: 0 }

const DEG = Math.PI / 180

export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360
}

export function dir(theta: number): Point {
  return { x: Math.sin(theta * DEG), y: -Math.cos(theta * DEG) }
}

export function polar(theta: number, t: number): Point {
  const d = dir(theta)
  return { x: d.x * t, y: d.y * t }
}

export function angleOf(x: number, y: number): number {
  return normalizeAngle(Math.atan2(x, -y) / DEG)
}

export function radiusOf(x: number, y: number): number {
  return Math.hypot(x, y)
}

/**
 * The rim: the fully saturated sRGB colour at that hue, which is by definition the
 * maximum chroma available there — so no gamut search is needed (D35, and D19/D15 were
 * withdrawn for exactly this reason).
 *
 * This is a walk around the sRGB hue hexagon, equivalently HSV(h = theta, s = 1, v = 1).
 * Per D33, the spec's clockwise R Y G C B M ordering at 60-degree spacing IS the sRGB
 * hue angle, so `theta` needs no remapping; an anchor-to-anchor interpolation layer
 * would collapse to the identity.
 */
export function rimSrgb(theta: number): Rgb {
  const h = normalizeAngle(theta) / 60
  const i = Math.floor(h) % 6
  const f = h - Math.floor(h)
  switch (i) {
    case 0: return { r: 1, g: f, b: 0 }
    case 1: return { r: 1 - f, g: 1, b: 0 }
    case 2: return { r: 0, g: 1, b: f }
    case 3: return { r: 0, g: 1 - f, b: 1 }
    case 4: return { r: f, g: 0, b: 1 }
    default: return { r: 1, g: 0, b: 1 - f }
  }
}

export function rimOklab(theta: number): Oklab {
  const { r, g, b } = rimSrgb(theta)
  return lrgbToOklab({
    r: srgbToLinear(r),
    g: srgbToLinear(g),
    b: srgbToLinear(b),
  })
}

/**
 * D35: linear interpolation in Oklab from the neutral centre to the rim.
 *
 * `t` is normalised per hue — 0.7 means "70% of the way to full saturation for this
 * hue", never an absolute chroma (D20 withdrawn). The stated price is that equal radii
 * on different hues are not equally saturated.
 *
 * Written as `a * (1 - t) + b * t` rather than `a + (b - a) * t` so that t = 0 and t = 1
 * land exactly on the centre and the rim instead of one float step away.
 *
 * Interpolating in sRGB instead would make visible mud in the mid rings, which is where
 * muted palettes live — that is the whole reason Oklab is here at all.
 *
 * One correction to D35, measured rather than assumed: its claim that within a hue
 * "further out is more saturated" is not exact. The raw interpolation is monotone in
 * chroma, but reduceChroma clamps to the gamut boundary, whose chroma at constant L
 * shrinks as L falls toward a dark rim. Near blue the line leaves the gamut and chroma
 * dips by up to 2.3e-4 (0.08%) — about a fifth of an 8-bit step, so invisible, but not
 * zero. See the bounded guard in wheel.test.ts.
 */
export function sample(
  theta: number,
  t: number,
  wheel: WheelSpec = WHEELS[0],
): Oklab {
  const rim = wheel.rim(theta)
  const centre = wheel.centre
  return reduceChroma({
    L: centre.L * (1 - t) + rim.L * t,
    a: centre.a * (1 - t) + rim.a * t,
    b: centre.b * (1 - t) + rim.b * t,
  })
}

export function sampleSrgb8(
  theta: number,
  t: number,
  wheel: WheelSpec = WHEELS[0],
): [number, number, number] {
  return oklabToSrgb8(sample(theta, t, wheel))
}

/**
 * WHEEL VARIANTS. Spec: D53.
 *
 * A wheel is nothing but a CENTRE and a RIM: `sample` above lerps between them in Oklab
 * and reduces chroma to fit. So a variant is a swap of two values, and everything
 * downstream — the polygon, the sampler, the matcher, the exports — is indifferent to
 * which one is in use.
 *
 * All of these keep the ANGLE convention above, which is why they are cheap: the six
 * anchors stay at 60 degrees, so the R Y G C B M letters, the colour list's wedge
 * headings and the Snap 60 step remain correct, and a mask drawn on one wheel means the
 * same thing on another. A wheel with a different angular geometry — an RYB artists'
 * wheel, or perceptually spaced hues — would move the anchors and is a different job.
 *
 * NO LIGHTNESS AXIS IS BACK (D16). Each variant is still exactly one colour per
 * (angle, radius); picking a wheel picks a surface, it does not add a dimension, and
 * there is no ramp, no ladder and nothing to scrub through.
 */
export type WheelSpec = {
  id: WheelId
  /** Shown beside the WHEEL heading (D26: English, no i18n layer). */
  label: string
  /** One-line description, used as the chip's tooltip. */
  hint: string
  centre: Oklab
  rim: (theta: number) => Oklab
}

export type WheelId = 'saturated' | 'pastel' | 'muted' | 'shadow'

const WHITE: Oklab = { L: 1, a: 0, b: 0 }
const BLACK: Oklab = { L: 0, a: 0, b: 0 }

const mix = (a: Oklab, b: Oklab, t: number): Oklab => ({
  L: a.L * (1 - t) + b.L * t,
  a: a.a * (1 - t) + b.a * t,
  b: a.b * (1 - t) + b.b * t,
})

/**
 * The four wheels, saturated first so it stays the default everywhere.
 *
 * The constants were chosen by MEASURING paint reachability — the share of the disk's
 * area where some catalogued paint lands within the D40 tolerance, the same quantity
 * D50's scrim shades:
 *
 *   saturated  60.1%    muted   97.4%
 *   pastel     72.6%    shadow  95.3%
 *
 * Two findings worth keeping, because they are not what you would guess:
 *
 * MUTED IS THE PRACTICAL ONE. At 97.4% almost every colour on it can be bought, against
 * 60% for the wheel this tool shipped with, and it spends its whole area in the range
 * where hobby paints actually live.
 *
 * PASTEL IS THE WEAKEST of the three, not the mildest. Only 114 of the catalogued paints
 * sit above L 0.85 and the median is 0.53, so a wheel that is pale AND bright is largely
 * colours that cannot be matched. Reachability is driven by CHROMA rather than lightness
 * — mixing MORE white toward the rim improves it (0.25 -> 62.8%, 0.55 -> 78.7%) while
 * raising the centre's lightness makes it worse (L 0.70 -> 78.7%, L 0.90 -> 72.7%) —
 * which is why this one is pale at low chroma instead of pale and vivid.
 *
 * Like `--mask-wash-opacity` and the preset radii, these are named constants because they
 * are tuning surface: measured, but not yet judged on a colour-managed display.
 */
export const WHEELS: readonly WheelSpec[] = [
  {
    id: 'saturated',
    label: 'Saturated',
    hint: 'Full sRGB saturation at the rim — the widest gamut, and the hardest to buy',
    centre: CENTRE_OKLAB,
    rim: (theta) => rimOklab(theta),
  },
  {
    id: 'pastel',
    label: 'Pastel',
    hint: 'Tints: a near-white centre and a rim mixed toward white',
    centre: { L: 0.9, a: 0, b: 0 },
    rim: (theta) => mix(rimOklab(theta), WHITE, 0.55),
  },
  {
    id: 'muted',
    label: 'Muted',
    hint: 'Tones: the rim pulled toward the neutral — almost every colour has a paint',
    centre: CENTRE_OKLAB,
    rim: (theta) => mix(rimOklab(theta), CENTRE_OKLAB, 0.45),
  },
  {
    id: 'shadow',
    label: 'Shadow',
    hint: 'Shades: a dark centre and a rim mixed toward black',
    centre: { L: 0.32, a: 0, b: 0 },
    rim: (theta) => mix(rimOklab(theta), BLACK, 0.45),
  },
]

export const DEFAULT_WHEEL: WheelId = 'saturated'

/** The spec for an id, falling back to the default rather than throwing. */
export function wheelById(id: WheelId): WheelSpec {
  return WHEELS.find((w) => w.id === id) ?? WHEELS[0]
}
