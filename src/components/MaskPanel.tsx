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
import { PRESETS } from '../mask/presets.ts'
import { MAX_SAMPLES, MAX_SIZE, MIN_SAMPLES, MIN_SIZE } from '../state/reducer.ts'
import type { Action, AppState } from '../state/types.ts'

type Props = {
  state: AppState
  dispatch: (action: Action) => void
  /** Builds and downloads the PDF sheet; returns the filename used (D43). */
  onSaveSheet: () => string
}

export function MaskPanel({ state, dispatch, onSaveSheet }: Props) {
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function save() {
    setSaving(true)
    // Yield a frame so the button repaints as "Saving..." before the wheel is re-rendered
    // at print resolution, which takes a couple of hundred milliseconds.
    window.setTimeout(() => {
      try {
        setSaved(onSaveSheet())
      } finally {
        setSaving(false)
      }
    }, 0)
  }
  return (
    <aside className="panel">
      <section>
        <h2>Mask</h2>
        <div className="presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={state.preset === preset.id}
              disabled={!preset.available}
              // The atmospheric preset has no agreed geometry yet; see mask/presets.ts.
              title={preset.available ? undefined : 'Geometry not defined yet'}
              onClick={() => dispatch({ type: 'loadPreset', id: preset.id })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Shape</h2>

        <label className="slider">
          <span>Rotate</span>
          <span className="value">{Math.round(state.rotation)}&deg;</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={Math.round(state.rotation)}
            onChange={(e) => dispatch({ type: 'setRotation', deg: e.currentTarget.valueAsNumber })}
          />
        </label>

        <label className="slider">
          <span>Size</span>
          <span className="value">{Math.round(state.size * 100)}%</span>
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={0.01}
            value={state.size}
            onChange={(e) => dispatch({ type: 'setSize', factor: e.currentTarget.valueAsNumber })}
          />
        </label>

        <label className="slider">
          <span>Colors</span>
          <span className="value">{state.sampleCount}</span>
          <input
            type="range"
            min={MIN_SAMPLES}
            max={MAX_SAMPLES}
            step={1}
            value={state.sampleCount}
            onChange={(e) =>
              dispatch({ type: 'setSampleCount', n: e.currentTarget.valueAsNumber })
            }
          />
        </label>
      </section>

      <section>
        <h2>Export</h2>
        <div className="presets">
          <button type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save PDF sheet'}
          </button>
        </div>
        {saved && (
          <p className="samples-note">
            Saved <span className="sample-hex">{saved}</span> to your downloads.
          </p>
        )}
      </section>

      <section>
        <h2>Editing</h2>
        <p className="samples-note">
          Drag inside the mask to move it. Drag a handle to move a vertex. Click an edge
          to add one. Alt-click a handle to remove it.
        </p>
      </section>
    </aside>
  )
}
