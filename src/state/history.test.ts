import { describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  historyReducer,
  initialHistory,
  type HistoryAction,
  type HistoryState,
} from './history.ts'
import { initialState } from './reducer.ts'

/**
 * The interesting behaviour here is not "undo restores the previous state" — that part is
 * a stack — but WHAT COUNTS AS ONE STEP. A drag or a slider sweep dispatches dozens of
 * actions and must collapse to a single undo, while two separate gestures must not.
 */
const run = (actions: HistoryAction[], from: HistoryState = initialHistory(initialState)) =>
  actions.reduce(historyReducer, from)

const move = (index: number, x: number, y: number): HistoryAction => ({
  type: 'moveVertex',
  index,
  to: { x, y },
})

describe('history', () => {
  it('has nothing to undo at the start', () => {
    const h = initialHistory(initialState)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
    expect(h.present).toBe(initialState)
  })

  it('records a discrete action as one step and restores it', () => {
    const h = run([{ type: 'loadPreset', id: 'analogous' }])
    expect(canUndo(h)).toBe(true)
    expect(h.present.preset).toBe('analogous')

    const back = historyReducer(h, { type: 'undo' })
    expect(back.present.preset).toBe('triad')
    expect(back.present.basePolygon).toEqual(initialState.basePolygon)
    expect(canRedo(back)).toBe(true)

    const forward = historyReducer(back, { type: 'redo' })
    expect(forward.present.preset).toBe('analogous')
  })

  it('collapses a whole slider sweep into one step', () => {
    const sweep: HistoryAction[] = []
    for (let deg = 1; deg <= 40; deg++) sweep.push({ type: 'setRotation', deg, continuous: true })
    const h = run(sweep)

    expect(h.present.rotation).toBe(40)
    expect(h.past).toHaveLength(1)
    // One undo returns to where the sweep began, not to 39 degrees.
    expect(historyReducer(h, { type: 'undo' }).present.rotation).toBe(0)
  })

  it('collapses a vertex drag into one step, per vertex', () => {
    const h = run([
      { type: 'beginDrag', index: 0 },
      move(0, 0.5, 0.1),
      move(0, 0.5, 0.2),
      move(0, 0.5, 0.3),
      { type: 'endDrag' },
      { type: 'beginDrag', index: 1 },
      move(1, -0.4, 0.1),
      move(1, -0.4, 0.2),
      { type: 'endDrag' },
    ])
    expect(h.past).toHaveLength(2)
  })

  it('does not merge two drags of the SAME vertex into one step', () => {
    // Without endDrag clearing the merge key these would collapse, so releasing the
    // pointer and dragging again would be one undoable blur.
    const h = run([
      { type: 'beginDrag', index: 0 },
      move(0, 0.5, 0.1),
      { type: 'endDrag' },
      { type: 'beginDrag', index: 0 },
      move(0, 0.6, 0.1),
      { type: 'endDrag' },
    ])
    expect(h.past).toHaveLength(2)
  })

  it('separates two different mergeable gestures', () => {
    const h = run([
      { type: 'setRotation', deg: 10, continuous: true },
      { type: 'setRotation', deg: 20, continuous: true },
      { type: 'setSize', factor: 0.5, continuous: true },
      { type: 'setSize', factor: 0.4, continuous: true },
    ])
    expect(h.past).toHaveLength(2)
    const back = historyReducer(h, { type: 'undo' })
    expect(back.present.size).toBe(1)
    expect(back.present.rotation).toBe(20)
  })

  it('never records begin/endDrag on their own', () => {
    const h = run([{ type: 'beginDrag', index: 0 }, { type: 'endDrag' }])
    expect(h.past).toHaveLength(0)
    expect(canUndo(h)).toBe(false)
  })

  it('drops the dragging flag when restoring', () => {
    // A step captured mid-gesture would otherwise come back claiming a vertex is held.
    const mid = run([{ type: 'loadPreset', id: 'split' }, { type: 'beginDrag', index: 0 }])
    expect(mid.present.dragging).toBe(0)
    const back = historyReducer(mid, { type: 'undo' })
    expect(back.present.dragging).toBeNull()
  })

  it('ignores actions the reducer rejects', () => {
    // Three vertices is the floor (F2), so this delete is a no-op and must not eat a slot.
    const h = run([{ type: 'deleteVertex', index: 0 }])
    expect(h.past).toHaveLength(0)
    expect(h.present).toBe(initialState)
  })

  it('ignores a drag frame that does not move anything', () => {
    const h = run([
      { type: 'setRotation', deg: 0 },
      { type: 'setSize', factor: 1 },
    ])
    expect(h.past).toHaveLength(0)
  })

  it('clears the redo stack once you edit after undoing', () => {
    const h = run([
      { type: 'loadPreset', id: 'analogous' },
      { type: 'undo' },
      { type: 'loadPreset', id: 'split' },
    ])
    expect(canRedo(h)).toBe(false)
    expect(h.present.preset).toBe('split')
  })

  it('does not merge the first action after an undo into the restored step', () => {
    const h = run([
      { type: 'setRotation', deg: 30, continuous: true },
      { type: 'undo' },
      { type: 'setRotation', deg: 45, continuous: true },
    ])
    // The undo restored 0 degrees; the new sweep must be undoable back to it.
    expect(h.present.rotation).toBe(45)
    expect(historyReducer(h, { type: 'undo' }).present.rotation).toBe(0)
  })

  /**
   * Regression: found by driving the real UI. Typing 137 degrees and then ticking Snap
   * both dispatch setRotation, so keying the merge on the action type alone collapsed
   * them into ONE step — a single undo jumped from 120 straight past 137 to 0, and the
   * typed angle could not be recovered. Only a slider frame is `continuous`.
   */
  it('keeps a typed value and a snap as separate steps', () => {
    const h = run([
      { type: 'setRotation', deg: 137 },
      { type: 'setRotation', deg: 120 },
    ])
    expect(h.past).toHaveLength(2)
    const back = historyReducer(h, { type: 'undo' })
    expect(back.present.rotation).toBe(137)
    expect(historyReducer(back, { type: 'undo' }).present.rotation).toBe(0)
  })

  it('does not merge a typed value into the slider sweep before it', () => {
    const h = run([
      { type: 'setRotation', deg: 10, continuous: true },
      { type: 'setRotation', deg: 20, continuous: true },
      { type: 'setRotation', deg: 137 },
    ])
    expect(h.past).toHaveLength(2)
    expect(historyReducer(h, { type: 'undo' }).present.rotation).toBe(20)
  })

  it('is a no-op at either end of the stack', () => {
    const h = initialHistory(initialState)
    expect(historyReducer(h, { type: 'undo' })).toBe(h)
    expect(historyReducer(h, { type: 'redo' })).toBe(h)
  })

  it('bounds the stack, dropping the oldest step', () => {
    const actions: HistoryAction[] = []
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      actions.push({ type: 'toggleBrand', brand: i % 2 === 0 ? 'AK' : 'Vallejo' })
    }
    const h = run(actions)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
  })

  it('stays JSON-serialisable (D18)', () => {
    const h = run([{ type: 'loadPreset', id: 'atmospheric' }, { type: 'setSize', factor: 0.6 }])
    expect(JSON.parse(JSON.stringify(h))).toEqual(h)
  })
})

describe('the wheel in history (D53)', () => {
  it('is one undoable step, and undo restores the previous wheel', () => {
    const h = run([
      { type: 'setWheel', id: 'muted' },
      { type: 'setWheel', id: 'shadow' },
    ])
    expect(h.present.wheel).toBe('shadow')
    expect(h.past).toHaveLength(2)
    const back = historyReducer(h, { type: 'undo' })
    expect(back.present.wheel).toBe('muted')
    expect(historyReducer(back, { type: 'undo' }).present.wheel).toBe('saturated')
  })

  it('does not merge into a slider sweep beside it', () => {
    // Picking a wheel is deliberate, never a drag frame, so it must never be absorbed
    // into a neighbouring gesture the way one setRotation absorbs the next.
    const h = run([
      { type: 'setRotation', deg: 30, continuous: true },
      { type: 'setWheel', id: 'pastel' },
      { type: 'setRotation', deg: 60, continuous: true },
    ])
    expect(h.past).toHaveLength(3)
  })
})
