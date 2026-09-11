/**
 * The control panel beside the wheel. Spec: F4, F5, F6, D23, D17, D26.
 *
 * Native range inputs throughout: keyboard-accessible and draggable for free, and a
 * custom slider is exactly the kind of thing "measuring instrument, not a landing page"
 * rules out. All labels English (D26); no i18n layer.
 *
 * These are controlled inputs — value from props, onChange dispatching. No local useState
 * mirror of a slider position, which is the standard way to end up with two sources of
 * truth and a control that fights the reducer.
 */

import { useState } from 'react'
import { WEDGE_SPAN, snapToAnchorAngle, wheelById } from '../color/wheel.ts'
import { PRESETS } from '../mask/presets.ts'
import { paintCount } from '../paints/match.ts'
import { BRANDS, BRAND_TAG } from '../paints/types.ts'
import type { HistoryAction } from '../state/history.ts'
import { MAX_SIZE, MIN_SIZE } from '../state/reducer.ts'
import type { AppState } from '../state/types.ts'
import { NumberField } from './NumberField.tsx'
import { PresetIcon } from './PresetIcon.tsx'
import { WheelChips } from './WheelChips.tsx'

type Props = {
  state: AppState
  dispatch: (action: HistoryAction) => void
  /** D49 — whether there is anything to step back to, or forward to. */
  canUndo: boolean
  canRedo: boolean
  /** D50 — whether the wheel shades what no enabled paint reaches. */
  showUnreachable: boolean
  onToggleUnreachable: (on: boolean) => void
  /** Builds and downloads the PDF sheet; returns the filename used (D43). */
  onSaveSheet: () => string
  /** Same sheet as a single JPEG; returns the filename used (D45). */
  onSaveJpeg: () => string
}

