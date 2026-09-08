/**
 * Application state and actions. Spec: D18, D14, D8.
 *
 * D18: the state must be **JSON-serialisable in shape**, so that adding save/load later
 * (the one named "later candidate" in section 7) needs no refactor. In practice: plain
 * objects, arrays, numbers, strings, booleans. No `Map`, `Set`, `Date`, class instances,
 * functions, or `undefined`-as-a-value. There is no persistence code in v1 — this is
 * about shape only.
 *
 * D14: `useReducer`, no zustand. The state is small enough.
 *
 * IMPLEMENT
 *
 *   type AppState = {
 *     polygon: Point[]        // BASE shape, wheel space, >= 3 vertices (F2)
 *     rotation: number        // degrees, applied on read (F5)
 *     size: number            // scale factor, applied on read (F5)
 *     sampleCount: number     // N, default 12, range 4-32 (D17)
 *     preset: PresetId | null // which preset produced `polygon`, null once hand-edited
 *     dragging: number | null // index of the vertex under the pointer, or null
 *   }
 *
 *   type Action =
 *     | { type: 'loadPreset'; id: PresetId }
 *     | { type: 'addVertex'; at: Point; afterIndex: number }
 *     | { type: 'moveVertex'; index: number; to: Point }
 *     | { type: 'deleteVertex'; index: number }
 *     | { type: 'setRotation'; deg: number }
 *     | { type: 'setSize'; factor: number }
 *     | { type: 'setSampleCount'; n: number }
 *     | { type: 'beginDrag'; index: number }
 *     | { type: 'endDrag' }
 *
 * BASE SHAPE VS DISPLAYED SHAPE — the important decision here. `polygon` holds the
 * untransformed shape; `rotation` and `size` are stored as numbers and applied when the
 * polygon is read for rendering and sampling. They are not baked into the vertices.
 *
 * The reason is the D22 clamp: it is lossy. If the size slider mutated the vertices, a
 * vertex that hit the rim on the way up would not come back on the way down, and the mask
 * would deform during a single slider drag. Keeping rotation and size as separate scalars
 * makes both sliders reversible, and confines the clamp to the derived shape. See the
 * slider note in `geom/transform.ts`.
 *
 * The cost, stated: "the polygon" now means two different things depending on where you
 * are, and vertex dragging happens in *displayed* space, so `moveVertex` has to map the
 * pointer position back through the inverse transform before storing it. Name things so
 * that stays visible — `basePolygon` in state, `displayPolygon` for the derived one.
 *
 * `dragging` is UI-transient and does not belong in a saved file, but keeping it here
 * rather than in component state avoids threading pointer handlers through two levels for
 * one number. Note it as excluded when save/load arrives.
 *
 * Derived, never stored: the displayed polygon, and the sample list. Both are pure
 * functions of the state above and should be computed in `App.tsx` with `useMemo`.
 * Storing them would mean two sources of truth for what the mask is.
 *
 * NOT IN STATE, deliberately: no L or value field (D16), no paint selection (D11), no
 * image (D12), no export or view settings (D13), no route (D8), no theme. All withdrawn
 * or non-goals.
 */
