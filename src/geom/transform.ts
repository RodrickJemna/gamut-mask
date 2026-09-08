/**
 * Rotate and scale the mask about the wheel centre. Spec: F5, D22.
 *
 * F5 is the Gurney workflow: choose a mask shape, then swing it round the wheel and open
 * or close it. Rotation changes the hue family, scaling changes how muted the palette is.
 */

import { angleOf, polar, radiusOf, type Point } from '../color/wheel.ts'
import type { Polygon } from './polygon.ts'

/**
 * THESE ARE PURE TRANSFORMS: none of them clamps to the disk.
 *
 * They used to, on the reasoning that D22 applies to every transform. That is wrong for
 * a composed pipeline. `displayPolygon` applies all three in sequence, and clamping an
 * INTERMEDIATE result discards information the later steps need: a vertex whose final
 * position is comfortably inside the disk can have a mid-pipeline position outside it,
 * and clamping there moved the vertex somewhere the user never asked for. D22 is applied
 * once, at the end of the pipeline, where "the vertex the user sees" actually exists.
 *
 * PIVOT — rotate and scale are about the wheel centre (0,0), never the polygon's own
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
 * Rotation preserves radius, so it can never move a vertex across the rim in any case.
 */
export function rotate(poly: Polygon, deltaDeg: number): Polygon {
  if (deltaDeg === 0) return poly

  return poly.map((p) => {
    const r = radiusOf(p.x, p.y)
    if (r === 0) return p
    return polar(angleOf(p.x, p.y) + deltaDeg, r)
  })
}

/**
 * Move the whole mask by an offset (F5b, D42).
 *
 * Unlike rotate and scale this has no pivot — it is a plain translation, and it is the
 * one transform that does NOT preserve the "radius is saturation, angle is hue" reading
 * of a vertex's position. That is the point: the user is positioning the mask over the
 * wheel by eye.
 *
 * Pure, like the others — `displayPolygon` clamps the composed result.
 */
export function translate(poly: Polygon, offset: Point): Polygon {
  if (offset.x === 0 && offset.y === 0) return poly
  return poly.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }))
}

/**
 * Scaling can push vertices past the rim, where the pipeline's final clamp makes them
 * stick — which is lossy. That is why `size` is stored as a scalar in state and applied
 * on read rather than baked into the vertices: otherwise a vertex that hit the rim while
 * the user dragged the size slider up would not come back when they dragged it down, and
 * the mask would deform permanently during a single gesture. See state/types.ts.
 *
 * Negative factors would mirror the mask through the centre. The reducer clamps `size`
 * to a positive band, so that is not guarded again here.
 */
export function scale(poly: Polygon, factor: number): Polygon {
  if (factor === 1) return poly
  return poly.map((p) => ({ x: p.x * factor, y: p.y * factor }))
}
