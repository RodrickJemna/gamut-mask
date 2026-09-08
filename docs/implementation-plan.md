# Implementation plan — file map and shared conventions

Companion to `gamut-tool-spec.md` (the contract). This file says **where** things live and
fixes the conventions that more than one module depends on. Where this document and the
spec disagree, the spec wins.

Status: **v1 complete**. Every module below is implemented and every step of section 4 is
done. 149 tests pass (colour maths and geometry only, per CLAUDE.md); lint and `tsc -b`
are clean.

One feature is deliberately incomplete: the **atmospheric** preset, whose geometry the
spec names but never defines. See section 5 and the note in `mask/presets.ts`.

---

## 1. Tree

```
src/
  main.tsx                  entry — exists (scaffold), unchanged
  index.css                 grey scale + CSS custom properties (functional, D28/F7)
  App.tsx                   layout shell, useReducer wiring, sRGB disclaimer (D10)
  App.css                   two-column layout + 4-col sample grid

  color/
    oklab.ts                lin-sRGB <-> Oklab, gamma, chroma reduction   D3, D32
    oklab.test.ts
    wheel.ts                angle <-> hue, (angle,t) -> sRGB, anchors     D21, D34, D35
                            also defines `Point` — it defines wheel space
    wheel.test.ts
    render.ts               disk -> ImageData, resize-keyed cache         F1, D30
    format.ts               hex + the two display numbers                 D36

  geom/
    polygon.ts              even-odd hit test, disk clamp, area/centroid  D22, D24
                            imports the `Point` type from color/wheel.ts
    polygon.test.ts
    transform.ts            translate, rotate/scale about centre               F5, D22, D42
    transform.test.ts
    sample.ts               deterministic sampling: grid + Lloyd          D17, D25
    sample.test.ts

  mask/
    presets.ts              4 parametric presets                          F4, D23

  export/
    surface.ts              the drawing interface both outputs target     D43, D45
    pdf.ts                  minimal PDF writer, zero deps; Content        D43
    pdf.test.ts
    canvasSurface.ts        canvas + measuring implementations            D45
    sheet.ts                the layout, surface-agnostic and DOM-free     D43, D45
    jpeg.ts                 single-sheet JPEG (two-pass, for height)      D45
    wheelImage.ts           wheel + mask to an offscreen canvas           D43
    name.ts                 colour-derived filename, shared across formats
    name.test.ts
    download.ts             hands the file to the browser

  paints/
    types.ts                Paint, Brand, brand badges                    D40, D44
    ak.ts                   647 AK paints, GENERATED — see scripts/       D40
    vallejo.ts              650 Vallejo paints, GENERATED                 D44
    catalogue.ts            the two combined into one flat list
    match.ts                nearest per brand in Oklab + 5% tolerance     D40, D44
    match.test.ts

  state/
    types.ts                AppState + Action, JSON-serialisable          D18
    reducer.ts              the reducer                                   D14

  components/
    WheelCanvas.tsx         <canvas>, ImageData blit, resize observer     F1, D4
    MaskOverlay.tsx         SVG overlay: wash, polygon, handles, anchors  F2, F3, D4, D28
    MaskPanel.tsx           presets + rotate/size/colors sliders          F4, F5, F6
    SampleList.tsx          swatch/hex/L/t grid, click-to-copy            F6, D36
```

No `utils/`, no `hooks/`, no barrel `index.ts` files. Import module paths directly.

### Scaffold cruft to delete with the first UI commit

`src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg`,
`public/favicon.svg` (replace or drop), and the whole current body of `App.tsx` / `App.css`
/ `index.css`. `README.md` is still the Vite template text.

---

## 2. Wheel space — the one coordinate system

Every geometric value that is stored or passed between modules is in **wheel space**:

