/**
 * The reducer. Spec: D14, D22, D23, D17, F2.
 *
 * Pure, and returns the SAME object when nothing changed, so a no-op drag frame does not
 * re-render or re-sample.
 */

import { angleOf, polar, radiusOf, type Point } from '../color/wheel.ts'
import { clampToDisk } from '../geom/polygon.ts'
import { rotate, scale } from '../geom/transform.ts'
import { buildPreset, type PresetId } from '../mask/presets.ts'
import type { Action, AppState } from './types.ts'

export const MIN_VERTICES = 3
export const MIN_SAMPLES = 4
export const MAX_SAMPLES = 32
/** Below this the mask is unusably small; above 1 every vertex would clamp to the rim. */
export const MIN_SIZE = 0.05
export const MAX_SIZE = 1

const DEFAULT_PRESET: PresetId = 'triad'

export const initialState: AppState = {
  basePolygon: buildPreset('triad', 0),
  rotation: 0,
  size: 1,
  sampleCount: 12,
  preset: DEFAULT_PRESET,
  dragging: null,
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * The mask as drawn: rotation then size, both about the wheel centre (F5).
 *
 * Takes only the three fields it needs rather than the whole AppState, so the caller can
 * memoise on exactly those and not recompute when an unrelated field like `dragging`
 * changes. AppState satisfies this structurally.
 */
export function displayPolygon(
  mask: Pick<AppState, 'basePolygon' | 'rotation' | 'size'>,
): Point[] {
  return scale(rotate(mask.basePolygon, mask.rotation), mask.size)
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
export function toBasePoint(p: Point, state: AppState): Point {
  const size = state.size === 0 ? MIN_SIZE : state.size
  const unscaled = { x: p.x / size, y: p.y / size }
  const r = radiusOf(unscaled.x, unscaled.y)
  if (r === 0) return clampToDisk(unscaled)
  return clampToDisk(polar(angleOf(unscaled.x, unscaled.y) - state.rotation, r))
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
      if (action.id === 'atmospheric') return state // not defined yet; see mask/presets.ts
      return {
        ...state,
        basePolygon: buildPreset(action.id, 0),
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

    case 'setRotation': {
      const deg = ((action.deg % 360) + 360) % 360
      return deg === state.rotation ? state : { ...state, rotation: deg }
    }

    case 'setSize': {
      const factor = clamp(action.factor, MIN_SIZE, MAX_SIZE)
      return factor === state.size ? state : { ...state, size: factor }
    }

    case 'setSampleCount': {
      const n = Math.round(clamp(action.n, MIN_SAMPLES, MAX_SAMPLES))
      return n === state.sampleCount ? state : { ...state, sampleCount: n }
    }

    case 'beginDrag':
      return state.dragging === action.index ? state : { ...state, dragging: action.index }

    case 'endDrag':
      return state.dragging === null ? state : { ...state, dragging: null }
  }
}
