/**
 * Layout shell and the only state in the app. Spec: F7, D8, D10, D14, section 6.
 *
 * No router, no providers, no context (D8, D14). State lives here and goes down at most
 * two levels.
 */

import { useCallback, useMemo, useReducer } from 'react'
import './App.css'
import { MaskOverlay } from './components/MaskOverlay.tsx'
import { MaskPanel } from './components/MaskPanel.tsx'
import { SampleList } from './components/SampleList.tsx'
import { WheelCanvas } from './components/WheelCanvas.tsx'
import { toHex } from './color/format.ts'
import { downloadFile } from './export/download.ts'
import { sheetFileName } from './export/name.ts'
import { PRESETS } from './mask/presets.ts'
import { buildSheet } from './export/sheet.ts'
import { renderWheelImage } from './export/wheelImage.ts'
import { sampleMask } from './geom/sample.ts'
import { MIN_VERTICES, displayPolygon, initialState, reducer } from './state/reducer.ts'

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

  /**
   * Both derived, never stored — storing either would give a second source of truth for
   * what the mask is. The memos matter: without them, sampling would re-run on every
   * unrelated render, including every pointermove during a vertex drag.
   */
  const { basePolygon, offset, rotation, size, sampleCount } = state
  const polygon = useMemo(
    () => displayPolygon({ basePolygon, offset, rotation, size }),
    [basePolygon, offset, rotation, size],
  )
  const samples = useMemo(() => sampleMask(polygon, sampleCount), [polygon, sampleCount])

  /**
   * D43 — build the PDF sheet and hand it to the browser's download flow. The filename
   * is derived from the colours, so re-exporting the same palette does not accumulate
   * near-duplicates.
   */
  const saveSheet = useCallback((): string => {
    const fileName = sheetFileName(samples.map((s) => toHex(s.rgb8)))
    downloadFile(
      buildSheet({
        image: renderWheelImage(polygon),
        samples,
        polygon,
        // The human label, not the id — the sheet is read by a person.
        preset: PRESETS.find((p) => p.id === state.preset)?.label ?? null,
        rotation,
        size,
        requested: sampleCount,
      }),
      fileName,
      'application/pdf',
    )
    return fileName
  }, [samples, polygon, state.preset, rotation, size, sampleCount])

  return (
    <main className="app">
      <div className="wheel">
        <WheelCanvas />
        <MaskOverlay
          polygon={polygon}
          offset={offset}
          canDelete={basePolygon.length > MIN_VERTICES}
          dispatch={dispatch}
        />
      </div>
      <div className="side">
        <MaskPanel state={state} dispatch={dispatch} onSaveSheet={saveSheet} />
        {/*
          D10 requires the sRGB assumption to be stated in the UI. It lives here rather
          than above the colour list so it stays visible without competing for the room
          the list needs.
        */}
        <p className="caveat">
          Assumes sRGB. On an uncalibrated monitor this plans relative harmony; it does
          not predict absolute paint colour. Paint matches use the catalogue&apos;s
          printed swatches, not measured paint — a starting point, not a colour reading.
        </p>
      </div>
      <SampleList samples={samples} requested={sampleCount} />
    </main>
  )
}
