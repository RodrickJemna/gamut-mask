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
- Lists the mask's own palette — its centre, corners and edge midpoints — grouped by
  wheel wedge, with hex, lightness and saturation; click to copy
- Matches each colour against two brands — AK Interactive (647 paints) and Vallejo
  (650) — listing whichever are within 5%, or saying so plainly when neither is
- Checkboxes to choose which manufacturers' catalogues to match against
- Drag inside the mask to move it; drag handles to reshape it
- Hover (or tab to) a colour in the list to ring its position on the wheel
- Saves the current wheel, mask and palette as a printable A4 PDF or a single JPEG

## What it deliberately does not do

No image input, no PNG/JSON export, no paint *mixing* simulation, no
value/lightness axis, no mobile layout. These are settled decisions with reasons
recorded, not gaps — see sections 5 and 7 of the spec before proposing any of them.

Paint matching was itself a settled *non*-goal (D11) until new requirements reopened it
in 0.11; it is now D40.

## Which colours get listed

The palette is the mask's geometry, in two rings: its **centre**; each **vertex** and the
**midpoint of each edge**; and the **halfway point from each of those to the centre**.

For a triad that is thirteen colours — three hues at the corners (82% saturation), three
muted mixtures along the edges and three half-strength corners (both 41%), three
half-strength edge mixtures (~21%), and the neutral. A limited palette with its own muted
range, which is what you get by pulling each colour toward the neutral you mix on.

Colours closer together than 5% in Oklab are dropped, which is the same tolerance used
for paint matching: two colours nearer than that resolve to the same bottle, so listing
both is noise. That matters for the arc-based presets, whose vertices exist to make a
curve smooth rather than to mark anything.

The count follows the shape rather than a slider — add a vertex and you get four more
candidates. Measured: triad 13, split complementary 12, analogous 9, atmospheric 11.

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

## Paint matching

Each sample is matched to the nearest paint by Euclidean distance in Oklab — equal
numeric steps there are roughly equal perceptual steps, so nearest-in-Oklab is
defensible where nearest-in-sRGB would not be. Beyond 5% difference (100% being an
Oklab distance of 1) the row says "No paint found" but still shows the colour and how
far off the nearest bottle was.

**Brands are matched independently**, so a colour can match AK, Vallejo, both or
neither, and the row lists whichever qualify. Collapsing to one global nearest would
hide the fact that the other brand also has something usable.

A checkbox per manufacturer chooses which catalogues to search — the answer to "too many
matches" as more catalogues are added. Unchecking all of them turns paint matching off,
which shows no paint lines at all rather than "No paint found": nothing was searched, so
claiming nothing was found would be a different and false statement.

Expect the saturated rim to be mostly unmatched. Real pigment does not reach sRGB
primary saturation. Measured over the disk: AK alone covers 63.0% within 5%, Vallejo
69.8%, the two together 73.4%, and 59.4% of the disk matches both.

**What the paint colours are**: the swatches printed in the manufacturer's catalogue —
their own renderings, not spectrophotometer readings of dried paint. Combined with D10
(the pipeline assumes sRGB and does not predict absolute paint colour), a match means
"this bottle is in the right region", not "this bottle is this colour".

Regenerate the catalogues with `scripts/extract-paints.py` (AK) and
`scripts/extract-vallejo.py` (Vallejo), then `scripts/generate-catalogue.py`. They need
`pdfplumber`, `pypdf` and `pillow` in a virtualenv, and the Vallejo one also uses macOS
Quick Look to rasterise pages — its swatch colours are sampled from rendered pixels,
because on some pages the vector fill cannot be resolved to RGB. All build-time only;
nothing in the app imports any of it.

## Exporting a sheet

Two buttons write the same sheet — the wheel with the mask, the mask settings, and the
colours with their paint matches — as either a paginated A4 PDF or one continuous JPEG.
Both are named `gamut-<hash>.<ext>` from the colours themselves, so re-exporting the same
palette does not accumulate near-duplicates and the two formats of one palette sort
together.

The layout is written once and rendered through a small `Surface` interface that both the
PDF content stream and a canvas implement. Two separate layouts would have drifted apart
on the first change to either.

It lands in your browser's download folder. A web page cannot create a folder next to its
own HTML file and write into it: there is no such API, and the closest thing needs a
user-granted directory handle, is missing in Safari, and does not work on `file://`
origins regardless.

The PDF writer is about 250 lines of our own code, because zero runtime dependencies (D37)
applies here too and the document needed is narrow: one page, filled rectangles, base-14
Helvetica, one embedded JPEG. The wheel goes in as a bitmap; everything else is real PDF
text and vectors, so the sheet prints crisply and the hex codes can be selected out of it.

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
