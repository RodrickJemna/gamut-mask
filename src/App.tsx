/**
 * Layout shell and the only state in the app. Spec: F7, D8, D10, D14, section 6.
 *
 * No router, no providers, no context (D8, D14). State lives here and goes down at most
 * two levels.
 */

import { useCallback, useMemo, useReducer, useState } from 'react'
import './App.css'
import { MaskOverlay } from './components/MaskOverlay.tsx'
import { MaskPanel } from './components/MaskPanel.tsx'
import { SampleList } from './components/SampleList.tsx'
import { WheelCanvas } from './components/WheelCanvas.tsx'
import { toHex } from './color/format.ts'
import { downloadFile } from './export/download.ts'
import { sheetFileName } from './export/name.ts'
import { PRESETS } from './mask/presets.ts'
import { buildSheetJpeg } from './export/jpeg.ts'
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
  /**
   * Which sample the colour list is pointing at (D46). Held here rather than in the
   * reducer: it is presentational, changes on every pointer move across the list, and
   * D18 keeps the reducer's state to things worth saving.
   *
   * An INDEX, not a sample — see the note in SampleList. If the mask changes while the
   * pointer rests on a row, the index simply resolves to whatever is there now, or to
   * nothing once the list is shorter.
   */
  const [highlighted, setHighlighted] = useState<number | null>(null)

  const { basePolygon, offset, rotation, size, sampleCount } = state
  const polygon = useMemo(
    () => displayPolygon({ basePolygon, offset, rotation, size }),
    [basePolygon, offset, rotation, size],
  )
  const samples = useMemo(() => sampleMask(polygon, sampleCount), [polygon, sampleCount])

  const sheetContent = useMemo(
    () => ({
      samples,
      polygon,
      preset: PRESETS.find((p) => p.id === state.preset)?.label ?? null,
      rotation,
      size,
      requested: sampleCount,
    }),
    [samples, polygon, state.preset, rotation, size, sampleCount],
  )

  /**
   * D43, D45 — build the sheet and hand it to the browser's download flow. The filename
   * is derived from the colours, so re-exporting the same palette does not accumulate
   * near-duplicates, and both formats share the hash.
   */
  const saveSheet = useCallback((): string => {
    const fileName = sheetFileName(samples.map((s) => toHex(s.rgb8)), 'pdf')
    downloadFile(
      buildSheet({ ...sheetContent, image: renderWheelImage(polygon) }),
      fileName,
      'application/pdf',
    )
    return fileName
  }, [samples, polygon, sheetContent])

  const saveJpeg = useCallback((): string => {
    const fileName = sheetFileName(samples.map((s) => toHex(s.rgb8)), 'jpg')
    downloadFile(buildSheetJpeg(sheetContent), fileName, 'image/jpeg')
    return fileName
  }, [samples, sheetContent])

  const hovered = highlighted === null ? undefined : samples[highlighted]
  const highlightedPoint = hovered ? { x: hovered.x, y: hovered.y } : null

  return (
    <main className="app">
      <div className="wheel">
        <WheelCanvas />
        <MaskOverlay
          polygon={polygon}
          offset={offset}
          highlight={highlightedPoint}
          canDelete={basePolygon.length > MIN_VERTICES}
          dispatch={dispatch}
        />
      </div>
      <div className="side">
        <MaskPanel
          state={state}
          dispatch={dispatch}
          onSaveSheet={saveSheet}
          onSaveJpeg={saveJpeg}
        />
        {/*
          D10 requires the sRGB assumption to be stated in the UI. It lives here rather
          than above the colour list so it stays visible without competing for the room
          the list needs.
        */}
        <p className="caveat">
          Assumes sRGB: on an uncalibrated monitor this plans relative harmony, it does
          not predict paint colour. Matches use printed catalogue swatches, not measured
          paint.
        </p>
      </div>
      <SampleList
        samples={samples}
        requested={sampleCount}
        highlighted={highlighted}
        onHighlight={setHighlighted}
      />
    </main>
  )
}
