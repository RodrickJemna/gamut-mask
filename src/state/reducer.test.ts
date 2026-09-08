import { describe, expect, it } from 'vitest'
import { polar, radiusOf } from '../color/wheel.ts'
import { centroid } from '../geom/polygon.ts'
import { buildPreset } from '../mask/presets.ts'
import { BRANDS } from '../paints/types.ts'
import {
  MAX_SIZE,
  MIN_SIZE,
  MIN_VERTICES,
  displayPolygon,
  initialState,
  reducer,
  toBasePoint,
} from './reducer.ts'
import type { AppState } from './types.ts'

/**
 * Not a UI test — no React, no DOM. What is under test is the display/base coordinate
 * round trip, which is geometry, and the invariants the reducer is the sole guardian of.
 *
 * The round trip is here because moveVertex receives DISPLAY coordinates and has to store
 * BASE ones, so an error there puts vertices somewhere other than under the pointer.
 *
 * Note what this suite disproved: an earlier version of toBasePoint's comment claimed the
 * order of the two inverse steps mattered. It does not. Rotation and uniform scaling about
 * the same centre commute — rotation touches only the angle, scaling only the radius — so
 * both orders agree to 4e-16. transform.test.ts had already shown the forward pair
 * commutes. What actually breaks invertibility is the D22 clamp, not the ordering.
 */

const withState = (over: Partial<AppState>): AppState => ({ ...initialState, ...over })

