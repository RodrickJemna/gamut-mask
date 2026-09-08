/**
 * Oklab <-> sRGB. Spec: D3, D32, D37.
 *
 * SCOPE. This file exists for one reason: to interpolate the centre-to-rim transition of
 * the wheel in a perceptual space (D35). It is not a colour library. Do not add hue
 * rotation, OkLCh, colour difference, other spaces, or a named-colour table. If something
 * here is not used by `wheel.ts` or `format.ts`, it should not be here (D37).
 *
 * IMPLEMENT
 *
 *   type Rgb   = { r: number; g: number; b: number }   // sRGB, gamma-encoded, 0..1
 *   type Lrgb  = { r: number; g: number; b: number }   // linear sRGB, 0..1 nominal
 *   type Oklab = { L: number; a: number; b: number }
 *
 *   srgbToLinear(c: number): number     // per channel
 *   linearToSrgb(c: number): number     // per channel
 *   lrgbToOklab(c: Lrgb): Oklab
 *   oklabToLrgb(c: Oklab): Lrgb
 *   inGamut(c: Lrgb, eps?: number): boolean
 *   reduceChroma(c: Oklab): Oklab       // D3, see below
 *   oklabToSrgb8(c: Oklab): [number, number, number]  // 0..255 ints, gamut-safe
 *
 * The transfer function is the real sRGB piecewise curve, not `pow(c, 2.2)`:
 *   to linear:  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
 *   to sRGB:    c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
 *
 * Structure of the conversion (Ottosson, https://bottosson.github.io/posts/oklab/):
 *   linear sRGB --[3x3 M1]--> LMS --[cbrt per component]--> LMS' --[3x3 M2]--> Oklab
 * and the inverse with M2^-1, cube, M1^-1. We do NOT go through XYZ (D32).
 *
 * TRANSCRIBE THE 24 CONSTANTS FROM THE SOURCE, do not take them from memory or from a
 * chat message, mine included. This is the single most expensive place in the project to
 * be subtly wrong (CLAUDE.md, fidelity rules). Use `Math.cbrt`, and note that `cbrt`
 * handles negative inputs correctly while `x ** (1/3)` returns NaN for them — LMS
 * components can go slightly negative for near-gamut-edge colours.
 *
 * CHROMA REDUCTION (D3). `oklabToLrgb` of an interpolated Oklab value can fall outside
 * the sRGB cube, because the gamut is not convex in Oklab. When it does, hold `L` fixed
 * and scale `a` and `b` by a common factor `s` until it fits. Find `s` by bisection on
 * [0, 1] — 16-20 iterations puts the error far below one 8-bit step, and `s = 0` is
 * guaranteed to be in gamut for `L` in [0,1] because that is the neutral axis. Do not
 * clamp the RGB channels instead: that shifts hue and lightness at the same time, and it
 * is exactly the "silent channel clip" D3 forbids.
 *
 * The final 0..255 conversion clamps only to absorb float dust (values like 1.0000002)
 * after reduction has already succeeded — round with `Math.round`, then clamp to 0..255.
 *
 * TESTS -> oklab.test.ts
 */
