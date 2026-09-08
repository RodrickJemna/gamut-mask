/**
 * Mask presets. Spec: F4, D23.
 *
 * IMPLEMENT
 *
 *   type PresetId = 'triad' | 'split' | 'analogous' | 'atmospheric'
 *   const PRESETS: readonly { id: PresetId; label: string }[]   // labels in English (D26)
 *   buildPreset(id: PresetId, baseAngle: number): Polygon
 *
 * D23: presets are defined in **radius ratios**, not absolute chroma, and loading one
 * **overwrites the current polygon without asking**. No confirmation dialog, no undo —
 * both are out of scope. Every preset is a pure function returning a wheel-space ring.
 *
 * `baseAngle` orients the preset; the rotate slider then takes over (F5). Emit the ring
 * in a consistent winding so `signedArea` has a predictable sign across presets.
 *
 * Arcs. Any preset with a curved edge is a polygon approximation — sample the arc at a
 * fixed angular step (4-6 deg is smooth at this size) so vertex counts stay deterministic
 * and modest. The user can then drag those vertices like any other (F2).
 *
 * Keep the radii as named constants at the top of the file. They are the tuning surface
 * for how muted each preset is, and they will get adjusted by eye once the wheel renders.
 *
 * GEOMETRY
 *
 *   triad          3 vertices, 120 deg apart, all at the same radius. The classic Gurney
 *                  triangle. Note it passes near the centre, so it includes near-neutrals
 *                  along its edges — that is correct and is why the shape is useful.
 *
 *   split          split-complementary: the base hue plus the two hues flanking its
 *                  complement. So base at radius r, then two vertices at
 *                  base + 180 -+ spread. `spread` around 30 deg.
 *
 *   analogous      a wedge: a span of +-halfWidth deg around the base, bounded by an
 *                  inner and an outer radius. Two arcs joined at the ends; the inner
 *                  radius may be 0, which degenerates it to a pie slice.
 *
 *   atmospheric    NOT SPECIFIED — see below. Do not guess.
 *
 * OPEN QUESTION — the atmospheric preset. F4 lists it and D23 fixes how presets are
 * parameterised, but nothing in the spec defines its geometry, and unlike the other three
 * the name does not determine it. In Gurney's usage an atmospheric palette is a small
 * low-chroma region, often offset toward the light's hue, sometimes a narrow shape hugging
 * the centre. Several defensible shapes fit that description and they produce visibly
 * different palettes.
 *
 * This needs an answer from the author before the file is written. Candidates:
 *   (a) a small circle-ish ring near the centre, offset toward `baseAngle`
 *   (b) a narrow analogous wedge capped at a low outer radius (a muted analogous)
 *   (c) a wide, shallow arc band at low radius spanning most of the wheel
 * Do not pick one silently to make the file compile — that is the kind of invented
 * behaviour CLAUDE.md rules out. Leave `atmospheric` unimplemented and the button
 * disabled until it is decided, and say so.
 *
 * No test file: these are constants plus arithmetic, and the properties worth checking
 * (vertices inside the disk, expected count) are covered by `polygon.test.ts` on the
 * output if it ever seems worth it.
 */