export function MaskPanel({
  state,
  dispatch,
  canUndo,
  canRedo,
  showUnreachable,
  onToggleUnreachable,
  onSaveSheet,
  onSaveJpeg,
}: Props) {
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /**
   * D49 — whether the rotate slider steps anchor to anchor.
   *
   * Component state, not reducer state: it is an input mode rather than a property of the
   * mask, and putting it in the reducer would make toggling it an undoable step, which
   * reads as a bug when cmd-Z turns a checkbox off instead of restoring your shape.
   * `highlighted` in App.tsx is held out for the same reason.
   */
  const [snap, setSnap] = useState(false)

  /**
   * Turning snap ON also snaps the current angle. Otherwise the slider sits at a value
   * its own step cannot express — the browser renders the thumb at the nearest stop while
   * the state stays at 45 degrees, so the control and the mask disagree until you touch
   * it.
   */
  function toggleSnap(on: boolean) {
    setSnap(on)
    if (on) dispatch({ type: 'setRotation', deg: snapToAnchorAngle(state.rotation) })
  }

  function save(build: () => string) {
    setSaving(true)
    // Yield a frame so the button repaints as "Saving..." before the wheel is re-rendered
    // at export resolution, which takes a couple of hundred milliseconds.
    window.setTimeout(() => {
      try {
        setSaved(build())
      } finally {
        setSaving(false)
      }
    }, 0)
  }
  return (
    <aside className="panel">
      {/*
        D53 — the wheel goes FIRST, above the mask: it decides what every colour in the
        list is, so it reads as the thing the rest of the panel operates within. The
        active wheel's name shares the heading line, which is where this panel puts a
        label that would otherwise cost a row of its own.
      */}
      <section>
        <div className="panel-head">
          <h2>Wheel</h2>
          <span className="wheel-name">{wheelById(state.wheel).label}</span>
        </div>
        <WheelChips
          active={state.wheel}
          onSelect={(id) => dispatch({ type: 'setWheel', id })}
        />
      </section>

      <section>
        {/*
          D49 — undo/redo shares the heading's line rather than taking a row of its own.
          The panel is height-constrained (see the note on `.panel` in App.css) and a
          fifth control row is what pushes the D10 caveat off a 1280x720 screen.

          The buttons exist alongside the keyboard shortcut because nothing else in this
          UI advertises that undo is available at all.
        */}
        <div className="panel-head">
          <h2>Mask</h2>
          <div className="history">
            <button
              type="button"
              onClick={() => dispatch({ type: 'undo' })}
              disabled={!canUndo}
              title="Undo (cmd-Z)"
              aria-label="Undo"
            >
              &#8630;
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'redo' })}
              disabled={!canRedo}
              title="Redo (cmd-shift-Z)"
              aria-label="Redo"
            >
              &#8631;
            </button>
          </div>
        </div>
        {/*
          D55 — icons in a 3x2 grid, not labels in a stack. Six presets as text would be
          six full-width rows; as icons they are two, and the icon is the better label
          anyway: the shape IS the thing being chosen, and "Split complementary" never fit
          the panel's width in the first place. The name is on the tooltip and the
          accessible label, so nothing is only conveyed by the picture.
        */}
        <div className="presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={state.preset === preset.id}
              aria-label={preset.label}
              disabled={!preset.available}
              title={`${preset.label} — ${preset.hint}`}
              onClick={() => dispatch({ type: 'loadPreset', id: preset.id })}
            >
              <PresetIcon id={preset.id} />
            </button>
          ))}
        </div>
      </section>

      <section>
        {/* Snap shares the heading's line for the same height reason as undo/redo. */}
        <div className="panel-head">
          <h2>Shape</h2>
          <label className="snap" title={`Step the rotation anchor to anchor (${WEDGE_SPAN}°)`}>
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => toggleSnap(e.currentTarget.checked)}
            />
            Snap {WEDGE_SPAN}&deg;
          </label>
        </div>

        {/*
          The label is a <span>, not the <label> wrapper it used to be: a label containing
          two inputs is ambiguous about which one it names, and clicking the text would
          focus whichever the browser picked. The slider and the field carry their own
          aria-labels instead.
        */}
        <div className="slider">
          <span>Rotate</span>
          <NumberField
            value={state.rotation}
            min={0}
            max={359}
            suffix="°"
            label="Rotation in degrees"
            onCommit={(deg) => dispatch({ type: 'setRotation', deg })}
          />
          <input
            type="range"
            aria-label="Rotation"
            min={0}
            max={359}
            step={1}
            value={Math.round(state.rotation)}
            /*
              Snapping happens HERE, on the way out, rather than as the input's `step`.
              Step-based snapping desynchronises the control from the state: with step 60,
              a rotation of 40 typed into the field renders the thumb at 60, because 40 is
              not a value the input considers valid. Snapping the emitted value instead
              keeps every angle expressible by the slider, and the mode only constrains
              what dragging it produces.

              It is not a magnetic tolerance either — that would make the angles just
              either side of an anchor unreachable while snap is on. Dragging gives six
              stops; exact intermediate values are what the number field is for.
            */
            onChange={(e) =>
              dispatch({
                type: 'setRotation',
                deg: snap
                  ? snapToAnchorAngle(e.currentTarget.valueAsNumber)
                  : e.currentTarget.valueAsNumber,
                continuous: true,
              })
            }
          />
        </div>

        <div className="slider">
          <span>Size</span>
          <NumberField
            value={state.size * 100}
            min={Math.round(MIN_SIZE * 100)}
            max={Math.round(MAX_SIZE * 100)}
            suffix="%"
            label="Size in percent"
            onCommit={(percent) => dispatch({ type: 'setSize', factor: percent / 100 })}
          />
          <input
            type="range"
            aria-label="Size"
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={0.01}
            value={state.size}
            onChange={(e) =>
              dispatch({
                type: 'setSize',
                factor: e.currentTarget.valueAsNumber,
                continuous: true,
              })
            }
          />
        </div>
      </section>

      {/*
        D48 — which catalogues to match against. Driven off BRANDS, so adding a
        catalogue adds its checkbox without touching this file. Laid out as a wrapping
        row of compact labels rather than a stacked list, because the panel has to leave
        room for the D10 caveat beneath it and this list is expected to grow.
      */}
      <section>
        {/*
          The scrim toggle shares the heading's line, like Snap and undo/redo. It had a
          row of its own and that row pushed the D10 caveat off a 1280x720 screen — the
          exact failure the note on `.panel` in App.css warns about, reintroduced by D50.
        */}
        <div className="panel-head">
          <h2>Paints</h2>
          {state.enabledBrands.length > 0 && (
            <label
              className="snap"
              title="Shade the wheel where no enabled paint comes within 5%"
            >
              <input
                type="checkbox"
                checked={showUnreachable}
                onChange={(e) => onToggleUnreachable(e.currentTarget.checked)}
              />
              Unreachable
            </label>
          )}
        </div>
        <div className="brand-filter">
          {BRANDS.map((brand) => {
            const on = state.enabledBrands.includes(brand)
            return (
              <label key={brand} title={`${brand} — ${paintCount(brand)} paints`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => dispatch({ type: 'toggleBrand', brand })}
                />
                <span className="brand-tag">{BRAND_TAG[brand]}</span>
                <span className="brand-count">{paintCount(brand)}</span>
              </label>
            )
          })}
        </div>
        {state.enabledBrands.length === 0 && (
          <p className="samples-note">Paint matching off.</p>
        )}
      </section>

      <section>
        <h2>Export</h2>
        {/* Side by side: stacked, the two buttons cost enough height to push the
            D10 caveat below the fold on a 1280x720 screen. */}
        <div className="export-buttons">
          <button type="button" onClick={() => save(onSaveSheet)} disabled={saving}>
            {saving ? '...' : 'Save PDF'}
          </button>
          <button type="button" onClick={() => save(onSaveJpeg)} disabled={saving}>
            {saving ? '...' : 'Save JPEG'}
          </button>
        </div>
        {saved && (
          <p className="samples-note">
            Saved <span className="sample-hex">{saved}</span> to your downloads.
          </p>
        )}
      </section>

    </aside>
  )
}
