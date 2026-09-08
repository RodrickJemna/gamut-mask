/**
 * The colour wheel disk, drawn per pixel into a <canvas>. Spec: F1, D4, D30.
 *
 * This component owns the DOM element and nothing else. All colour maths is in
 * `color/render.ts` and `color/wheel.ts`. It takes no mask props: the disk does not
 * depend on the mask (see the caching note below).
 *
 * IMPLEMENT
 *
 *   function WheelCanvas({ size }: { size: number }): JSX.Element
 *
 * WHY CANVAS HERE AND SVG ON TOP (D4). ~125k independent pixel colours is the one thing
 * SVG cannot express; a canvas ImageData writes them directly. Conversely, hit-testing
 * and dragging handles is trivial in SVG and miserable on a canvas. So the two are
 * stacked: this canvas underneath, `MaskOverlay` as a transparent SVG on top, both the
 * same square box in a CSS grid cell (same row, same column) or with the SVG absolutely
 * positioned over the canvas. WebGL was rejected — this is one computation per resize.
 *
 * HOW IT WORKS, in the order the code should read
 *
 *   1. `useRef<HTMLCanvasElement>` for the element.
 *   2. Get the device pixel ratio: `window.devicePixelRatio ?? 1`. On a retina Mac this
 *      is 2, so a 500 CSS-px canvas needs a 1000x1000 backing store or the disk looks
 *      soft. Set `canvas.width/height` (the backing store, in device px) to `size * dpr`
 *      and the CSS `width/height` to `size` px. These are two different things; setting
 *      only one is the usual cause of a blurry or mis-scaled canvas.
 *   3. In a `useEffect` keyed on `[size, dpr]`: call `renderDisk(size, dpr)`, then
 *      `ctx.putImageData(data, 0, 0)`. Use `getContext('2d')` and bail out if it is null.
 *   4. Nothing else. No draw on every render, no requestAnimationFrame loop.
 *
 * CACHING (F1: recompute only on resize). The effect's dependency array *is* the cache
 * key. Because the component takes no mask props, a mask edit cannot re-run it — which is
 * the actual requirement. Keep it that way: if this component ever needs to know about
 * the polygon, the wash belongs in the overlay instead, which is where D28 puts it.
 *
 * RESIZE. Where `size` comes from is a layout decision, not this component's business.
 * Simplest that satisfies the spec: the parent measures its square container with a
 * `ResizeObserver` and passes the side length down, debounced or rounded to whole pixels
 * so a 1px layout jitter does not trigger a full re-render of 125k pixels. Do not observe
 * the canvas itself — its size is driven by the prop, so that is a feedback loop.
 *
 * ACCESSIBILITY / SEMANTICS. `aria-hidden` is appropriate: the disk is a continuous field
 * with no discrete content, and the sample list below is the accessible representation of
 * what the user selected. Give the canvas a `role="img"` and a short label only if it
 * stops being purely decorative.
 *
 * No test file — CLAUDE.md: no UI tests.
 */
