/**
 * Polygon primitives in wheel space. Spec: D22, D24, F2.
 *
 * All coordinates are wheel space (see `docs/implementation-plan.md` section 2): centre
 * origin, radius 1, y down.
 *
 * IMPLEMENT
 *
 *   type Point = { x: number; y: number }
 *   type Polygon = Point[]            // open ring: last vertex implicitly joins the first
 *
 *   containsPoint(poly: Polygon, p: Point): boolean    // even-odd, D24
 *   clampToDisk(p: Point): Point                       // D22
 *   clampPolygon(poly: Polygon): Polygon
 *   signedArea(poly: Polygon): number                  // shoelace, sign = winding
 *   centroid(poly: Polygon): Point                     // area centroid, not vertex mean
 *   bounds(poly: Polygon): { minX, minY, maxX, maxY }
 *
 * Store rings **open** — do not repeat the first vertex at the end. Every function here
 * closes the ring itself by taking indices modulo length. Mixed conventions in the same
 * codebase are a reliable source of off-by-one bugs in the hit test.
 *
 * EVEN-ODD (D24). Non-convex polygons are allowed and self-intersection is explicitly not
 * forbidden, so the fill rule is even-odd, and it must be the same rule the SVG uses
 * (`fill-rule="evenodd"` in `MaskOverlay`) and the same rule the sampler uses. Three
 * places, one rule; if they disagree, the list shows colours the user cannot see shaded.
 *
 * Use the standard crossing-number test: for each edge (a,b), count a crossing when
 * `(a.y > p.y) !== (b.y > p.y)` and `p.x < a.x + (p.y - a.y) / (b.y - a.y) * (b.x - a.x)`;
 * inside iff the count is odd. That `!==` comparison is what makes vertices on the ray
 * count once instead of twice — do not "improve" it into `>=`. Behaviour exactly on an
 * edge is undefined and does not matter here; do not add an epsilon to chase it.
 *
 * CLAMP (D22). Vertices may not leave the disk; they stick to the boundary. So clamping
 * is a radial projection, not an axis-wise clamp: if `hypot(x,y) > 1`, scale both
 * components by `1 / hypot(x,y)`. An axis-wise clamp would let a vertex sit at (1,1),
 * outside the disk. This applies to dragging *and* to rotation and scaling (D22), which
 * is why `transform.ts` calls it too.
 *
 * Sticking is genuinely lossy: drag a vertex past the rim and back, and it does not
 * return to where it was, because the original radius is gone. That is what D22 asks for.
 * Do not add a shadow copy of the unclamped position to make it reversible.
 *
 * `signedArea` and `centroid` exist for the sampler (`sample.ts`) and for the rotate/scale
 * pivot question in `transform.ts`. Both are shoelace-based; `centroid` divides by
 * `6 * signedArea` and so needs a guard for a degenerate (zero-area) ring — fall back to
 * the vertex mean there.
 *
 * Minimum 3 vertices (F2) is a state-level invariant, enforced in `reducer.ts`, not here.
 * These functions should behave sanely on 0-2 points rather than throwing.
 *
 * TESTS -> polygon.test.ts
 */
