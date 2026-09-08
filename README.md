# Gamut Mask Tool

A gamut-masking and palette-planning tool for miniature painting. Draw a mask on a
YURMBY colour wheel and read off the colours inside it.

Screen-only, session-based, offline. No backend, no accounts, no build-time data.
Personal hobby project.

Reference: James Gurney, *Color and Light* — gamut masking.

## What it does

- Renders a colour wheel per pixel: angle is hue, radius is saturation
- Free polygon mask editor — drag, add and remove vertices
- Presets: triad, split complementary, analogous wedge
- Rotate and scale the mask about the wheel centre
- Lists the colours inside the mask with hex, lightness and saturation; click to copy

## What it deliberately does not do

No paint database or paint matching, no image input, no export beyond the clipboard, no
value/lightness axis, no mobile layout. These are settled decisions with reasons
recorded, not gaps — see sections 5 and 7 of the spec before proposing any of them.

## The wheel model

- **Angle** is the sRGB hue-hexagon angle. Red at the top, clockwise, the six anchors
  (R Y G C B M) exactly 60° apart. Complements sit opposite: R↔C, Y↔B, G↔M.
- **Rim** is the fully saturated sRGB colour at that hue — by definition the maximum
  chroma there, so no gamut search is needed.
- **Centre** is neutral grey at Oklab `L = 0.6`.
- **Radius** interpolates centre to rim *in Oklab*, normalised per hue: `t = 0.7` means
  70% of the way to full saturation for that hue, not an absolute chroma.

Interpolating in Oklab rather than sRGB is the only place a perceptual space appears;
sRGB interpolation makes visible mud in the mid rings, which is exactly where muted
palettes live. The stated price is that equal radii on different hues are not comparably
saturated.

The pipeline assumes sRGB. On an uncalibrated monitor it plans relative harmony; it does
not predict absolute paint colour.

## Stack

Vite, React 19, TypeScript, plain CSS. **Zero runtime dependencies beyond React and
react-dom** — the Oklab ↔ linear sRGB conversion is about 30 lines of our own code using
Ottosson's original matrices. Vitest covers the colour maths and geometry only.

The greys are functional, not decorative: the wheel is the only saturated thing on
screen so that simultaneous contrast does not distort colour judgement.

## Running it

**The easy way — no terminal, no server.** Build a single self-contained HTML file once:

```
npm install
npm run bundle
```

That writes `gamut-mask.html` (~205 KB) to the project root, with the script, stylesheet
and favicon all inlined. Open it by double-clicking; bookmark it or keep it on the Dock
and you never need a terminal again. It works with no network — there is nothing to
fetch, and no server-side anything (D8).

Rebuild it with `npm run bundle` after any code change.

**For development**, the usual Vite loop:

```
npm run dev      # dev server with HMR, Ctrl+C to stop
```

Desktop layout only (mobile is a non-goal), so give the window ~1200px of width.

## Commands

```
npm run dev      # Vite dev server with HMR
npm run bundle   # build + inline into one double-clickable gamut-mask.html
npm test         # vitest
npm run build    # tsc -b && vite build (multi-file, into dist/)
npm run preview  # serve dist/ over localhost
npm run lint     # eslint .
```

## Docs

- `docs/gamut-tool-spec.md` — the contract. Wheel model, valid decisions with rationale,
  withdrawn decisions and why, explicit non-goals. Written in Hungarian.
- `docs/implementation-plan.md` — file map, the wheel-space coordinate convention, and
  the colour pipeline end to end.
- `docs/setup-macos.md` — how the toolchain was installed. Historical reference.