describe('display / base round trip', () => {
  it('is the identity at rotation 0 and size 1', () => {
    const p = { x: 0.3, y: -0.45 }
    const back = toBasePoint(p, withState({}))
    expect(back.x).toBeCloseTo(p.x, 12)
    expect(back.y).toBeCloseTo(p.y, 12)
  })

  it('inverts the display transform for every rotation and size', () => {
    for (const rotation of [0, 17, 90, 180, 271, 359]) {
      for (const size of [0.2, 0.5, 0.8, 1]) {
        const state = withState({ basePolygon: [polar(33, 0.5)], rotation, size })
        const shown = displayPolygon(state)[0]
        const back = toBasePoint(shown, state)
        expect(back.x).toBeCloseTo(state.basePolygon[0].x, 9)
        expect(back.y).toBeCloseTo(state.basePolygon[0].y, 9)
      }
    }
  })

  /**
   * D22 constrains what the user SEES, not the stored coordinate. Clamping the base
   * instead confined a vertex drag to a disk of radius `size` around the offset: at size
   * 50% a vertex could only be dragged half way across the wheel, and with the mask also
   * moved the limit went asymmetric — 0.10 in one direction.
   */
  it('lets a vertex be dragged anywhere on the disk, at any size, offset and rotation', () => {
    const targets = [
      { x: -1, y: 0 }, { x: 0, y: 0.95 }, { x: 0.95, y: 0 }, { x: -0.6, y: -0.6 },
    ]
    for (const rotation of [0, 90, 214]) {
      for (const size of [1, 0.5, 0.3, 0.06]) {
        for (const offset of [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: -0.3, y: 0.4 }]) {
          const state = withState({ rotation, size, offset })
          for (const target of targets) {
            const next = reducer(state, { type: 'moveVertex', index: 0, to: target })
            const shown = displayPolygon(next)[0]
            expect(shown.x).toBeCloseTo(target.x, 6)
            expect(shown.y).toBeCloseTo(target.y, 6)
          }
        }
      }
    }
  })

  it('still keeps every DRAWN vertex inside the disk (D22)', () => {
    const state = withState({ rotation: 45, size: 0.1, offset: { x: 0.4, y: 0.2 } })
    const next = reducer(state, { type: 'moveVertex', index: 0, to: { x: 4, y: 4 } })
    for (const p of displayPolygon(next)) {
      expect(radiusOf(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('scaling a mask up past the rim is lossy, which is why size is a scalar', () => {
    // The information is lost by the pipeline's final clamp, not by the transforms.
    const big = withState({ basePolygon: [polar(0, 0.9), polar(120, 0.9), polar(240, 0.9)] })
    const grown = displayPolygon({ ...big, size: 1 })
    const clamped = displayPolygon({ ...big, size: 2 })
    expect(clamped.every((p) => radiusOf(p.x, p.y) <= 1 + 1e-9)).toBe(true)
    expect(Math.max(...clamped.map((p, i) => Math.hypot(p.x - grown[i].x, p.y - grown[i].y))))
      .toBeGreaterThan(0.05)
  })
})

describe('moveVertex', () => {
  it('stores base coordinates, so the vertex lands where the pointer is', () => {
    const state = withState({ rotation: 120, size: 0.6 })
    const target = { x: 0.2, y: -0.3 }
    const next = reducer(state, { type: 'moveVertex', index: 0, to: target })
    const shown = displayPolygon(next)[0]
    expect(shown.x).toBeCloseTo(target.x, 9)
    expect(shown.y).toBeCloseTo(target.y, 9)
  })

  it('returns the same state object when the vertex would not move', () => {
    const first = reducer(initialState, { type: 'moveVertex', index: 0, to: { x: 0.1, y: 0.2 } })
    const again = reducer(first, { type: 'moveVertex', index: 0, to: { x: 0.1, y: 0.2 } })
    expect(again).toBe(first)
  })

  it('ignores an out-of-range index', () => {
    expect(reducer(initialState, { type: 'moveVertex', index: 99, to: { x: 0, y: 0 } }))
      .toBe(initialState)
  })

  it('clears the preset marker, since the shape is no longer that preset', () => {
    const next = reducer(initialState, { type: 'moveVertex', index: 0, to: { x: 0.1, y: 0.1 } })
    expect(next.preset).toBeNull()
  })
})

describe('vertex add and delete (F2)', () => {
  it('inserts after the given edge index rather than appending', () => {
    const next = reducer(initialState, { type: 'addVertex', at: { x: 0, y: 0 }, afterIndex: 0 })
    expect(next.basePolygon).toHaveLength(initialState.basePolygon.length + 1)
    expect(next.basePolygon[1].x).toBeCloseTo(0, 12)
    expect(next.basePolygon[1].y).toBeCloseTo(0, 12)
    expect(next.basePolygon[0]).toBe(initialState.basePolygon[0])
  })

  it('refuses to go below three vertices', () => {
    let state = withState({ basePolygon: buildPreset('triad', 0) })
    expect(state.basePolygon).toHaveLength(MIN_VERTICES)
    state = reducer(state, { type: 'deleteVertex', index: 0 })
    expect(state.basePolygon).toHaveLength(MIN_VERTICES)
  })

  it('deletes when there are more than three', () => {
    const four = withState({
      basePolygon: [polar(0, 0.5), polar(90, 0.5), polar(180, 0.5), polar(270, 0.5)],
    })
    expect(reducer(four, { type: 'deleteVertex', index: 2 }).basePolygon).toHaveLength(3)
  })
})

describe('presets (D23)', () => {
  it('replaces the polygon and resets rotation and size', () => {
    const edited = withState({ rotation: 200, size: 0.3, preset: null })
    const next = reducer(edited, { type: 'loadPreset', id: 'split' })
    expect(next.rotation).toBe(0)
    expect(next.size).toBe(1)
    expect(next.preset).toBe('split')
    expect(next.basePolygon).toEqual(buildPreset('split', 0))
  })

  it('overwrites a hand-drawn mask without asking', () => {
    const hand = reducer(initialState, { type: 'moveVertex', index: 0, to: { x: 0.05, y: 0.05 } })
    expect(reducer(hand, { type: 'loadPreset', id: 'triad' }).basePolygon)
      .toEqual(buildPreset('triad', 0))
  })

  it('loads the atmospheric preset (D38)', () => {
    const next = reducer(initialState, { type: 'loadPreset', id: 'atmospheric' })
    expect(next.preset).toBe('atmospheric')
    expect(next.basePolygon).toEqual(buildPreset('atmospheric', 0))
  })
})

describe('slider clamps', () => {
  it('normalises rotation into [0,360)', () => {
    expect(reducer(initialState, { type: 'setRotation', deg: 450 }).rotation).toBe(90)
    expect(reducer(initialState, { type: 'setRotation', deg: -90 }).rotation).toBe(270)
  })

  it('clamps size to its band', () => {
    expect(reducer(initialState, { type: 'setSize', factor: 5 }).size).toBe(MAX_SIZE)
    expect(reducer(initialState, { type: 'setSize', factor: -1 }).size).toBe(MIN_SIZE)
  })

  it('returns the same object when a slider does not actually change', () => {
    expect(reducer(initialState, { type: 'setRotation', deg: 0 })).toBe(initialState)
    expect(reducer(initialState, { type: 'setSize', factor: 1 })).toBe(initialState)
  })
})

describe('brand filter (D48)', () => {
  it('starts with every brand enabled', () => {
    expect(initialState.enabledBrands).toEqual([...BRANDS])
  })

  it('toggles a brand off and back on', () => {
    const off = reducer(initialState, { type: 'toggleBrand', brand: BRANDS[0] })
    expect(off.enabledBrands).not.toContain(BRANDS[0])
    const on = reducer(off, { type: 'toggleBrand', brand: BRANDS[0] })
    expect(on.enabledBrands).toEqual([...BRANDS])
  })

  it('keeps BRANDS order, so paint rows do not reshuffle as brands are toggled', () => {
    let st = initialState
    for (const brand of BRANDS) st = reducer(st, { type: 'toggleBrand', brand })
    for (const brand of [...BRANDS].reverse()) {
      st = reducer(st, { type: 'toggleBrand', brand })
    }
    expect(st.enabledBrands).toEqual([...BRANDS])
  })

  it('allows every brand to be turned off', () => {
    let st = initialState
    for (const brand of BRANDS) st = reducer(st, { type: 'toggleBrand', brand })
    expect(st.enabledBrands).toEqual([])
  })

  it('leaves the mask untouched', () => {
    const toggled = reducer(initialState, { type: 'toggleBrand', brand: BRANDS[0] })
    expect(toggled.basePolygon).toBe(initialState.basePolygon)
    expect(toggled.preset).toBe(initialState.preset)
  })
})

describe('state shape (D18)', () => {
  it('survives a JSON round trip unchanged', () => {
    const state = reducer(initialState, { type: 'setRotation', deg: 137 })
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  /**
   * Checks for the things that actually break serialisation, recursively. The earlier
   * version enumerated allowed types at the top level only and rejected plain objects,
   * so adding `offset: {x, y}` failed it — despite that being perfectly JSON-safe.
   */
  it('contains no value that JSON cannot represent', () => {
    const unsafe = (value: unknown, path: string): string[] => {
      if (value === null) return []
      if (value === undefined) return [`${path}: undefined`]
      if (typeof value === 'function') return [`${path}: function`]
      if (value instanceof Date) return [`${path}: Date`]
      if (value instanceof Map || value instanceof Set) return [`${path}: Map/Set`]
      if (typeof value === 'number') {
        return Number.isFinite(value) ? [] : [`${path}: non-finite number`]
      }
      if (typeof value === 'string' || typeof value === 'boolean') return []
      if (Array.isArray(value)) {
        return value.flatMap((v, i) => unsafe(v, `${path}[${i}]`))
      }
      if (typeof value === 'object') {
        if (Object.getPrototypeOf(value) !== Object.prototype) {
          return [`${path}: class instance`]
        }
        return Object.entries(value).flatMap(([k, v]) => unsafe(v, `${path}.${k}`))
      }
      return [`${path}: ${typeof value}`]
    }
    expect(unsafe(initialState, 'state')).toEqual([])
  })
})

describe('mask body drag (D42)', () => {
  /**
   * A small mask, deliberately. The default triad's vertices sit at radius 0.82, so any
   * meaningful drag pushes some of them past the rim and D22 clamps — which is correct,
   * and is asserted separately below. Here the point is that an unobstructed drag moves
   * the mask by exactly the delta.
   */
  const small = withState({
    basePolygon: [polar(0, 0.3), polar(120, 0.3), polar(240, 0.3)],
  })

  it('moves the mask by the dragged delta at rotation 0, size 1', () => {
    const before = displayPolygon(small)
    const next = reducer(small, {
      type: 'dragMask',
      deltaDisplay: { x: 0.1, y: -0.2 },
      offsetAtStart: { x: 0, y: 0 },
    })
    const after = displayPolygon(next)
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i].x + 0.1, 9)
      expect(p.y).toBeCloseTo(before[i].y - 0.2, 9)
    })
  })

  it('stops at the rim rather than sliding vertices off the disk (D22)', () => {
    const next = reducer(initialState, {
      type: 'dragMask',
      deltaDisplay: { x: 0.1, y: -0.2 },
      offsetAtStart: { x: 0, y: 0 },
    })
    const after = displayPolygon(next)
    for (const p of after) expect(radiusOf(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-12)
    // At least one vertex of the default triad is held back by the clamp.
    expect(after.some((p) => radiusOf(p.x, p.y) > 1 - 1e-9)).toBe(true)
  })

  /**
   * The delta arrives in DISPLAY space but is stored in base space, so it has to be
   * un-rotated and un-scaled. If that conversion is missing or inverted, the mask slides
   * off at an angle to the pointer the moment either slider leaves its default — which is
   * the failure a user would notice first.
   */
  it('tracks the pointer under any rotation and size', () => {
    for (const rotation of [0, 37, 90, 214, 300]) {
      for (const size of [0.3, 0.6, 1]) {
        const state = { ...small, rotation, size }
        const before = displayPolygon(state)
        const delta = { x: 0.03, y: -0.02 }
        const next = reducer(state, {
          type: 'dragMask',
          deltaDisplay: delta,
          offsetAtStart: state.offset,
        })
        const after = displayPolygon(next)
        after.forEach((p, i) => {
          expect(p.x).toBeCloseTo(before[i].x + delta.x, 6)
          expect(p.y).toBeCloseTo(before[i].y + delta.y, 6)
        })
      }
    }
  })

  it('is reversible — dragging out and back restores the shape', () => {
    const out = reducer(small, {
      type: 'dragMask',
      deltaDisplay: { x: 0.3, y: 0.2 },
      offsetAtStart: { x: 0, y: 0 },
    })
    const back = reducer(out, {
      type: 'dragMask',
      deltaDisplay: { x: 0, y: 0 },
      offsetAtStart: { x: 0, y: 0 },
    })
    expect(back.offset).toEqual({ x: 0, y: 0 })
    // Exact, even though the outward drag clamped vertices — the clamp only ever touched
    // the derived shape, never the stored polygon. That is what offset-as-a-scalar buys.
    displayPolygon(back).forEach((p, i) => {
      expect(p.x).toBeCloseTo(displayPolygon(small)[i].x, 12)
      expect(p.y).toBeCloseTo(displayPolygon(small)[i].y, 12)
    })
  })

  it('clamps the offset to the disk, so the mask cannot be flung away', () => {
    const next = reducer(initialState, {
      type: 'dragMask',
      deltaDisplay: { x: 50, y: 50 },
      offsetAtStart: { x: 0, y: 0 },
    })
    expect(radiusOf(next.offset.x, next.offset.y)).toBeLessThanOrEqual(1 + 1e-12)
    for (const p of displayPolygon(next)) {
      expect(radiusOf(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-12)
    }
  })

  it('is absolute, not cumulative — a repeated delta does not drift', () => {
    const once = reducer(initialState, {
      type: 'dragMask',
      deltaDisplay: { x: 0.12, y: 0.03 },
      offsetAtStart: { x: 0, y: 0 },
    })
    const twice = reducer(once, {
      type: 'dragMask',
      deltaDisplay: { x: 0.12, y: 0.03 },
      offsetAtStart: { x: 0, y: 0 },
    })
    expect(twice).toBe(once)
  })

  it('keeps vertex dragging accurate once the mask has been moved', () => {
    const moved = reducer(initialState, {
      type: 'dragMask',
      deltaDisplay: { x: 0.2, y: -0.15 },
      offsetAtStart: { x: 0, y: 0 },
    })
    const target = { x: -0.3, y: 0.25 }
    const next = reducer(moved, { type: 'moveVertex', index: 0, to: target })
    const shown = displayPolygon(next)[0]
    expect(shown.x).toBeCloseTo(target.x, 9)
    expect(shown.y).toBeCloseTo(target.y, 9)
  })

  /**
   * Regression for a reported bug, and for a hole in this suite.
   *
   * The offset used to be applied BEFORE the scale, so the displayed displacement was
   * `size x offset`. With the offset clamped to the unit disk, a shrunken mask could only
   * be dragged proportionally less far: at size 0.1 its centre reached radius 0.068 and
   * the rim was simply unreachable.
   *
   * The existing "tracks the pointer" test did not catch it because it used a delta small
   * enough never to reach the clamp, where the divide-then-multiply cancelled out
   * exactly. What was missing was a test of REACH, not of tracking.
   */
  it('can position the mask anywhere on the disk, at any size', () => {
    const reach = (size: number) => {
      let st = reducer(small, { type: 'setSize', factor: size })
      st = reducer(st, {
        type: 'dragMask',
        deltaDisplay: { x: 5, y: 0 },
        offsetAtStart: { x: 0, y: 0 },
      })
      const c = centroid(displayPolygon(st))
      return radiusOf(c.x, c.y)
    }
    // A small mask must be placeable right out at the rim.
    for (const size of [0.5, 0.3, 0.1]) {
      expect(reach(size)).toBeGreaterThan(0.8)
    }
    // And reach must not shrink as the mask shrinks — that was the bug exactly.
    expect(reach(0.1)).toBeGreaterThanOrEqual(reach(0.5) - 1e-9)
    expect(reach(0.5)).toBeGreaterThanOrEqual(reach(1) - 1e-9)
  })

  /**
   * The property the new ordering buys: the offset is no longer scaled, so changing size
   * resizes the mask in place instead of dragging it back toward the centre.
   */
  it('keeps a positioned mask where it is when the size changes', () => {
    const placed = reducer(small, {
      type: 'dragMask',
      deltaDisplay: { x: 0.5, y: -0.3 },
      offsetAtStart: { x: 0, y: 0 },
    })
    const before = centroid(displayPolygon(placed))
    for (const size of [0.5, 0.2, 0.9]) {
      const resized = reducer(placed, { type: 'setSize', factor: size })
      const after = centroid(displayPolygon(resized))
      expect(after.x).toBeCloseTo(before.x, 6)
      expect(after.y).toBeCloseTo(before.y, 6)
    }
  })

  it('still carries an off-centre mask around the wheel when rotated (D42)', () => {
    const placed = reducer(small, {
      type: 'dragMask',
      deltaDisplay: { x: 0.6, y: 0 },
      offsetAtStart: { x: 0, y: 0 },
    })
    const at0 = centroid(displayPolygon(placed))
    const spun = centroid(displayPolygon(reducer(placed, { type: 'setRotation', deg: 90 })))
    // Same distance from the centre, rotated a quarter turn — not spinning in place.
    expect(radiusOf(spun.x, spun.y)).toBeCloseTo(radiusOf(at0.x, at0.y), 6)
    expect(Math.hypot(spun.x - at0.x, spun.y - at0.y)).toBeGreaterThan(0.3)
  })

  /**
   * Regression, and the second time this suite has missed the same class of bug: the
   * reach tests above all use `small`, a CENTRED triad, so a bias tied to the shape's own
   * centre could not show up. Any reshaping moves that centre.
   *
   * The offset used to be clamped in its own frame, but the displayed centre is
   * `size * baseCentroid + offset` — so the reachable positions formed a unit disk
   * centred on `size * baseCentroid`, off-centre for any reshaped mask. Measured on a
   * hand-mirrored triangle: 0.82 rightwards against 0.60 leftwards.
   */
  it('reaches equally far in every direction for a mask whose own centre is off-centre', () => {
    let st = withState({})
    st = reducer(st, { type: 'moveVertex', index: 0, to: { x: 0.38, y: -0.53 } })
    st = reducer(st, { type: 'moveVertex', index: 1, to: { x: 0.64, y: 0.42 } })
    st = reducer(st, { type: 'moveVertex', index: 2, to: { x: -0.38, y: 0.93 } })
    // The shape's own centre is well away from the wheel centre — that is the setup.
    expect(radiusOf(centroid(st.basePolygon).x, centroid(st.basePolygon).y)).toBeGreaterThan(0.2)

    const reach = (dx: number, dy: number) => {
      const next = reducer(st, {
        type: 'dragMask',
        deltaDisplay: { x: dx * 9, y: dy * 9 },
        offsetAtStart: st.offset,
      })
      const c = centroid(displayPolygon(next))
      return radiusOf(c.x, c.y)
    }
    const reaches = [reach(-1, 0), reach(1, 0), reach(0, -1), reach(0, 1)]
    const spread = Math.max(...reaches) - Math.min(...reaches)
    // Some spread is inherent: a large mask's vertices pin to the rim and pull the drawn
    // centroid back. A directional BIAS is not.
    expect(spread).toBeLessThan(0.1)
    for (const r of reaches) expect(r).toBeGreaterThan(0.6)
  })

  it('still keeps a dragged mask on the wheel', () => {
    let st = withState({})
    st = reducer(st, { type: 'moveVertex', index: 0, to: { x: 0.5, y: -0.5 } })
    const flung = reducer(st, {
      type: 'dragMask',
      deltaDisplay: { x: 40, y: 40 },
      offsetAtStart: st.offset,
    })
    const c = centroid(displayPolygon(flung))
    expect(radiusOf(c.x, c.y)).toBeLessThanOrEqual(1 + 1e-9)
    for (const p of displayPolygon(flung)) {
      expect(radiusOf(p.x, p.y)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('resets when a preset is loaded', () => {
    const moved = reducer(initialState, {
      type: 'dragMask',
      deltaDisplay: { x: 0.3, y: 0.1 },
      offsetAtStart: { x: 0, y: 0 },
    })
    expect(reducer(moved, { type: 'loadPreset', id: 'split' }).offset).toEqual({ x: 0, y: 0 })
  })
})

describe('drag flag', () => {
  it('sets and clears, returning the same object when redundant', () => {
    const dragging = reducer(initialState, { type: 'beginDrag', index: 1 })
    expect(dragging.dragging).toBe(1)
    expect(reducer(dragging, { type: 'beginDrag', index: 1 })).toBe(dragging)
    expect(reducer(dragging, { type: 'endDrag' }).dragging).toBeNull()
    expect(reducer(initialState, { type: 'endDrag' })).toBe(initialState)
  })
})
