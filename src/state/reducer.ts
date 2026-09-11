/**
 * The reducer. Spec: D14, D22, D23, D17, F2.
 *
 * Pure, and returns the SAME object when nothing changed, so a no-op drag frame does not
 * re-render or re-sample.
 */

import { DEFAULT_WHEEL, angleOf, polar, radiusOf, type Point } from '../color/wheel.ts'
import { centroid, clampPolygon, clampToDisk } from '../geom/polygon.ts'
import { rotate, scale, translate } from '../geom/transform.ts'
import { buildPreset, type PresetId } from '../mask/presets.ts'
import { BRANDS, type Brand } from '../paints/types.ts'
import type { Action, AppState } from './types.ts'

export const MIN_VERTICES = 3
/** Below this the mask is unusably small; above 1 every vertex would clamp to the rim. */
export const MIN_SIZE = 0.05
export const MAX_SIZE = 1

const DEFAULT_PRESET: PresetId = 'triad'

/**
 * The only brand matched on startup (D48, amended in 0.30).
 *
 * Every brand used to be on, which meant four paint lines under every colour before the
 * author had said which paints they own — a card 108 px tall and a list that scrolls,
 * mostly with bottles they cannot reach for. One brand is the honest default: the filter
 * is there to add the others.
 *
 * AK Interactive because it is the author's own shelf. Not derived from BRANDS[0] — that
 * it happens to be first is a coincidence of the order the catalogues were added, and
 * reordering them must not silently change which paints the app starts with.
 */
const DEFAULT_BRAND: Brand = 'AK'

