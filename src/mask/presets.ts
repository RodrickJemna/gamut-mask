/**
 * Mask presets. Spec: F4, D23, D26.
 *
 * D23: presets are defined in radius ratios, not absolute chroma, and loading one
 * overwrites the current polygon without asking. Every builder is a pure function
 * returning a wheel-space ring.
 *
 * The radii below are the tuning surface for how muted each preset is. They are named
 * constants because they will be adjusted by eye once the wheel is on screen.
 */

import { polar, type Point } from '../color/wheel.ts'
import { signedArea, type Polygon } from '../geom/polygon.ts'

export type PresetId = 'triad' | 'split' | 'analogous' | 'atmospheric'

/**
 * The presets `buildPreset` can actually produce. `atmospheric` is deliberately outside
 * this type — see the note at the bottom of the file — so it is a type error to ask for
 * it rather than something that fails at runtime.
 */
export type BuildablePresetId = Exclude<PresetId, 'atmospheric'>

export const PRESETS: readonly { id: PresetId; label: string; available: boolean }[] = [
  { id: 'triad', label: 'Triad', available: true },
  { id: 'split', label: 'Split complementary', available: true },
  { id: 'analogous', label: 'Analogous', available: true },
  { id: 'atmospheric', label: 'Atmospheric', available: false },
]

/** Triad vertices sit here; the edges then sweep in toward the neutral centre. */
const TRIAD_RADIUS = 0.82

const SPLIT_RADIUS = 0.85
/** Degrees each split arm sits either side of the base hue's complement. */
const SPLIT_SPREAD = 32

const ANALOGOUS_HALF_WIDTH = 26
const ANALOGOUS_INNER = 0.22
const ANALOGOUS_OUTER = 0.95
/** Arc sampling step in degrees — fine enough to read as a curve, coarse enough to drag. */
const ARC_STEP = 5

/**
 * Samples an arc inclusively from `fromDeg` to `toDeg` at a fixed angular step, so vertex
 * counts are deterministic and stay small enough to edit by hand (F2).
 */
function arc(fromDeg: number, toDeg: number, radius: number): Point[] {
  const span = toDeg - fromDeg
  const steps = Math.max(1, Math.ceil(Math.abs(span) / ARC_STEP))
  const out: Point[] = []
  for (let i = 0; i <= steps; i++) {
    out.push(polar(fromDeg + (span * i) / steps, radius))
  }
  return out
}

/** Consistent winding across every preset, so signedArea's sign is predictable. */
function withPositiveWinding(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly
}

export function buildPreset(id: BuildablePresetId, baseAngle: number): Polygon {
  switch (id) {
    /**
     * The classic Gurney triangle. Its edges pass close to the centre, so it includes
     * near-neutrals as well as the three hues — that is the point of the shape, not a
     * flaw in the radius choice.
     */
    case 'triad':
      return withPositiveWinding([
        polar(baseAngle, TRIAD_RADIUS),
        polar(baseAngle + 120, TRIAD_RADIUS),
        polar(baseAngle + 240, TRIAD_RADIUS),
      ])

    /** The base hue plus the two hues flanking its complement. */
    case 'split':
      return withPositiveWinding([
        polar(baseAngle, SPLIT_RADIUS),
        polar(baseAngle + 180 - SPLIT_SPREAD, SPLIT_RADIUS),
        polar(baseAngle + 180 + SPLIT_SPREAD, SPLIT_RADIUS),
      ])

    /**
     * A wedge: a band of neighbouring hues between an inner and an outer radius. The
     * outer arc runs one way and the inner arc returns, giving a closed ring.
     */
    case 'analogous':
      return withPositiveWinding([
        ...arc(baseAngle - ANALOGOUS_HALF_WIDTH, baseAngle + ANALOGOUS_HALF_WIDTH, ANALOGOUS_OUTER),
        ...arc(baseAngle + ANALOGOUS_HALF_WIDTH, baseAngle - ANALOGOUS_HALF_WIDTH, ANALOGOUS_INNER),
      ])
  }
}

/**
 * OPEN QUESTION — the atmospheric preset.
 *
 * F4 lists it and D23 fixes how presets are parameterised, but nothing in the spec
 * defines its geometry, and unlike the other three the name does not determine it. In
 * Gurney's usage an atmospheric palette is a small low-chroma region, often pulled toward
 * the light's hue, sometimes a narrow shape hugging the centre. Several shapes fit that
 * description and they produce visibly different palettes:
 *
 *   (a) a small ring near the centre, offset toward `baseAngle`
 *   (b) a narrow analogous wedge capped at a low outer radius — a muted analogous
 *   (c) a wide, shallow arc band at low radius spanning most of the wheel
 *
 * Picking one silently is exactly the invented behaviour CLAUDE.md rules out, so it is
 * absent from `BuildablePresetId` and marked `available: false` above. MaskPanel renders
 * its button disabled. Once the author decides, it is a single `case` here plus flipping
 * that flag — nothing else in the app needs to change.
 */
