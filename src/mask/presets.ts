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
import { clampPolygon, signedArea, type Polygon } from '../geom/polygon.ts'

export type PresetId = 'triad' | 'split' | 'analogous' | 'atmospheric'

/** Every preset is buildable now that atmospheric has a geometry. */
export type BuildablePresetId = PresetId

export const PRESETS: readonly { id: PresetId; label: string; available: boolean }[] = [
  { id: 'triad', label: 'Triad', available: true },
  { id: 'split', label: 'Split complementary', available: true },
  { id: 'analogous', label: 'Analogous', available: true },
  { id: 'atmospheric', label: 'Atmospheric', available: true },
]

/** Triad vertices sit here; the edges then sweep in toward the neutral centre. */
const TRIAD_RADIUS = 0.82

const SPLIT_RADIUS = 0.85
/** Degrees each split arm sits either side of the base hue's complement. */
const SPLIT_SPREAD = 32

const ANALOGOUS_HALF_WIDTH = 26
const ANALOGOUS_INNER = 0.22
const ANALOGOUS_OUTER = 0.95

/**
 * Target spacing between arc vertices, in wheel units. Fine enough to read as a curve,
 * coarse enough that every handle can still be grabbed individually (F2).
 */
const ARC_CHORD = 0.09

/**
 * Atmospheric: a rounded blob pushed off-centre along the base hue, overlapping the
 * neutral point. Distance from the wheel centre to the blob's centre, then its radius.
 * It reaches out to 0.62 and contains the origin with room to spare.
 */
const ATMO_OFFSET = 0.28
const ATMO_RADIUS = 0.34
const ATMO_VERTICES = 14

/**
 * Samples an arc inclusively from `fromDeg` to `toDeg`, spacing vertices by roughly
 * ARC_CHORD along the arc rather than by a fixed angle.
 *
 * A fixed angular step looks fine on the outer arc and collapses on the inner one: arc
 * length scales with radius, so the same 5 degrees that spaces handles nicely at r = 0.95
 * piles them into an unclickable overlapping cluster at r = 0.22. That is exactly what
 * the analogous wedge looked like before this was chord-based.
 */
function arc(fromDeg: number, toDeg: number, radius: number): Point[] {
  const span = toDeg - fromDeg
  const arcLength = Math.abs(span) * (Math.PI / 180) * radius
  const steps = Math.max(1, Math.ceil(arcLength / ARC_CHORD))
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

    /**
     * Atmospheric. See the reasoning note at the bottom of the file — the short version
     * is that this is the only preset whose defining property is limited chroma rather
     * than a hue relationship, and the only one that is OFF-CENTRE.
     */
    case 'atmospheric': {
      const centre = polar(baseAngle, ATMO_OFFSET)
      const ring: Point[] = []
      for (let i = 0; i < ATMO_VERTICES; i++) {
        // Spokes are measured FROM the base angle, not from 0, so the whole 14-gon turns
        // rigidly with the base hue. With absolute spokes the blob's centre moved but
        // its vertex phase did not, so the polygon at one base angle was not a rotation
        // of the polygon at another — congruent as circles, but not as polygons.
        const spoke = polar(baseAngle + (i * 360) / ATMO_VERTICES, ATMO_RADIUS)
        ring.push({ x: centre.x + spoke.x, y: centre.y + spoke.y })
      }
      return withPositiveWinding(clampPolygon(ring))
    }
  }
}

/**
 * WHY THE ATMOSPHERIC PRESET IS SHAPED LIKE THIS.
 *
 * The spec names it (F4) but never defines its geometry, and unlike the other three the
 * name does not determine it. Three shapes were on the table:
 *
 *   (a) a blob near the centre, offset toward `baseAngle`
 *   (b) a narrow analogous wedge capped at a low outer radius — a muted analogous
 *   (c) a wide, shallow band at low radius spanning most of the wheel
 *
 * (b) is rejected as redundant: loading Analogous and pulling the size slider down
 * already produces it, and a preset that duplicates an existing preset plus one slider
 * is dead weight on the panel.
 *
 * (c) is rejected for nearly the same reason: a low-radius band spanning most of the
 * wheel is approximately a small disk about the centre, which is what the size slider
 * does to any preset.
 *
 * (a) is the one that adds capability the rest of the UI cannot reach. Rotation and
 * scaling both pivot on the wheel CENTRE (F5), so every other mask stays centred; an
 * off-centre mask is not reachable by any combination of the existing controls. That
 * makes it the only genuinely new shape of the three, and it happens to be the one that
 * matches what atmospheric haze does: everything desaturates and leans toward one hue.
 *
 * The geometry: a 14-gon of radius 0.34 whose centre sits 0.28 out along the base hue.
 * It therefore contains the neutral point (0.28 < 0.34) and reaches out to 0.62. So the
 * palette is near-neutrals of every hue, plus progressively more saturated versions of
 * the base hue only — which is the point.
 *
 * It also gives the two sliders a natural reading for this preset specifically: rotate
 * chooses the atmosphere hue, size chooses how hazy.
 *
 * Clamped on construction for safety; at these constants nothing actually clamps.
 */
