/**
 * The icon on a preset button: the preset's own outline, on a circle. Spec: D55.
 *
 * DRAWN FROM THE GEOMETRY, not hand-authored. `buildPreset` supplies the polygon, so an
 * icon cannot come to disagree with the shape it loads — the same discipline as the wheel
 * chips rendering through `renderDisk` and the PDF reusing it. Retune a preset's radii and
 * its icon follows.
 *
 * The viewBox IS wheel space, as it is in MaskOverlay: x right, y down, radius 1. So the
 * polygon's coordinates are written straight in with no mapping, and the circle behind it
 * is the rim.
 */

import { useMemo } from 'react'
import { buildPreset, type PresetId } from '../mask/presets.ts'

/** A little room outside the rim so a mask touching it is not clipped by the edge. */
const VIEW = 1.16

export function PresetIcon({ id }: { id: PresetId }) {
  const path = useMemo(() => {
    const polygon = buildPreset(id, 0)
    if (polygon.length === 0) return ''
    return `M ${polygon.map((p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' L ')} Z`
  }, [id])

  return (
    <svg viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} aria-hidden="true">
      <circle
        cx="0"
        cy="0"
        r="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.34"
        vectorEffect="non-scaling-stroke"
      />
      {/* Filled as well as stroked: at this size a hairline outline of the analogous
          wedge is hard to tell from the atmospheric blob, and the fill carries the
          shape's mass, which is what distinguishes them. */}
      <path
        d={path}
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
