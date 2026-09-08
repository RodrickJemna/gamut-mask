/**
 * The list of colours inside the mask. Spec: F6, D36, D25, D13, D16.
 *
 * IMPLEMENT
 *
 *   function SampleList({ samples, requested }: {
 *     samples: Sample[]     // already sorted by angle (D17)
 *     requested: number     // N from the slider, to detect the D25 shortfall
 *   }): JSX.Element
 *
 * ROW CONTENT is fixed by D36: swatch, hex, lightness, saturation. Lightness is Oklab `L`
 * on 0-100, saturation is the radius `t` as a percentage — both from `color/format.ts`.
 * Clicking a row copies the hex (D36, D13: the clipboard is the only export in v1).
 *
 * LAYOUT. A 4-column grid (spec section 6). Use `grid-template-columns: repeat(4, 1fr)`
 * on the container and let each row be one grid item — a card per sample, not a table.
 * The numbers should be tabular so columns of digits line up: `font-variant-numeric:
 * tabular-nums`, and a monospace stack for the hex.
 *
 * Render rows as `<button>`, not `<div onClick>`: clicking is the row's whole purpose, and
 * a button gets keyboard focus, Enter/Space and a focus ring for free. Reset the browser
 * button styling in CSS. Key on the sample's identity, not the array index — index keys
 * make React reuse a row for a different colour when the count changes, which shows up as
 * a swatch that briefly displays the wrong colour. The hex plus position, or the rounded
 * coordinates, is a stable key.
 *
 * CLIPBOARD. `navigator.clipboard.writeText(hex)` returns a promise and rejects when the
 * document is not focused or the API is unavailable (it needs a secure context —
 * `localhost` counts, a plain-http LAN address does not). Catch the rejection and do not
 * show success unconditionally. Confirm with a brief inline state on the row itself
 * (label swap or a check) rather than a toast; there is no toast layer and adding one for
 * this is out of proportion.
 *
 * SHORTFALL (D25). If `samples.length < requested`, state the actual number plainly —
 * "9 of 12 requested — mask too small". The spec is explicit that the UI reports the real
 * count instead of padding.
 *
 * THE SRGB CAVEAT (D10) is a single line of text that belongs in `App.tsx` near this list,
 * not per row: the pipeline assumes sRGB, so on an uncalibrated monitor this plans
 * relative harmony and does not predict absolute paint colour.
 *
 * WHAT THIS LIST IS NOT. The lightness column is a derived consequence, not a control
 * (D16) — no L slider, no value ramp, no sorting by lightness. No paint names (D11), no
 * mixing suggestions, no PNG or JSON export (D13). All withdrawn or non-goals.
 *
 * COLOUR CONTEXT (F7, section 6). The swatches are the second most colour-critical thing
 * on screen after the wheel. Keep their surroundings neutral grey and give each swatch a
 * reasonable size with generous neutral padding — simultaneous contrast will otherwise
 * shift the perceived colour, which defeats the point of the tool.
 *
 * No test file — CLAUDE.md: no UI tests.
 */
