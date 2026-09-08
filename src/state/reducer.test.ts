import { describe, expect, it } from 'vitest'
import { polar, radiusOf } from '../color/wheel.ts'
import { buildPreset } from '../mask/presets.ts'
import {
  MAX_SAMPLES,
  MAX_SIZE,
  MIN_SAMPLES,
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

  it('keeps unmapped points inside the disk (D22)', () => {
    const state = withState({ rotation: 45, size: 0.1 })
    const back = toBasePoint({ x: 0.9, y: 0.9 }, state)
    expect(radiusOf(back.x, back.y)).toBeLessThanOrEqual(1 + 1e-12)
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

  it('clamps sample count to 4..32 and keeps it an integer', () => {
    expect(reducer(initialState, { type: 'setSampleCount', n: 99 }).sampleCount).toBe(MAX_SAMPLES)
    expect(reducer(initialState, { type: 'setSampleCount', n: 1 }).sampleCount).toBe(MIN_SAMPLES)
    expect(reducer(initialState, { type: 'setSampleCount', n: 12.7 }).sampleCount).toBe(13)
  })

  it('returns the same object when a slider does not actually change', () => {
    expect(reducer(initialState, { type: 'setRotation', deg: 0 })).toBe(initialState)
    expect(reducer(initialState, { type: 'setSize', factor: 1 })).toBe(initialState)
    expect(reducer(initialState, { type: 'setSampleCount', n: 12 })).toBe(initialState)
  })
})

describe('state shape (D18)', () => {
  it('survives a JSON round trip unchanged', () => {
    const state = reducer(initialState, { type: 'setRotation', deg: 137 })
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('holds only JSON-safe values', () => {
    for (const value of Object.values(initialState)) {
      const ok =
        value === null ||
        typeof value === 'number' ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        Array.isArray(value)
      expect(ok).toBe(true)
    }
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
