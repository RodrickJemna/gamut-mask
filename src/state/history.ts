/**
 * Undo/redo, as a reducer wrapped around the reducer. Spec: D49.
 *
 * The mask is now editable four ways — presets, vertex drags, body drags and two sliders
 * — so one careless pull can destroy a shape that took a while to get right, with no way
 * back. This adds the way back and nothing else: `reducer` is untouched and still the
 * only thing that knows what the state means.
 *
 * WHAT COUNTS AS ONE STEP is the whole problem. A vertex drag dispatches a `moveVertex`
 * per pointer frame and a slider a `setRotation` per pixel, so recording every action
 * would fill the stack with a hundred intermediate positions and "undo" would rewind one
 * frame of a gesture. Actions are therefore classified:
 *
 *   - DISCRETE (loadPreset, addVertex, deleteVertex, toggleBrand): always a new step.
 *   - MERGEABLE (moveVertex, dragMask, setRotation, setSize): a run of them with the same
 *     merge key collapses into one step, so a gesture is one undo.
 *   - TRANSIENT (beginDrag, endDrag, and the D57 inventory edits): never a step.
 *     begin/endDrag only move `dragging`, which is pointer bookkeeping. The inventory is
 *     a fact about the shelf rather than an edit to the mask, and ticking sixty paints
 *     must not bury the shape you were working on under sixty undo steps.
 *
 * The merge key includes the vertex index, so dragging vertex 0 and then vertex 1 without
 * an intervening action is still two steps. `endDrag` clears the key even though it
 * records nothing, which is what makes two consecutive drags of the SAME vertex two steps
 * rather than one merged blur.
 *
 * D18: the shape stays JSON-serialisable, so a saved file could carry its history — or
 * more likely just `present`, which is why `present` is a plain AppState and not a diff.
 */

import { reducer } from './reducer.ts'
import type { Action, AppState } from './types.ts'

/**
 * How many steps back you can go. Fifty is far more than the "I have just ruined it"
 * case this exists for, and the states are small — a polygon and five scalars — so the
 * bound is about not growing without limit during a long session, not about memory
 * pressure.
 */
export const HISTORY_LIMIT = 50

export type HistoryState = {
  past: AppState[]
  present: AppState
  /** Cleared by any edit, so redo cannot replay a branch that was diverged away from. */
  future: AppState[]
  /**
   * Merge key of the action that produced `present`, or null. Not part of the state the
   * app renders; it lives here because deciding whether to merge needs to know what the
   * previous action was, and a reducer may not look anywhere else.
   */
  lastKey: string | null
}

export type HistoryAction = Action | { type: 'undo' } | { type: 'redo' }

/**
 * Actions that collapse into the previous step when they repeat, and the key they
 * collapse on. Null means the action is either discrete or transient.
 */
function mergeKeyOf(action: Action): string | null {
  switch (action.type) {
    case 'moveVertex':
      return `moveVertex:${action.index}`
    case 'dragMask':
      return 'dragMask'
    /**
     * Only a SLIDER FRAME merges. Keying on the action type alone conflated two different
     * things, because a typed value and the snap toggle dispatch the same action as the
     * slider does: typing 137 degrees and then ticking Snap collapsed into a single step,
     * so one undo went past 137 to 0 and there was no way back to the typed angle.
     */
    case 'setRotation':
      return action.continuous ? 'setRotation' : null
    case 'setSize':
      return action.continuous ? 'setSize' : null
    default:
      return null
  }
}

/** Actions that must never create a step: see the classification above. */
function isTransient(action: Action): boolean {
  return (
    action.type === 'beginDrag'
    || action.type === 'endDrag'
    || action.type === 'toggleOwned'
    || action.type === 'setOwned'
    || action.type === 'setOwnedOnly'
  )
}

/**
 * Turns a recorded snapshot back into a present state.
 *
 * Two corrections, both about fields the steps were never about:
 *
 * `dragging` is dropped, because a step may have been captured mid-gesture and coming
 * back to a state that claims a vertex is held leaves a handle stuck in its active style.
 *
 * The INVENTORY IS CARRIED FORWARD from the current present rather than restored. The
 * stack stores whole snapshots, so a step recorded before the shelf was stocked still
 * contains the empty shelf — and restoring it would quietly un-tick paints that were
 * never part of that step. A field excluded from history (see `isTransient`) has to be
 * excluded on the way back too, or it is only half excluded.
 */
const restore = (snapshot: AppState, current: AppState): AppState => ({
  ...snapshot,
  dragging: null,
  owned: current.owned,
  ownedOnly: current.ownedOnly,
})

export const initialHistory = (state: AppState): HistoryState => ({
  past: [],
  present: state,
  future: [],
  lastKey: null,
})

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'undo') {
    if (state.past.length === 0) return state
    const previous = state.past[state.past.length - 1]
    return {
      past: state.past.slice(0, -1),
      present: restore(previous, state.present),
      future: [state.present, ...state.future],
      // An undone step must not merge into whatever is dispatched next, or the first
      // slider nudge after an undo would overwrite the step it just restored.
      lastKey: null,
    }
  }

  if (action.type === 'redo') {
    if (state.future.length === 0) return state
    const [next, ...rest] = state.future
    return {
      past: [...state.past, state.present],
      present: restore(next, state.present),
      future: rest,
      lastKey: null,
    }
  }

  const present = reducer(state.present, action)
  // The reducer returns the same object for a no-op, which is the cheapest way to know
  // that nothing happened. A rejected drag frame must not consume a history slot.
  if (present === state.present) return state

  if (isTransient(action)) {
    return { ...state, present, lastKey: null }
  }

  const key = mergeKeyOf(action)
  const merge = key !== null && key === state.lastKey
  const past = merge ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT)

  return { past, present, future: [], lastKey: key }
}

export const canUndo = (state: HistoryState): boolean => state.past.length > 0
export const canRedo = (state: HistoryState): boolean => state.future.length > 0
