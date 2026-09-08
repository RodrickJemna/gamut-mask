/**
 * Deterministic sampling of the colours inside the mask. Spec: D17, D25, F6.
 *
 * WHY DETERMINISTIC (D17). Random or Poisson-disc sampling re-rolls on every mask
 * movement, so the list below the wheel flickers and renumbers while the user drags a
 * slider. That makes it unusable for comparing two mask positions, which is the whole
 * point of the tool. So: a fixed grid, its pitch binary-searched to hit N, then 2-3 Lloyd
 * iterations to even out the spacing, then sorted by angle.
 *
 * IMPLEMENT
 *
 *   type Sample = {
 *     x: number; y: number       // wheel space
 *     theta: number; t: number   // polar, for the list columns
 *     rgb8: [number, number, number]
 *     oklabL: number
 *   }
 *
 *   sampleMask(poly: Polygon, n: number): Sample[]
 *
 * N is 12 by default, range 4-32 (D17). Result is sorted by `theta` ascending (D17).
 *
 * STEP 1 — grid. Lay a square grid over the polygon's bounding box and keep the points
 * that are inside the polygon (`containsPoint`, even-odd) and inside the disk.
 *
 * Anchor the grid to the **wheel origin**, not to the bounding box: snap the start to
 * `ceil(minX / pitch) * pitch`. Both choices are deterministic for identical input, so
 * both satisfy the spec, but origin-anchored is much calmer in the hand — as the mask
 * moves, points enter and leave at the edges while the ones in the middle stay put. A
 * bbox-anchored grid slides the entire set on every frame, which brings back most of the
 * flicker D17 is trying to remove.
 *
 * STEP 2 — binary search the pitch. Count scales roughly as `area / pitch^2`, so start
 * from `pitch0 = sqrt(area / n)` and bisect on pitch until the inside-count equals n, or
 * the bracket collapses. Two things to get right:
 *
 *   - The count is a *step* function of pitch, so an exact n may not exist for a given
 *     polygon. Cap the iterations (about 30) and take the largest count <= n rather than
 *     spinning. Then trim the surplus deterministically if a step overshot — drop from a
 *     fixed end of the ordered list, never at random.
 *   - Guard the search bounds. A thin sliver polygon can have positive area and hold no
 *     grid points at any reasonable pitch; do not let the pitch collapse toward zero
 *     chasing n (that is a hang, on the UI thread, during a drag).
 *
 * STEP 3 — Lloyd, 2-3 iterations (D17). Do it rasterised rather than with real Voronoi
 * cells: build a fixed fine grid over the polygon interior once (a few thousand cells),
 * assign each cell to its nearest sample, move each sample to the centroid of its cells.
 * Deterministic, no geometry library, no clipping of unbounded cells. A sample with an
 * empty cell set stays where it is. Break nearest-cell ties by lowest sample index so the
 * result cannot depend on iteration order. Run `clampToDisk`, and re-test containment
 * afterwards: a centroid can leave a non-convex polygon (D24), and such a sample must be
 * pushed back or left at its pre-iteration position — not silently kept outside, or the
 * list will show a colour the wash says is excluded.
 *
 * STEP 4 — colour each sample. `theta = angleOf(x,y)`, `t = radiusOf(x,y)`, then
 * `wheel.sample` / `sampleSrgb8`. Sort by `theta`.
 *
 * TOO SMALL A MASK (D25). If fewer than n samples fit, return fewer — this function does
 * not pad, does not fall back to random fill, and does not throw. `SampleList` displays
 * the actual count. Returning an empty array for a degenerate mask is valid.
 *
 * PERFORMANCE. This runs on every mask change, on the UI thread. The grid scan is
 * O(cells * vertices) and the Lloyd pass O(iterations * cells * n). With ~125k disk
 * pixels and n <= 32 that is fine, but keep the fine grid for step 3 at a fixed budget
 * rather than a fixed pitch, so a large mask cannot blow it up.
 *
 * TESTS -> sample.test.ts
 */
