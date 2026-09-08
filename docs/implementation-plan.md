# Implementation plan — file map and shared conventions

Companion to `gamut-tool-spec.md` (the contract). This file says **where** things live and
fixes the conventions that more than one module depends on. Where this document and the
spec disagree, the spec wins.

Status: skeleton written, no implementation yet. Every `src/**` module below currently
contains only its instruction header.

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
    wheel.test.ts
    render.ts               disk -> ImageData, resize-keyed cache         F1, D30
    format.ts               hex + the two display numbers                 D36

  geom/
    polygon.ts              even-odd hit test, disk clamp, area/centroid  D22, D24
    polygon.test.ts
    transform.ts            rotate / scale about the centre               F5, D22
    transform.test.ts
    sample.ts               deterministic sampling: grid + Lloyd          D17, D25
    sample.test.ts

  mask/
    presets.ts              4 parametric presets                          F4, D23

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

## 4. Build order

1. `color/oklab.ts` + tests — nothing else can be checked until this is right
2. `color/wheel.ts` + tests
3. `color/render.ts`, `color/format.ts`
4. `geom/polygon.ts` + tests, `geom/transform.ts` + tests
5. `geom/sample.ts` + tests
6. `mask/presets.ts`
7. `state/types.ts`, `state/reducer.ts`
8. `index.css` / `App.css` greys, then `WheelCanvas` -> `MaskOverlay` -> `MaskPanel` -> `SampleList`

Steps 1-6 are pure functions with no React and no DOM. They carry all the tests
(CLAUDE.md: colour maths and geometry only, no UI tests).

---

## 5. Open question

`mask/presets.ts` — the spec names four presets (F4) and fixes that they are defined in
radius ratios and overwrite without confirmation (D23), but it does not define the geometry
of the **atmospheric** mask. Triad, split-complementary and analogous wedge follow from
their names. Atmospheric needs a decision before that file can be written; see the note in
`presets.ts`.
