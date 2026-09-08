/**
 * Oklab <-> sRGB. Spec: D3, D32, D37.
 *
 * Exists for one reason: to interpolate the wheel's centre-to-rim transition in a
 * perceptual space (D35). Not a colour library — no OkLCh, no hue rotation, no other
 * spaces, no named colours (D37).
 *
 * The matrices are Ottosson's originals, transcribed from
 * https://bottosson.github.io/posts/oklab/, linear sRGB <-> Oklab directly. We do not
 * go through XYZ (D32).
 *
 * One `Rgb` type serves both gamma-encoded and linear sRGB: a separate `Lrgb` alias
 * would be structurally identical and so enforce nothing. The function names carry the
 * space instead.
 */

export type Rgb = { r: number; g: number; b: number }
export type Oklab = { L: number; a: number; b: number }

/** sRGB transfer function, the real piecewise curve rather than a 2.2 power. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

export function lrgbToOklab({ r, g, b }: Rgb): Oklab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  // cbrt, not ** (1/3): these can go slightly negative near the gamut edge.
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  }
}

export function oklabToLrgb({ L, a, b }: Oklab): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  }
}

/**
 * Tolerance at the cube faces. This must be LOOSER than the precision of the matrices
 * themselves: the published constants carry 10 decimals, so a round trip drifts by up to
 * ~2.6e-7, and a fully saturated rim colour lands as much as 1.3e-7 outside [0,1] purely
 * from that drift. A tighter epsilon judges the rim out of gamut and chroma-reduces
 * colours that are in fact exactly on the boundary. 1e-6 clears the drift with room to
 * spare while still being 2.5e-4 of one 8-bit step, so nothing visible passes through.
 */
const GAMUT_EPS = 1e-6

export function inGamut({ r, g, b }: Rgb): boolean {
  return (
    r >= -GAMUT_EPS && r <= 1 + GAMUT_EPS &&
    g >= -GAMUT_EPS && g <= 1 + GAMUT_EPS &&
    b >= -GAMUT_EPS && b <= 1 + GAMUT_EPS
  )
}

/**
 * D3: when an interpolated Oklab value falls outside sRGB, hold `L` and scale `a`/`b`
 * by a common factor until it fits. Never clip channels — that shifts hue and lightness
 * together, which is the silent clip D3 forbids.
 *
 * `s = 0` is always in gamut for `L` in [0,1], because the neutral axis maps to
 * `r = g = b = L^3` (each row of the inverse matrix sums to 1). Outside that `L` range
 * no chroma helps and the result stays out; the byte conversion clamps it.
 *
 * Bisection assumes the in-gamut set along the ray is the interval [0, sMax] — i.e. that
 * the constant-L slice of the sRGB gamut is star-shaped about the neutral point. That
 * holds for sRGB in Oklab in practice but is not proven here; it is the same assumption
 * CSS Color 4 gamut mapping makes. 20 steps resolve to ~1e-6, far under 1/255.
 */
export function reduceChroma(c: Oklab): Oklab {
  if (inGamut(oklabToLrgb(c))) return c
  if (c.a === 0 && c.b === 0) return c

  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklabToLrgb({ L: c.L, a: c.a * mid, b: c.b * mid }))) lo = mid
    else hi = mid
  }
  return { L: c.L, a: c.a * lo, b: c.b * lo }
}

function toByte(c: number): number {
  return Math.min(255, Math.max(0, Math.round(linearToSrgb(c) * 255)))
}

/**
 * Euclidean distance in Oklab.
 *
 * Lives here rather than with paint matching because two callers now need it — matching
 * and the sampler's separation test — and it is a property of the colour space, not of
 * either use.
 */
export function oklabDistance(a: Oklab, b: Oklab): number {
  const dL = a.L - b.L
  const da = a.a - b.a
  const db = a.b - b.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

/** Gamut-safe Oklab -> 8-bit sRGB. Reduces chroma first (D3), then clamps float dust. */
export function oklabToSrgb8(c: Oklab): [number, number, number] {
  const { r, g, b } = oklabToLrgb(reduceChroma(c))
  return [toByte(r), toByte(g), toByte(b)]
}
