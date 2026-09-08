/**
 * The control panel to the right of the wheel. Spec: F4, F5, F6, D23, D17, D26.
 *
 * IMPLEMENT
 *
 *   function MaskPanel(props: {
 *     preset: PresetId | null
 *     rotation: number
 *     size: number
 *     sampleCount: number
 *     dispatch: (a: Action) => void
 *   }): JSX.Element
 *
 * CONTENTS, in this order (spec section 6, "Layout"): four preset buttons, then three
 * sliders — rotate, size, colors.
 *
 *   presets      4 buttons (F4). The one matching `preset` is shown active; after any
 *                vertex edit `preset` is null and none is active. Clicking replaces the
 *                mask immediately, no confirmation (D23).
 *                `atmospheric` is undecided — see the open question in `mask/presets.ts`.
 *                Render it disabled until it is settled, rather than wiring it to a
 *                guessed shape.
 *
 *   rotate       0-359 deg, step 1. Maps to `setRotation` (F5).
 *   size         scale factor, roughly 0.05-1, step 0.01. Maps to `setSize` (F5).
 *   colors       N, 4-32, step 1, default 12. Maps to `setSampleCount` (D17).
 *
 * Use native `<input type="range">`. It is keyboard accessible and draggable for free,
 * and a custom slider is exactly the kind of thing the spec's "measuring instrument, not
 * a landing page" line rules out. Style the track and thumb in CSS to neutral greys.
 *
 * Each slider is a `<label>` wrapping its input with the name on the left and the current
 * value on the right — the value readout matters more than usual here, because rotation
 * and size are the two numbers a user would want to reproduce later.
 *
 * These are controlled inputs: `value` from props, `onChange` dispatching. Do not keep a
 * local `useState` mirror of the slider position — that is the standard way to end up
 * with two sources of truth and a slider that fights the reducer.
 *
 * `size` and `colors` are fine to dispatch on every `change` event. Rotation at step 1
 * fires up to 360 dispatches per sweep, each re-running sampling; if that drags, round
 * the sample-list input rather than debouncing the slider, so the wheel stays live.
 *
 * D25: when fewer than N samples fit, the actual count is shown — that text belongs in
 * `SampleList`, next to the samples, not on this slider.
 *
 * All labels in English (D26). No i18n layer, no translation keys.
 *
 * No test file — CLAUDE.md: no UI tests.
 */
