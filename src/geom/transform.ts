/**
 * Rotate and scale the mask about the wheel centre. Spec: F5, D22.
 *
 * F5 is the Gurney workflow: choose a mask shape, then swing it round the wheel and open
 * or close it. Rotation changes the hue family, scaling changes how muted the palette is.
 */

import { angleOf, polar, radiusOf } from '../color/wheel.ts'
import { clampToDisk, type Polygon } from './polygon.ts'

/**
 * PIVOT — both operations are about the wheel centre (0,0), never the polygon's own
 * centroid. That is what makes the two sliders mean something in this model: rotating
 * about the centre moves the mask along the hue axis at constant radius, and scaling
 * about the centre slides every vertex along its own hue ray, changing saturation
 * without changing hue. About the centroid, both would smear hue and saturation together
 * and neither slider would be readable.
 *
 * Rotation is implemented as `theta -> theta + delta` at constant radius rather than as
 * a 2x2 matrix. Both are fine numerically; the polar form makes the invariant obvious in
 * the code and cannot silently pick up a mirror if a sign is wrong.
 *
 * D22 says the clamp applies to rotation as well. It cannot actually push a vertex out
 * of the disk, so there it is a no-op on valid input and cheap insurance against drift
 * accumulated over hundreds of drag frames.
 */
export function rotate(poly: Polygon, deltaDeg: number): Polygon {
  if (deltaDeg === 0) return poly

  return poly.map((p) => {
    const r = radiusOf(p.x, p.y)
    if (r === 0) return p
    return clampToDisk(polar(angleOf(p.x, p.y) + deltaDeg, r))
  })
}

/**
 * Scaling can push vertices past the rim, where D22 makes them stick — which is lossy.
 * That is why `size` is stored as a scalar in state and applied on read rather than
 * baked into the vertices: otherwise a vertex that hit the rim while the user dragged
 * the size slider up would not come back when they dragged it down, and the mask would
 * deform permanently during a single gesture. See state/types.ts.
 *
 * Negative factors would mirror the mask through the centre. The reducer clamps `size`
 * to a positive band, so that is not guarded again here.
 */
export function scale(poly: Polygon, factor: number): Polygon {
  if (factor === 1) return poly
  return poly.map((p) => clampToDisk({ x: p.x * factor, y: p.y * factor }))
}
