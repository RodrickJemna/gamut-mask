/**
 * Rotate and scale the mask about the wheel centre. Spec: F5, D22.
 *
 * F5 is the Gurney workflow: pick a mask shape, then swing it round the wheel and open or
 * close it. Rotation changes the hue family, scaling changes how muted the palette is.
 *
 * IMPLEMENT
 *
 *   rotate(poly: Polygon, deltaDeg: number): Polygon
 *   scale(poly: Polygon, factor: number): Polygon
 *
 * PIVOT. Both are about the **wheel centre (0,0)**, not the polygon's own centroid. That
 * is what makes the controls mean something in this model: rotating about the centre
 * moves the mask along the hue axis and leaves each vertex's radius alone, and scaling
 * about the centre moves every vertex along its own hue ray, so it changes saturation
 * without changing hue. About the centroid, both operations would smear hue and
 * saturation together and the sliders would stop being readable.
 *
 * Rotation therefore reduces to `theta -> theta + delta` at constant `t`. Implement it
 * that way rather than with a 2x2 matrix: it makes the invariant obvious, keeps the
 * radius exactly constant instead of drifting by float dust over hundreds of drag frames,
 * and cannot silently pick up a mirror.
 *
 * CLAMP AFTER BOTH (D22). Rotation cannot push a vertex out of the disk, but scaling up
 * can, so `scale` must run `clampToDisk` on every vertex. D22 says the clamp applies to
 * rotation too, so apply it in both for uniformity; in `rotate` it is a no-op on
 * already-valid input and cheap insurance against accumulated drift.
 *
 * SLIDER SEMANTICS — read before wiring `MaskPanel`. Both of these are absolute-state
 * sliders, and the clamp makes them lossy, so the two obvious implementations differ:
 *
 *   - applying a *delta* on every slider event means a vertex that hits the rim while
 *     scaling up does not come back when the user scales down again. The mask
 *     permanently deforms during a single drag of the size slider. This is the bug to
 *     avoid.
 *   - so keep the authoritative shape in state and derive the displayed polygon from it:
 *     `state.polygon` (the preset or hand-drawn base) plus `state.rotation` and
 *     `state.size` applied on read. Then the sliders are reversible, and the clamp only
 *     affects what is rendered.
 *
 * That is what `state/types.ts` is set up for — see the note there. It also means these
 * two functions are called during render, so keep them allocation-light and pure.
 *
 * TESTS -> transform.test.ts
 */
