/**
 * Layout shell and the only state in the app. Spec: F7, D8, D10, D14, section 6.
 *
 * No router, no providers, no context (D8, D14). State lives here and goes down at most
 * two levels.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
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
import { combinedField } from './paints/coverage.ts'
import {
  canRedo,
  canUndo,
  historyReducer,
  initialHistory,
} from './state/history.ts'
import { MIN_VERTICES, displayPolygon, initialState } from './state/reducer.ts'

export default function App() {
  /**
   * The reducer is wrapped in the undo/redo one (D49), so `dispatch` takes the same
   * actions as before plus `undo` and `redo`. Nothing below this line knows the
   * difference: `state` is the present, exactly as it was.
   */
  const [history, dispatch] = useReducer(historyReducer, initialState, initialHistory)
  const state = history.present

  /**
   * Keyboard undo/redo. A window listener rather than a handler on the app root, because
   * the shortcut has to work with focus anywhere — including nowhere, which is where it
   * is after clicking the wheel.
   *
   * Skipped while a text field has focus: inside the rotation and size inputs, cmd-Z is
   * the browser's own undo for what you typed, and stealing it there would make the
   * fields feel broken.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const key = event.key.toLowerCase()
      // cmd-shift-Z is redo on macOS, ctrl-Y everywhere else. Both are cheap to accept.
      if (key === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if (key === 'y') {
        event.preventDefault()
        dispatch({ type: 'redo' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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

  /**
   * D50 — whether the wheel shades what no enabled paint can reach.
   *
   * A view setting, so it stays out of the reducer along with the other ones D13 keeps
   * out: it changes nothing about the mask and nothing a saved file would need.
   *
   * OFF by default. It shipped on, on the argument that the limit is most useful before a
   * mask is placed and that a feature defaulted off is never discovered; the author's
   * verdict on seeing it was that a scrim over 42% of the disk is ugly, and it is his
   * wheel. The counter in the list heading still reports coverage unprompted, so nothing
   * is silently lost by leaving this off.
   */
  const [showUnreachable, setShowUnreachable] = useState(false)

  const { basePolygon, offset, rotation, size, enabledBrands } = state
  const polygon = useMemo(
    () => displayPolygon({ basePolygon, offset, rotation, size }),
    [basePolygon, offset, rotation, size],
  )
  const samples = useMemo(() => sampleMask(polygon), [polygon])

  /**
   * Memoised so the scrim's effect sees a stable identity; `combinedField` caches the
   * heavy work itself, so this is only about not repainting for free.
   */
  const unreachable = useMemo(
    () => (showUnreachable ? combinedField(enabledBrands) : null),
    [showUnreachable, enabledBrands],
  )

  const sheetContent = useMemo(
    () => ({
      samples,
      polygon,
      brands: enabledBrands,
      preset: PRESETS.find((p) => p.id === state.preset)?.label ?? null,
      rotation,
      size,
    }),
    [samples, polygon, enabledBrands, state.preset, rotation, size],
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
        <WheelCanvas unreachable={unreachable} />
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
          canUndo={canUndo(history)}
          canRedo={canRedo(history)}
          showUnreachable={showUnreachable}
          onToggleUnreachable={setShowUnreachable}
          onSaveSheet={saveSheet}
          onSaveJpeg={saveJpeg}
        />
        {/*
          D10 requires the sRGB assumption to be stated in the UI. It lives here rather
          than above the colour list so it stays visible without competing for the room
          the list needs.

          KEEP IT SHORT. This is the bottom of the column, so it is what falls off a
          1280x720 screen when anything above it grows — which has now happened twice, at
          D50 and again when a fourth brand made the filter wrap to two rows. The claim
          D10 actually requires is the sRGB assumption; the rest is trimmed to fit.
        */}
        <p className="caveat">
          Assumes sRGB: on an uncalibrated monitor this plans relative harmony, not
          absolute paint colour. Matches use printed catalogue swatches.
        </p>
      </div>
      <SampleList
        samples={samples}
        brands={enabledBrands}
        highlighted={highlighted}
        onHighlight={setHighlighted}
      />
    </main>
  )
}
