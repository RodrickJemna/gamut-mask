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
import { HintTip } from './components/HintTip.tsx'
import { SchemeStrip } from './components/SchemeStrip.tsx'
import { WheelCanvas } from './components/WheelCanvas.tsx'
import { toHex } from './color/format.ts'
import { wheelById } from './color/wheel.ts'
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
  /** D53 — the chosen wheel, resolved once and passed down rather than looked up twice. */
  const wheel = useMemo(() => wheelById(state.wheel), [state.wheel])
  const polygon = useMemo(
    () => displayPolygon({ basePolygon, offset, rotation, size }),
    [basePolygon, offset, rotation, size],
  )
  const samples = useMemo(() => sampleMask(polygon, wheel), [polygon, wheel])

  /**
   * Memoised so the scrim's effect sees a stable identity; `combinedField` caches the
   * heavy work itself, so this is only about not repainting for free.
   */
  const unreachable = useMemo(
    () => (showUnreachable ? combinedField(enabledBrands, state.wheel) : null),
    [showUnreachable, enabledBrands, state.wheel],
  )

  const sheetContent = useMemo(
    () => ({
      samples,
      polygon,
      brands: enabledBrands,
      preset: PRESETS.find((p) => p.id === state.preset)?.label ?? null,
      wheel,
      rotation,
      size,
    }),
    [samples, polygon, enabledBrands, state.preset, wheel, rotation, size],
  )

  /**
   * D43, D45 — build the sheet and hand it to the browser's download flow. The filename
   * is derived from the colours, so re-exporting the same palette does not accumulate
   * near-duplicates, and both formats share the hash.
   */
  const saveSheet = useCallback((): string => {
    const fileName = sheetFileName(samples.map((s) => toHex(s.rgb8)), 'pdf')
    downloadFile(
      buildSheet({ ...sheetContent, image: renderWheelImage(polygon, wheel) }),
      fileName,
      'application/pdf',
    )
    return fileName
  }, [samples, polygon, wheel, sheetContent])

  const saveJpeg = useCallback((): string => {
    const fileName = sheetFileName(samples.map((s) => toHex(s.rgb8)), 'jpg')
    downloadFile(buildSheetJpeg(sheetContent), fileName, 'image/jpeg')
    return fileName
  }, [samples, sheetContent])

  const hovered = highlighted === null ? undefined : samples[highlighted]
  const highlightedPoint = hovered ? { x: hovered.x, y: hovered.y } : null

  return (
    <main className="app">
      <div className="wheel-col">
        <div className="wheel">
          <WheelCanvas wheel={wheel} unreachable={unreachable} />
          <MaskOverlay
            polygon={polygon}
            offset={offset}
            highlight={highlightedPoint}
            canDelete={basePolygon.length > MIN_VERTICES}
            dispatch={dispatch}
          />
        </div>
        {/*
          D10 requires the sRGB assumption to be stated in the UI, and since D53 it lives
          HERE, under the wheel.

          It used to sit at the bottom of the controls column, which made it whatever fell
          off a 1280x720 screen when anything above it grew — and it did, three times: at
          D50, when a fourth brand made the brand filter wrap, and again when the wheel
          chips took a row. Each time the fix was to shave pixels off something else,
          which is not a fix. The wheel is a square in a taller column, so this column has
          real vertical slack — about 227 px at 1280x720 — while the panel has none. It
          also reads better here: the caveat is about what the DISK means, not about the
          export buttons it used to sit under.
        */}
        {/*
          The mask's interactions are described HERE too, for the same reason as the
          caveat and with better cause: they are instructions about the disk, and reading
          them under the thing they describe beats reading them under the export buttons.
          Moving them out of the panel is also what let D54's strip take a row without
          the controls column starting to scroll.
        */}
        <p className="wheel-hint">
          Drag the mask to move it, a handle to reshape it. Click an edge to add a vertex,
          alt-click to remove.
        </p>
        <p className="caveat">
          Assumes sRGB: on an uncalibrated monitor this plans relative harmony, not
          absolute paint colour. Matches use printed catalogue swatches.
        </p>
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
      </div>
      <SampleList
        samples={samples}
        brands={enabledBrands}
        highlighted={highlighted}
        onHighlight={setHighlighted}
      />
      {/*
        D54 — the 60-30-10 suggestions span the full width along the bottom, so they read
        as a conclusion drawn from everything above rather than as a fourth column
        competing with them. It shares `highlighted` with the colour list, so hovering a
        segment rings the same colour on the wheel that hovering its row would.
      */}
      <SchemeStrip
        samples={samples}
        brands={enabledBrands}
        highlighted={highlighted}
        onHighlight={setHighlighted}
      />
      {/* D56 — one hover explanation for the whole app; see HintTip. */}
      <HintTip />
    </main>
  )
}
