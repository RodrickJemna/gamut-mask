import { describe, it } from 'vitest'

/**
 * Oklab correctness. This suite's job is to catch a mis-transcribed matrix constant,
 * which is the failure mode this project cares about most.
 *
 * A round-trip test alone is weak: it passes whenever the forward and inverse matrices
 * are consistent, including when both are consistently wrong. So it is paired with
 * absolute anchor values taken from the source.
 */

describe('transfer function', () => {
  it.todo('srgbToLinear and linearToSrgb are inverse across 0..1 (1e-12)')
  it.todo('is continuous at the piecewise knee (0.04045 / 0.0031308)')
  it.todo('maps 0 -> 0 and 1 -> 1 exactly')
})

describe('Oklab round trip', () => {
  it.todo('lrgb -> oklab -> lrgb over a 17^3 lattice of the cube, max error < 1e-10')
  it.todo('oklab -> lrgb -> oklab for in-gamut Oklab values, max error < 1e-10')
})

describe('Oklab anchor values (guards against a transcribed constant)', () => {
  // Read the expected numbers off Ottosson's post. Do not derive them with this code.
  it.todo('white (1,1,1) -> L = 1, a = 0, b = 0 within 1e-6')
  it.todo('black (0,0,0) -> L = 0, a = 0, b = 0 exactly')
  it.todo('mid grey has a = b = 0 and 0 < L < 1')
  it.todo('sRGB primaries R, G, B match the published Oklab values within 1e-4')
  it.todo('a > 0 for red, a < 0 for green, b < 0 for blue (sign conventions)')
})

describe('chroma reduction (D3)', () => {
  it.todo('leaves an already in-gamut colour untouched (s = 1, bit-identical)')
  it.todo('brings an out-of-gamut colour into gamut')
  it.todo('preserves L exactly')
  it.todo('preserves the a/b ratio, i.e. Oklab hue angle, within 1e-9')
  it.todo('returns the largest s that fits: s + 1e-3 would be out of gamut')
  it.todo('is idempotent — reducing a reduced colour changes nothing')
  it.todo('handles a = b = 0 without dividing by zero')
})

describe('oklabToSrgb8', () => {
  it.todo('returns integers in 0..255 for every (L in 0..1, hue, t) the wheel can produce')
  it.todo('never returns NaN')
})
