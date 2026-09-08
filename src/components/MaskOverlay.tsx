/**
 * SVG overlay on top of the wheel: the outside-mask wash, the mask polygon, its vertex
 * handles, and the six anchor rays. Spec: F2, F3, D4, D22, D24, D28, D34.
 *
 * This is the most involved component in the app. Everything else is a slider or a list.
 *
 * IMPLEMENT
 *
 *   function MaskOverlay(props: {
 *     polygon: Point[]          // DISPLAY polygon (rotation and size already applied)
 *     dragging: number | null
 *     dispatch: (a: Action) => void
 *   }): JSX.Element
 *
 * COORDINATES — the trick that makes this file short. Set `viewBox="-1 -1 2 2"` on the
 * <svg>. Wheel space then *is* SVG user space: a vertex at `{x: 0.5, y: -0.3}` is written
 * as `cx="0.5" cy="-0.3"` with no conversion, at any rendered size. See
 * `docs/implementation-plan.md` section 2.
 *
 * Two consequences to handle:
 *
 *   - The viewBox is 2 units across, so `stroke-width="1"` would be half the disk. Put
 *     `vector-effect="non-scaling-stroke"` on every stroked element and give widths in
 *     px; strokes then stay hairline-crisp at any size. Same for handle radii — those do
 *     scale, so either set them in units (~0.02) and accept that they grow with the
 *     wheel, or size them in px via a computed unit value. Units are fine here.
 *   - Pointer events arrive in client px. Convert once, with the SVG's own matrix:
 *     make a `DOMPoint` from `event.clientX/clientY` and run
 *     `pt.matrixTransform(svg.getScreenCTM()!.inverse())`. Do not compute it from
 *     `getBoundingClientRect()` — that breaks under any CSS transform and needs manual
 *     dpr handling. This one helper is the only pixel-aware code in the file.
 *
 * DRAW ORDER, bottom to top. In SVG, later siblings paint on top; there is no z-index.
 *
 *   1. THE WASH (D28). Outside the mask is dimmed, not cut away, so the user keeps the
 *      surrounding hues as reference. One <path> with `fill-rule="evenodd"` containing
 *      two subpaths: the full disk, then the mask polygon. Even-odd makes the polygon a
 *      hole, so the fill covers disk-minus-mask exactly. Fill it black at low opacity
 *      (start around 0.55 and tune by eye).
 *
 *      Write the disk subpath as two arcs — `M -1 0 A 1 1 0 0 1 1 0 A 1 1 0 0 1 -1 0 Z`
 *      — because a single 360 deg arc is degenerate and renders as nothing. Note this
 *      must be the same even-odd rule the hit test and the sampler use (D24), or the
 *      shading and the list will disagree.
 *
 *   2. ANCHOR RAYS AND LETTERS (F3, D34). Six lines from centre to rim at 0/60/.../300,
 *      each with its letter just outside the disk. Always drawn, not hideable (F3).
 *      Place letters at radius ~1.08 with `text-anchor="middle"` and
 *      `dominant-baseline="middle"`, so they sit in the neutral margin the spec asks for
 *      (section 6). Font size must be a unit value here (~0.07) or the text will render
 *      at 1/2-disk height. `pointer-events="none"` on this whole group — it is a scale,
 *      not a control, and it must never swallow a click meant for a handle. Static, so
 *      compute the six positions once at module level.
 *
 *   3. THE MASK OUTLINE. The polygon stroked, unfilled (the wash already handles fill).
 *      Light stroke so it reads against every hue underneath.
 *
 *   4. EDGE HIT TARGETS. Invisible thick-stroked lines over each edge, for adding a
 *      vertex. `stroke="transparent"` with a generous `stroke-width` and
 *      `pointer-events="stroke"`. Each one dispatches `addVertex` with its own index, so
 *      the new vertex lands between the right pair (see the note in `state/reducer.ts`).
 *
 *   5. VERTEX HANDLES, last so they win every overlapping click. A <circle> per vertex.
 *
 * INTERACTION (F2: add / delete / drag, min 3 points)
 *
 *   - Use **pointer events**, not mouse events: `onPointerDown` on the handle, and
 *     `handle.setPointerCapture(e.pointerId)`. Capture is what makes the drag keep
 *     working when the pointer leaves the element or the window — the alternative is
 *     attaching window listeners in an effect and cleaning them up, which is more code
 *     and easier to leak. Then `onPointerMove` dispatches `moveVertex`, and
 *     `onPointerUp` dispatches `endDrag`.
 *   - `touch-action: none` in CSS on the SVG, or a touch drag will scroll the page
 *     instead. (Not mobile support — that is a non-goal — just correct pointer handling.)
 *   - Delete: right-click with `preventDefault`, or alt-click. Pick one and be consistent.
 *     The reducer no-ops at 3 vertices (F2); reflect that by dimming the handles there.
 *   - The clamp (D22) belongs in the reducer, not here. Send raw positions; state decides.
 *   - The incoming `polygon` is the *display* polygon, but `moveVertex` stores base
 *     coordinates. The reducer does that unmapping — this component must not
 *     pre-transform, or the correction gets applied twice.
 *
 * PERFORMANCE. A pointermove per frame re-renders this component and re-runs sampling.
 * With <= 32 samples and a handful of vertices that is fine; if it is not, the fix is to
 * memoise the sample list on the rounded polygon, not to move drawing to canvas.
 *
 * No test file — CLAUDE.md: no UI tests.
 */
