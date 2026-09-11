# MWP — Gamut Mask Tool

Personal hobby project: a gamut-masking / palette-planning tool for miniature painting.
Screen-only, session-based, offline. No backend.

## Read first

`docs/gamut-tool-spec.md` is the contract. It is written in Hungarian and contains:

- section 2: the wheel model (the only real math in the project)
- section 4: **valid decisions**, each with its rationale
- section 5: **withdrawn decisions** — do not reintroduce these, the reasons are listed
- section 7: explicit non-goals

Read sections 4 and 5 before proposing anything. Several obvious-looking improvements
(image input, export, value/lightness axis, absolute-chroma radius, runtime gamut cusp
search) were deliberately removed and must not come back.

Paint matching is the one exception: it was D11 ("not even later") and was reopened by
the author in 0.11. It now exists as D40, with the catalogues in `src/paints/` — three
brands as of D52. D11 is in section 5 with the rest of the withdrawn decisions.

`BRANDS` in `src/paints/types.ts` is the single list the brand filter (D48), the
reachability fields (D50) and the sheet's row height derive from, so adding a catalogue is
that line plus a data module.

`docs/setup-macos.md` documents how the toolchain was installed. Historical reference.

## Phase

Design is closed. **Implementation phase.** Code decisions are delegated:

- Don't ask permission for ordinary implementation choices. Make them, build, note
  anything notable in a couple of lines afterwards.
- Ask only when a choice would visibly change agreed behavior, or would be expensive
  to reverse.
- Deliver working code, not scaffolding. No placeholder logic, no invented APIs,
  no "fill this in".
- If a spec requirement is being deferred, say so and why. Never drop one silently to
  make the code simpler.

## Stack (fixed by the spec)

Vite + React 19 + TypeScript. Vitest for tests. ESLint from the scaffold.
Plain CSS with custom properties — the exact greys are functional, not decorative.

**Zero runtime dependencies beyond React and react-dom.** Do not add culori, zustand,
Tailwind, a router, or a component library. State is small enough for `useReducer`.

The paint catalogues in `src/paints/` are generated data, not a dependency. One extractor
per brand — `scripts/extract-paints.py` (AK), `extract-vallejo.py`, `extract-proacryl.py`,
`extract-citadel.py` — then `scripts/generate-catalogue.py --<brand> <json>` writes the
module. They need pdfplumber, pypdf and Pillow in a throwaway virtualenv; Vallejo and Pro
Acryl also rasterise with macOS `qlmanage`, and Citadel additionally runs OCR through
`scripts/ocr-vision.swift` because its source has no text layer at all. All build-time
only, and nothing in the app imports any of it.

Each extractor's docstring records the traps in its PDF and the measurements behind its
thresholds. Read it before changing one; every constant in there was arrived at by
measuring, not by taste.

The Oklab ↔ linear sRGB conversion is our own ~30 lines, using Ottosson's original
matrices. It exists only to interpolate the centre-to-rim transition. It is not a
general colour library and should not grow into one.

`PRESETS` in `src/mask/presets.ts` is the list of mask shapes (D55); their buttons draw
their icons from `buildPreset`, so a shape and its icon cannot drift apart.

`WHEELS` in `src/color/wheel.ts` is the list of colour wheels (D53). A wheel is a centre
and a rim, nothing more, and everything downstream takes it as an argument — so adding a
variant in that group is one entry. Where a function renders an IMAGE the wheel is a
required parameter, never defaulted: a default there renders a disk that silently
contradicts the colour list, which is a bug this project has already shipped once.

## Working style

- Terse. No preamble, no restating the question, no filler enthusiasm.
- Disagree openly when something is technically weak, over-engineered, or scope creep,
  and say what you would do instead. Agreeing with a bad plan is the main failure mode.
- The author programs for a living; skip programming basics and don't over-caveat.
  Frontend is the weak area, so explain UI code slightly more than logic code.
- Answer in the language the author writes in (Hungarian or English).

## Fidelity rules

Colour-space formulas must be correct or flagged as uncertain. Plausible-looking wrong
maths is the most expensive failure in this project. Don't invent library APIs, package
versions, or colour-science constants — verify first.

## Commands

```
npm run dev      # Vite dev server, foreground, Ctrl+C to stop
npm test         # vitest
npm run build    # tsc -b && vite build
npm run lint     # eslint .
```

## Test priorities

Colour maths and geometry only; no UI tests.

- Oklab round-trip accuracy
- chroma reduction when the interpolated colour falls outside sRGB
- point-in-polygon with the even-odd rule, including non-convex and self-intersecting
  polygons
- sampling determinism: identical mask input must produce an identical sample list

## Git

Small, logical commits with clear messages. Never commit `node_modules`, `dist`,
or anything generated.
