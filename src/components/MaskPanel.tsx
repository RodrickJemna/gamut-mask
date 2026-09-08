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
import { paintCount } from '../paints/match.ts'
import { BRANDS, BRAND_TAG } from '../paints/types.ts'
import { MAX_SIZE, MIN_SIZE } from '../state/reducer.ts'
import type { Action, AppState } from '../state/types.ts'

type Props = {
  state: AppState
  dispatch: (action: Action) => void
  /** Builds and downloads the PDF sheet; returns the filename used (D43). */
  onSaveSheet: () => string
  /** Same sheet as a single JPEG; returns the filename used (D45). */
  onSaveJpeg: () => string
}

export function MaskPanel({ state, dispatch, onSaveSheet, onSaveJpeg }: Props) {
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      </section>

      {/*
        D48 — which catalogues to match against. Driven off BRANDS, so adding a
        catalogue adds its checkbox without touching this file. Laid out as a wrapping
        row of compact labels rather than a stacked list, because the panel has to leave
        room for the D10 caveat beneath it and this list is expected to grow.
      */}
      <section>
        <h2>Paints</h2>
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

      {/* No heading: the panel has to leave room for the D10 caveat beneath it, and on a
          1280x720 screen a fifth section heading is what pushes the caveat off. */}
      <p className="samples-note">
        Drag the mask to move it, a handle to reshape it. Click an edge to add a vertex,
        alt-click to remove.
      </p>
    </aside>
  )
}