- Origin `(0,0)` = disk centre. Disk radius = `1`. Points with `hypot(x,y) <= 1` are on the disk.
- `x` grows **right**, `y` grows **down**. This matches both `<canvas>` and SVG user space,
  so no axis flip ever happens at a boundary.
- Angle `theta` in **degrees**, `0` = R = straight up = direction `(0,-1)`, increasing
  **clockwise on screen** (D21).
- Therefore:
  - `dir(theta) = (sin(theta), -cos(theta))` (degrees -> radians at the call site)
  - `angleOf(x, y) = atan2(x, -y)` in degrees, normalised to `[0, 360)`
  - `radiusOf(x, y) = hypot(x, y)`
- Anchors (D21): `R 0, Y 60, G 120, C 180, B 240, M 300`.

Consequences worth knowing before writing code:

- Polygon vertices are stored in wheel space as floats, never in pixels. That is what makes
  the state resolution-independent, resize-proof, and JSON-serialisable (D18).
- The `Point` type lives in `color/wheel.ts`, not in `geom/`, because that module defines
  wheel space and every point in the app is a wheel-space point. The geometry here is
  never generic 2D geometry, so a second home for the type would only invite drift.
- The SVG overlay uses `viewBox="-1 -1 2 2"`, so **wheel space is SVG user space** — the
  overlay does zero coordinate conversion. Only `WheelCanvas` knows about pixels.
- Because that viewBox is 2 units wide, a `stroke-width` of `1` would be half the disk.
  Every stroked element in the overlay needs `vector-effect="non-scaling-stroke"` and a
  pixel `stroke-width`, or the strokes must be expressed in units (`0.004`-ish). Pick
  `non-scaling-stroke`; it also keeps hairlines crisp at any size.
- Pointer events give client pixels. `MaskOverlay` converts once, via
  `SVGSVGElement.getScreenCTM().inverse()` applied to a `DOMPoint`. Do not hand-roll
  `getBoundingClientRect()` arithmetic — it breaks under CSS transforms and on retina.

---

## 3. Colour pipeline, end to end

```
(theta, t)  --wheel.ts-->  Oklab {L,a,b}  --oklab.ts-->  lin sRGB  --oklab.ts-->  sRGB 0..255
```

1. `rim(theta)`: the fully saturated sRGB colour at that hue — HSV(h=theta, s=1, v=1),
   i.e. a walk around the sRGB hue hexagon. No gamut search is needed or wanted (D35, D19).
2. `centre`: Oklab `{L: 0.6, a: 0, b: 0}` (D35).
3. Interpolate **linearly in Oklab** between centre and `rim(theta)` in Oklab, by `t` (D35).
4. Convert back. The sRGB gamut is not convex in Oklab, so step 3 can land outside it even
   though both endpoints are inside. When it does, scale `a` and `b` down at the same `L`
   until it fits (D3). Never clip channels silently.

Known consequence, **not** a bug to be fixed: a straight line in Oklab from neutral to the
rim holds the *Oklab* hue constant, not the sRGB hue. So an interior pixel's sRGB hue drifts
slightly from the hue its angle names, and they coincide exactly only at the rim. This is the
other half of D35's stated price (the first half being that equal radii on different hues are
not equally saturated). Correcting it per hue would reintroduce the machinery 0.9 deleted.

---

## 4. Build order — all done

1. `color/oklab.ts` + tests — nothing else can be checked until this is right
2. `color/wheel.ts` + tests
3. `color/render.ts`, `color/format.ts`
4. `geom/polygon.ts` + tests, `geom/transform.ts` + tests
5. `geom/sample.ts` + tests
6. `mask/presets.ts` (atmospheric excepted)
7. `state/types.ts`, `state/reducer.ts`
8. `index.css` / `App.css` greys, then `WheelCanvas` -> `MaskOverlay` -> `MaskPanel` -> `SampleList`

### Corrections the build forced on this document

Recorded because each one contradicts something written above or in the spec:

