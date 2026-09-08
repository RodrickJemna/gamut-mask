/**
 * Per-pixel rendering of the disk into an ImageData. Spec: F1, D30, D4.
 *
 * D30 chose per-pixel over a segment fan, so the transition is smooth. D4 chose canvas
 * for the disk with an SVG overlay on top for the handles: hit-testing is trivial in SVG
 * and WebGL is pointless here — around 125k pixels, computed once per resize (F1).
 *
 * IMPLEMENT
 *
 *   renderDisk(size: number, dpr: number): ImageData
 *
 * `size` is the CSS-pixel side of the square canvas; the backing store is
 * `size * dpr` on both axes. Walk every pixel of the backing store:
 *
 *   1. convert pixel centre to wheel space: `x = (px + 0.5) / (side / 2) - 1`, same for y
 *   2. `t = hypot(x, y)`; if `t > 1` write alpha 0 and continue
 *   3. `sampleSrgb8(angleOf(x, y), t)` from `wheel.ts`, alpha 255
 *
 * Antialias the rim by feathering alpha over the last pixel or so of radius — a hard
 * cutoff on a 500px disk is visibly stair-stepped. Compute the feather width in wheel
 * units from `dpr` so it stays one device pixel wide.
 *
 * At the exact centre `angleOf(0,0)` is undefined (atan2(0,0) = 0). Harmless, because
 * `t = 0` is the same neutral for every angle, but do not let a guard clause there
 * produce a differently-coloured centre pixel.
 *
 * CACHING (F1: "one ImageData cache, recomputed only on resize"). Key the cache on
 * `size * dpr` and nothing else — the disk does not depend on the mask, the polygon, or
 * anything else in state. Mask edits must never invalidate it. Recomputing on every
 * drag frame is the performance mistake this note exists to prevent.
 *
 * This is a pure function: no canvas element, no React, no DOM reads. `WheelCanvas.tsx`
 * owns the element, the ResizeObserver and the `putImageData` call. That split is what
 * keeps this testable, though per CLAUDE.md the tests here are thin — the maths lives in
 * `wheel.ts`. If a test is added, assert the geometry (centre pixel is neutral, the four
 * cardinal rim pixels are the right primaries, corners are transparent), not the colours.
 *
 * No test file for now: everything colour-related is covered in `wheel.test.ts`.
 */
