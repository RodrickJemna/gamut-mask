/**
 * Application state and actions. Spec: D18, D14, D8.
 *
 * D18: the state is JSON-serialisable in SHAPE, so that adding save/load later — the one
 * "later candidate" in section 7 — needs no refactor. Plain objects, arrays, numbers,
 * strings, booleans only: no Map, Set, Date, class instances or functions. There is no
 * persistence code in v1; this is about shape.
 *
 * D14: useReducer, no zustand. The state is small enough.
 */

import type { Point } from '../color/wheel.ts'
import type { PresetId } from '../mask/presets.ts'
import type { Brand } from '../paints/types.ts'

export type AppState = {
  /**
   * The UNTRANSFORMED mask, in wheel space, at least 3 vertices (F2).
   *
   * `rotation` and `size` are NOT baked into these coordinates — they are applied when
   * the polygon is read, by `displayPolygon`. The reason is that the D22 rim clamp is
   * lossy: if the size slider mutated the vertices, a vertex that hit the rim on the way
   * up would not come back on the way down, and the mask would deform permanently during
   * a single drag of one slider. Keeping the two as scalars makes both sliders
   * reversible and confines the clamp to the derived shape.
   *
   * The cost, stated plainly: "the polygon" now means two different things depending on
   * where you are, and the user drags vertices in DISPLAY space, so moveVertex has to map
   * the pointer position back through the inverse transform before storing it. That
   * unmapping is the fiddliest part of the reducer and has round-trip tests. (The order
   * of the inverse steps does not matter — rotation and uniform scaling about the same
   * centre commute.)
   */
  basePolygon: Point[]
  /**
   * Where the mask sits on the wheel, as an offset from the centre in base space (D42).
   *
   * A third scalar for the same reason rotation and size are scalars: the D22 clamp is
   * lossy, so translating the vertices themselves would let a mask dragged to the rim and
   * back come away permanently deformed.
   *
   * Applied BEFORE rotation and size, so rotating still swings an off-centre mask around
   * the wheel rather than spinning it in place.
   */
  offset: Point
  /** Degrees, normalised to [0,360) (F5). */
  rotation: number
  /** Scale factor about the wheel centre (F5). */
  size: number
  /**
   * Which paint brands to match against (D48). Held in BRANDS order.
   *
   * In state rather than as a component preference because it changes what the colour
   * list and both exports say, and because it is exactly the kind of thing a saved file
   * should carry (D18).
   *
   * May be empty: that means "do not match paint at all", which is a useful mode and is
   * distinct from "searched and found nothing".
   */
  enabledBrands: Brand[]
  /** Which preset produced basePolygon; null once hand-edited. Drives button state only. */
  preset: PresetId | null
  /**
   * Index of the vertex under the pointer, or null. UI-transient and would be excluded
   * from a saved file; it lives here rather than in component state only to avoid
   * threading pointer handlers through two levels for one number.
   */
  dragging: number | null
}

export type Action =
  | { type: 'loadPreset'; id: PresetId }
  | { type: 'addVertex'; at: Point; afterIndex: number }
  | { type: 'moveVertex'; index: number; to: Point }
  | { type: 'deleteVertex'; index: number }
  /**
   * Body drag. Carries the DISPLAY-space delta plus the offset the drag started from,
   * rather than accumulating deltas, so a dropped or duplicated move event cannot make
   * the mask drift away from the pointer.
   */
  | { type: 'dragMask'; deltaDisplay: Point; offsetAtStart: Point }
  | { type: 'toggleBrand'; brand: Brand }
  /**
   * `continuous` marks one frame of a slider drag, as opposed to a single deliberate
   * value. Undo/redo needs the distinction: a sweep must collapse into one step, while a
   * typed value and a snap are separate steps even though both set the same field. See
   * `mergeKeyOf` in state/history.ts.
   */
  | { type: 'setRotation'; deg: number; continuous?: boolean }
  | { type: 'setSize'; factor: number; continuous?: boolean }
  | { type: 'beginDrag'; index: number }
  | { type: 'endDrag' }

/**
 * Derived, never stored: the display polygon and the sample list. Both are pure functions
 * of the state above, memoised at the point of use. Storing either would create a second
 * source of truth for what the mask is.
 *
 * NOT in state, deliberately: no L or value field (D16), no paint selection (D11), no
 * image (D12), no export or view settings (D13), no route (D8), no theme. Each is either
 * a withdrawn decision or an explicit non-goal.
 */