export const initialState: AppState = {
  basePolygon: buildPreset('triad', 0),
  offset: { x: 0, y: 0 },
  enabledBrands: [DEFAULT_BRAND],
  wheel: DEFAULT_WHEEL,
  rotation: 0,
  size: 1,
  preset: DEFAULT_PRESET,
  dragging: null,
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * The mask as drawn: scale, then position, then rotation.
 *
 * ORDER MATTERS, and an earlier version had it wrong. It applied the offset BEFORE the
 * scale — `size * R(base + offset)` — so the displayed displacement was `size x offset`.
 * With the offset clamped to the unit disk, that meant a shrunken mask could only be
 * dragged a proportionally shorter way: at size 0.1 its centre reached radius 0.068 and
 * the rim was unreachable.
 *
 * Now `R(size * base + offset)`: the offset is applied after the scale, so how far the
 * mask can be moved no longer depends on how big it is. It stays INSIDE the rotation, so
 * rotating still carries an off-centre mask around the wheel rather than spinning it in
 * place (D42).
 *
 * Takes only the fields it needs rather than the whole AppState, so the caller can
 * memoise on exactly those and not recompute when an unrelated field like `dragging`
 * changes. AppState satisfies this structurally.
 */
export function displayPolygon(
  mask: Pick<AppState, 'basePolygon' | 'offset' | 'rotation' | 'size'>,
): Point[] {
  // Clamped ONCE, here, on the composed result. The transforms themselves are pure: see
  // the note at the top of geom/transform.ts for why clamping intermediates was wrong.
  return clampPolygon(
    rotate(translate(scale(mask.basePolygon, mask.size), mask.offset), mask.rotation),
  )
}

/**
 * Inverse of the display transform, for turning a dragged pointer position back into a
 * base-space vertex.
 *
 * The two steps commute, so their order is not load-bearing: rotation changes only the
 * angle and uniform scaling only the radius, both about the same centre. (An earlier
 * version of this comment claimed otherwise; the round-trip test disproved it, and
 * transform.test.ts already showed the forward pair commutes.)
 *
 * What is NOT invertible is the D22 clamp. Once a vertex is stuck on the rim its original
 * radius is gone and no inverse can recover it — which is exactly why rotation and size
 * are kept as scalars instead of being baked into the vertices.
 */
/** Undoes the rotation only. Shared by the point and vector inverses. */
function unrotate(p: Point, rotation: number): Point {
  const r = radiusOf(p.x, p.y)
  if (r === 0) return p
  return polar(angleOf(p.x, p.y) - rotation, r)
}

/**
 * Inverse of the display transform, for turning a dragged pointer position back into a
 * base-space vertex.
 *
 * Mirrors `displayPolygon` in reverse: undo the rotation, subtract the offset, undo the
 * scale.
 *
 * THE CLAMP IS APPLIED TO THE DISPLAY POINT, before unmapping — not to the base
 * coordinate afterwards. What D22 requires is that the vertex the user SEES stays inside
 * the disk; the stored coordinate is an internal representation and may sit outside it.
 *
 * Clamping the base instead confined a vertex to a disk of radius `size` centred on the
 * offset rather than to the wheel: at size 50% a vertex could only be dragged half way
 * across, at 30% barely a third, and with the mask also moved the limit went asymmetric
 * — 0.10 in one direction. That is the bug this shape of the function fixes.
 */
export function toBasePoint(p: Point, state: AppState): Point {
  const size = state.size === 0 ? MIN_SIZE : state.size
  const unrotated = unrotate(clampToDisk(p), state.rotation)
  return {
    x: (unrotated.x - state.offset.x) / size,
    y: (unrotated.y - state.offset.y) / size,
  }
}

/**
 * A display-space vector expressed in the offset's own frame: undo the rotation, and
 * nothing else.
 *
 * NOT divided by size, because the offset is applied after the scale. Dividing was the
 * bug that made a small mask undraggable to the rim.
 *
 * A vector, not a point — no offset is subtracted, because translating a difference does
 * not change it.
 */
function toOffsetVector(v: Point, state: AppState): Point {
  return unrotate(v, state.rotation)
}

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    /**
     * D23: replaces the polygon outright, no confirmation, even over a hand-drawn mask.
     *
     * It also resets rotation and size, which the spec does not spell out. A preset is
     * defined at its own orientation and scale, so carrying over a 200-degree rotation
     * would make the buttons look broken. Flagging it as a judgement call rather than a
     * requirement.
     */
    case 'loadPreset': {
      return {
        ...state,
        basePolygon: buildPreset(action.id, 0),
        offset: { x: 0, y: 0 },
        rotation: 0,
        size: 1,
        preset: action.id,
        dragging: null,
      }
    }

    /**
     * A new vertex must go BETWEEN two existing ones to keep the ring's shape (F2) —
     * appending at the end produces a spike that reads as a bug. The overlay supplies the
     * edge index it was clicked on.
     */
    case 'addVertex': {
      const at = toBasePoint(action.at, state)
      const next = [...state.basePolygon]
      next.splice(action.afterIndex + 1, 0, at)
      return { ...state, basePolygon: next, preset: null }
    }

    case 'moveVertex': {
      const { index } = action
      if (index < 0 || index >= state.basePolygon.length) return state
      const to = toBasePoint(action.to, state)
      if (samePoint(state.basePolygon[index], to)) return state
      const next = [...state.basePolygon]
      next[index] = to
      return { ...state, basePolygon: next, preset: null }
    }

    /** F2: never below 3 vertices. The guard lives here so no path can break it. */
    case 'deleteVertex': {
      if (state.basePolygon.length <= MIN_VERTICES) return state
      if (action.index < 0 || action.index >= state.basePolygon.length) return state
      return {
        ...state,
        basePolygon: state.basePolygon.filter((_, i) => i !== action.index),
        preset: null,
        dragging: null,
      }
    }

    /**
     * D42: dragging the mask body.
     *
     * What is clamped is WHERE THE MASK ENDS UP, not the offset itself. The displayed
     * centre is `size * baseCentroid + offset`, so clamping the offset alone made the
     * reachable positions a unit disk centred on `size * baseCentroid` — which is
     * off-centre for any shape whose own centre is, i.e. any reshaped mask. Measured on
     * a hand-mirrored triangle: the centre could be pushed to 0.82 rightwards but only
     * 0.60 leftwards. Clamping the placed centre instead makes every direction reach the
     * rim, and still stops the mask being flung off the wheel.
     */
    case 'dragMask': {
      const delta = toOffsetVector(action.deltaDisplay, state)
      const wanted = {
        x: action.offsetAtStart.x + delta.x,
        y: action.offsetAtStart.y + delta.y,
      }
      const base = centroid(state.basePolygon)
      const anchor = { x: base.x * state.size, y: base.y * state.size }
      const placed = clampToDisk({ x: anchor.x + wanted.x, y: anchor.y + wanted.y })
      const next = { x: placed.x - anchor.x, y: placed.y - anchor.y }
      if (samePoint(next, state.offset)) return state
      return { ...state, offset: next }
    }

    /**
     * D48: turn a brand's catalogue on or off.
     *
     * Kept in BRANDS order rather than in the order they were clicked, so the paint rows
     * do not reorder themselves as brands are toggled. Turning them all off is allowed —
     * see the note on `enabledBrands`.
     */
    case 'toggleBrand': {
      const on = state.enabledBrands.includes(action.brand)
      const next = BRANDS.filter((b) =>
        b === action.brand ? !on : state.enabledBrands.includes(b),
      )
      return { ...state, enabledBrands: next }
    }

    /**
     * D53: swap the wheel. Deliberately does NOT touch the mask, the rotation or the
     * size — the variants share the angle convention, so the shape you drew still means
     * the same hues and the same saturations on the new surface. Resetting it, the way
     * `loadPreset` does, would throw away work for no reason.
     */
    case 'setWheel':
      return state.wheel === action.id ? state : { ...state, wheel: action.id }

    case 'setRotation': {
      const deg = ((action.deg % 360) + 360) % 360
      return deg === state.rotation ? state : { ...state, rotation: deg }
    }

    case 'setSize': {
      const factor = clamp(action.factor, MIN_SIZE, MAX_SIZE)
      return factor === state.size ? state : { ...state, size: factor }
    }

    case 'beginDrag':
      return state.dragging === action.index ? state : { ...state, dragging: action.index }

    case 'endDrag':
      return state.dragging === null ? state : { ...state, dragging: null }
  }
}
