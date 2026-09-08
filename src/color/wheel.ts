/**
 * The wheel model. Spec: section 2, D21, D34, D35. This is the only real maths in the
 * project besides `oklab.ts`.
 *
 * Read `docs/implementation-plan.md` section 2 for the coordinate convention before
 * touching this file, and section 3 for the pipeline. Summary: angle 0 = R = up,
 * increasing clockwise, y grows down, disk radius 1.
 *
 * IMPLEMENT
 *
 *   const ANCHORS: readonly { letter: 'R'|'Y'|'G'|'C'|'B'|'M'; angle: number }[]
 *     // R 0, Y 60, G 120, C 180, B 240, M 300 — exactly 60 deg apart (D21, D34)
 *
 *   dir(theta: number): { x: number; y: number }        // (sin t, -cos t)
 *   angleOf(x: number, y: number): number               // atan2(x, -y) -> [0, 360)
 *   radiusOf(x: number, y: number): number              // hypot
 *   polar(theta: number, t: number): { x: number; y: number }
 *
 *   rimSrgb(theta: number): Rgb                         // saturated sRGB at that hue
 *   rimOklab(theta: number): Oklab                      // memoise if profiling says so
 *   const CENTRE_OKLAB: Oklab = { L: 0.6, a: 0, b: 0 }  // D35
 *
 *   sample(theta: number, t: number): Oklab             // the model, see below
 *   sampleSrgb8(theta: number, t: number): [number, number, number]
 *
 * RIM (D35). The rim is the fully saturated sRGB colour at that hue — by definition the
 * maximum chroma available there, which is why no gamut search is needed (D19 was
 * withdrawn for this reason). Compute it as the sRGB hue hexagon, equivalently
 * HSV(h = theta, s = 1, v = 1): one channel at 1, one at 0, one ramping linearly across
 * each 60 deg sector. At the six anchors it lands exactly on a primary or secondary.
 *
 * Note the identity behind D33: the spec's clockwise R->Y->G->C->B->M ordering at 60 deg
 * spacing is numerically the same as the sRGB HSV hue angle. So `theta` IS the sRGB hue
 * and no anchor-to-anchor interpolation layer is needed — adding one collapses to the
 * identity function. That is a withdrawn decision; do not reintroduce it.
 *
 * SAMPLE. Linear interpolation in Oklab, per component:
 *   L = lerp(0.6, rimL, t), a = lerp(0, rimA, t), b = lerp(0, rimB, t)
 * then `reduceChroma` if it fell out of gamut (D3). `t` is normalised per hue: `t = 0.7`
 * means "70% of the way to full saturation for this hue", never an absolute chroma
 * (D35, and D20 is withdrawn — do not make the radius absolute chroma again).
 *
 * The interpolation is what the whole file exists for; doing it in sRGB instead makes
 * visible mud in the mid rings, which is exactly where muted palettes live (D35).
 *
 * TESTS -> wheel.test.ts
 */