- **`GAMUT_EPS` must be looser than the matrices' own precision.** Ottosson's constants
  carry 10 decimals, so a round trip drifts up to 2.6e-7 and a saturated rim colour lands
  1.3e-7 outside the cube. A tighter epsilon chroma-reduces colours that are exactly on
  the boundary.
- **D35's "further out is more saturated" is not exact.** Chroma reduction clamps to the
  gamut boundary, whose chroma at constant `L` shrinks as `L` falls toward a dark rim.
  Near blue, chroma dips by up to 2.3e-4 — a fifth of an 8-bit step, invisible but real.
- **Rotation and uniform scaling commute**, so the order of the inverse steps in
  `toBasePoint` is not load-bearing. An earlier version of this plan implied otherwise.
  What actually breaks invertibility is the D22 clamp.
- **Nothing may key off `signedArea` for a mask.** It is the algebraic area, and a
  symmetric bowtie — a shape D24 explicitly permits — measures exactly zero. The sampler
  seeds its pitch from the bounding box instead.
- **D25's shortfall looks unreachable.** The pitch adapts to the mask, so a smaller mask
  just gets a finer grid; 4000 random degenerate polygons all still yielded N. The branch
  is implemented and correct but defensive.

Steps 1-6 are pure functions with no React and no DOM. They carry all the tests
(CLAUDE.md: colour maths and geometry only, no UI tests).

---

## 5. Resolved questions

All three questions that were open during the build are settled, in spec version 0.10:

- **Atmospheric preset geometry** → D38. An off-centre blob, chosen because rotation and
  scaling both pivot on the wheel centre, so an off-centre mask is the only one of the
  three candidates the existing controls cannot already produce.
- **Minimum sample spacing** → D39. Pitch floors at 0.015 wheel units, which makes D25's
  shortfall reachable rather than dead.
- **D35's wording** → amended, recording the measured chroma dip.

## 6. Known issues, not yet decided

- **Very high colour counts scroll the list column.** Above roughly 20 the samples
  column overflows and scrolls internally; the wheel and panel stay fixed. Making it fit
  would mean either truncating paint names or dropping a D36 column, so it is left.
- **Handle crowding at small mask sizes.** Handles are a fixed size in wheel space while
  the mask shrinks, so below roughly 40% size the vertices of an arc-based preset overlap.
  Scale up to edit. The spec has no notion of handle density.
- **Export lands in the browser's download folder**, not beside the HTML. No page can
  create a folder next to itself; see D43.
- **At 1280x720 the colour list still scrolls internally** with two brand rows per card;
  the wheel, controls and the D10 caveat all stay visible. It fits fully at 1512x860.
- **Paint coverage is partial, by brand.** AK: 647 from the equivalence tables (3GEN plus
  the AFV/FIG/AIR series) and the Real Colors grids; excluded are the pigment powders and
  auxiliary products, and two rows with no swatch at all (AK11001 White, AK11191 Gold).
  Vallejo: 650 across Model Color, Model Air, Game Color, Game Air and Mecha Color;
  excluded are the 73.xxx auxiliary line, varnishes and mediums, and the Metal / True
  Metallic ranges, where a flat swatch misrepresents a metallic. 45 Vallejo codes on
  chart pages have no swatch above them and are skipped.
- **Together the two brands cover 73.4% of the disk** within 5%, against 63.0% for AK
  alone. The unmatched remainder is the saturated rim, where no pigment reaches.
- **Constants awaiting a calibrated eye.** `--mask-wash-opacity` (0.58) and the preset
  radii in `mask/presets.ts` were set by eye in a browser, not on a colour-managed
  display. They are named constants for exactly this reason.

## 7. The one named later candidate

Section 7 of the spec lists saving and loading state as the only future candidate. D18 is
already satisfied — the state is JSON-serialisable in shape and has a test asserting it
survives a round trip — so this is additive and needs no refactor. `dragging` is the one
field to exclude.
