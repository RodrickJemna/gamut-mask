/**
 * Layout shell and the only state in the app. Spec: F7, D8, D10, D14, section 6.
 *
 * No router, no providers, no context (D8, D14). State lives here and goes down at most
 * two levels.
 */

import { useMemo, useReducer } from 'react'
import './App.css'
import { MaskOverlay } from './components/MaskOverlay.tsx'
import { MaskPanel } from './components/MaskPanel.tsx'
import { SampleList } from './components/SampleList.tsx'
import { WheelCanvas } from './components/WheelCanvas.tsx'
import { sampleMask } from './geom/sample.ts'
import { MIN_VERTICES, displayPolygon, initialState, reducer } from './state/reducer.ts'

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

  /**
   * Both derived, never stored — storing either would give a second source of truth for
   * what the mask is. The memos matter: without them, sampling would re-run on every
   * unrelated render, including every pointermove during a vertex drag.
   */
  const { basePolygon, rotation, size, sampleCount } = state
  const polygon = useMemo(
    () => displayPolygon({ basePolygon, rotation, size }),
    [basePolygon, rotation, size],
  )
  const samples = useMemo(() => sampleMask(polygon, sampleCount), [polygon, sampleCount])

  return (
    <main className="app">
      <div className="wheel">
        <WheelCanvas />
        <MaskOverlay
          polygon={polygon}
          canDelete={basePolygon.length > MIN_VERTICES}
          dispatch={dispatch}
        />
      </div>
      <MaskPanel state={state} dispatch={dispatch} />
      <SampleList samples={samples} requested={state.sampleCount} />
    </main>
  )
}
