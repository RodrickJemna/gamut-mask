/**
 * SVG overlay above the wheel: the outside-mask wash, the anchor rays and letters, the
 * mask outline, and its draggable vertex handles.
 * Spec: F2, F3, D4, D22, D24, D28, D34.
 *
 * COORDINATES. The viewBox makes wheel space identical to SVG user space, so a vertex at
 * {x: 0.5, y: -0.3} is written as cx="0.5" cy="-0.3" with no conversion at any rendered
 * size. The box is widened by VIEW_MARGIN because the six anchor letters sit outside the
 * disk (D34) and would otherwise be clipped.
 */

import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { ANCHORS, dir, polar, type Point } from '../color/wheel.ts'
import { centroidExtent, minAdjacentDistance } from '../geom/polygon.ts'
import type { Action } from '../state/types.ts'

/** Keep in step with the `.wheel-disk` inset in App.css: inset = (1 - 1/margin) / 2. */
const VIEW_MARGIN = 1.2

const LETTER_RADIUS = 1.09
const HANDLE_RADIUS = 0.028
/**
 * Ring drawn around the sample the pointer is over in the colour list (D46).
 *
 * Sized against real spacing rather than the sampler's floor: twelve samples in a triad
 * sit roughly 0.27 apart and thirty-two about 0.17, so a 0.05 radius is easy to spot
 * without touching its neighbours.
 */
const HIGHLIGHT_RADIUS = 0.05
/**
 * Handles get an invisible hit area larger than their visible dot. Without it, the drawn
 * radius (~7 CSS px) is comparable to the edge hit-target's stroke, so reaching for a
 * handle lands on the edge instead and ADDS a vertex — which is a genuinely irritating
 * way to lose your shape. Grab beats insert whenever the two overlap.
 */
const HANDLE_HIT_RADIUS = 0.055
/** Thin enough that it does not compete with the handles it sits between. */
const EDGE_HIT_WIDTH = 9

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * HANDLE CROWDING. The radii above are the sizes at full spread. They are constants in
 * wheel space, but the DISTANCE BETWEEN VERTICES is not: it shrinks with the size slider
 * and with any reshaping, so at some point the handles collide and a mask becomes
 * uneditable without scaling it back up first.
 *
 * It is not a small-mask-only problem. The arc presets space their vertices ARC_CHORD =
 * 0.09 apart, and two hit circles of radius 0.055 overlap below 0.11 — so the analogous
 * and atmospheric outlines already had overlapping hit areas at 100% size, where the
 * handle you grabbed depended on SVG paint order rather than on which one you aimed at.
 *
 * So all four interaction sizes are scaled by one factor derived from the closest
 * adjacent pair. Equal circles spaced `d` apart stop overlapping at exactly `d / 2`,
 * which is therefore the target rather than a tuned fraction of it: any larger and a
 * click near the midpoint of a short edge grabs the wrong vertex, any smaller and the
 * handles are needlessly hard to hit.
 *
 * Note this must scale the EDGE hit width too. Grab-beats-insert (see HANDLE_HIT_RADIUS)
 * only holds while the handle's hit radius stays larger than half the edge stroke, so
 * shrinking one without the other would make the handles of a small mask insert vertices
 * instead of dragging them — trading one bug for a worse one.
 */
function interactionScale(polygon: Point[]): number {
  const gap = minAdjacentDistance(polygon)
  return clamp(gap / 2 / HANDLE_HIT_RADIUS, MIN_INTERACTION_SCALE, 1)
}

/**
 * Floor for the scale above. Below this the handles stop being pointable at all, so
 * crowding is the lesser evil: they overlap again and the answer is to scale the mask up
 * to edit it, which is what the floor advertises by refusing to shrink further.
 *
 * At the 470px cap on `.wheel` one wheel unit is ~196px, so 0.3 leaves a visible dot of
 * about 1.6px radius inside a 3.2px hit target. That is already marginal; it is the limit
 * of the approach, not a preference.
 */
const MIN_INTERACTION_SCALE = 0.3

/**
 * The highlight ring (D46) is sized against the MASK, not against the handles. Vertex
 * spacing says nothing about it: a triad's vertices stay far apart at any size, while its
 * samples crowd together, so a fixed 0.05 ring on a mask scaled to 20% enclosed the whole
 * shape instead of pointing at one colour inside it.
 *
 * Samples sit at the centre, the vertices and the edge midpoints (D47), so the tightest
 * spacing scales with how far the mask reaches from its own centre. A fifth of that reach
 * stays clear of the neighbouring sample and still reads as a ring.
 */
const HIGHLIGHT_EXTENT_FRACTION = 0.2

/**
 * The disk as two arcs. A single 360-degree arc is degenerate in SVG and renders as
 * nothing at all.
 */
const DISK_PATH = 'M -1 0 A 1 1 0 0 1 1 0 A 1 1 0 0 1 -1 0 Z'

/** Static, so computed once rather than per render. */
const RAYS = ANCHORS.map((anchor) => ({
  ...anchor,
  end: dir(anchor.angle),
  letter_at: polar(anchor.angle, LETTER_RADIUS),
}))

function toPath(polygon: Point[]): string {
  if (polygon.length === 0) return ''
  return `M ${polygon.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`
}

type Props = {
  /** The DISPLAY polygon — offset, rotation and size already applied. */
  polygon: Point[]
  /** Current base-space offset, so a body drag can be expressed relative to its start. */
  offset: Point
  /** The sample the colour list is pointing at, or null (D46). */
  highlight: Point | null
  canDelete: boolean
  dispatch: (action: Action) => void
}

export function MaskOverlay({ polygon, offset, highlight, canDelete, dispatch }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  /**
   * Where a body drag started, and the offset it started from. Held in a ref rather than
   * in state: it is pure gesture bookkeeping, nothing renders from it, and keeping it out
   * of the reducer means a drag frame dispatches exactly one action.
   */
  const bodyDrag = useRef<{ from: Point; offsetAtStart: Point } | null>(null)

  /**
   * Pointer events arrive in client pixels. Convert with the SVG's own matrix rather than
   * getBoundingClientRect arithmetic, which breaks under any CSS transform and needs
   * manual dpr handling. This is the only pixel-aware code in the file.
   */
  function toWheel(event: ReactPointerEvent): Point | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const dom = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    return { x: dom.x, y: dom.y }
  }

  function onHandleDown(event: ReactPointerEvent, index: number) {
    // Alt-click deletes; F2 allows it down to three vertices and the reducer enforces that.
    if (event.altKey) {
      event.preventDefault()
      dispatch({ type: 'deleteVertex', index })
      return
    }
    event.preventDefault()
    // Pointer capture keeps the drag alive when the pointer leaves the element or the
    // window — the alternative is window listeners in an effect, which is more code and
    // easier to leak.
    event.currentTarget.setPointerCapture(event.pointerId)
    dispatch({ type: 'beginDrag', index })
  }

  function onHandleMove(event: ReactPointerEvent, index: number) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const at = toWheel(event)
    if (at) dispatch({ type: 'moveVertex', index, to: at })
  }

  function onHandleUp(event: ReactPointerEvent) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dispatch({ type: 'endDrag' })
  }

  /**
   * D42 — dragging anywhere inside the mask moves the whole mask.
   *
   * The delta is sent with the offset the gesture started from, rather than as an
   * increment, so the mask tracks the pointer exactly even if a move event is coalesced
   * or dropped.
   */
  function onBodyDown(event: ReactPointerEvent) {
    const at = toWheel(event)
    if (!at) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    bodyDrag.current = { from: at, offsetAtStart: offset }
  }

  function onBodyMove(event: ReactPointerEvent) {
    const drag = bodyDrag.current
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const at = toWheel(event)
    if (!at) return
    dispatch({
      type: 'dragMask',
      deltaDisplay: { x: at.x - drag.from.x, y: at.y - drag.from.y },
      offsetAtStart: drag.offsetAtStart,
    })
  }

  function onBodyUp(event: ReactPointerEvent) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    bodyDrag.current = null
  }

  function onEdgeDown(event: ReactPointerEvent, afterIndex: number) {
    const at = toWheel(event)
    if (at) dispatch({ type: 'addVertex', at, afterIndex })
  }

  /**
   * Interaction sizes for THIS shape. Cheap enough to recompute every render — one pass
   * over the vertices, against a polygon that is itself rebuilt on every drag frame.
   */
  const scale = interactionScale(polygon)
  const handleRadius = HANDLE_RADIUS * scale
  const hitRadius = HANDLE_HIT_RADIUS * scale
  const edgeHitWidth = EDGE_HIT_WIDTH * scale
  const highlightRadius = Math.min(
    HIGHLIGHT_RADIUS,
    HIGHLIGHT_EXTENT_FRACTION * centroidExtent(polygon),
  )

  const half = VIEW_MARGIN
  return (
    <svg
      className="wheel-overlay"
      ref={svgRef}
      viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/*
        D28 — outside the mask is DIMMED, not cut away, so the surrounding hues stay
        available as reference. One path, two subpaths (disk then mask), even-odd so the
        mask becomes a hole and the fill covers exactly disk-minus-mask. This must be the
        same rule geom/polygon.ts and the sampler use, or the shading and the list
        disagree.
      */}
      <path
        d={`${DISK_PATH} ${toPath(polygon)}`}
        fillRule="evenodd"
        fill="var(--mask-wash)"
        opacity="var(--mask-wash-opacity)"
      />

      {/*
        F3/D34 — the six anchors are always drawn and cannot be hidden. pointer-events
        none on the whole group: it is a scale, not a control, and must never swallow a
        click meant for a handle.
      */}
      <g pointerEvents="none">
        {RAYS.map((ray) => (
          <g key={ray.letter}>
            <line
              x1="0"
              y1="0"
              x2={ray.end.x}
              y2={ray.end.y}
              stroke="var(--mask-line)"
              strokeWidth="1"
              opacity="0.34"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={ray.letter_at.x}
              y={ray.letter_at.y}
              fontSize="0.085"
              fill="var(--text-muted)"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {ray.letter}
            </text>
          </g>
        ))}
      </g>

      {/*
        D42 — the mask body, invisible but grabbable, so dragging the inside moves the
        whole mask. Drawn before the outline, edges and handles so all three keep
        priority: grabbing a vertex or clicking an edge must never be intercepted by the
        body underneath it. Even-odd so the grabbable region is exactly the region the
        wash leaves unshaded.
      */}
      <path
        d={toPath(polygon)}
        fillRule="evenodd"
        fill="transparent"
        pointerEvents="fill"
        style={{ cursor: 'move' }}
        onPointerDown={onBodyDown}
        onPointerMove={onBodyMove}
        onPointerUp={onBodyUp}
        onPointerCancel={onBodyUp}
      />

      {/* The mask outline. Unfilled — the wash already handles the fill. */}
      <path
        d={toPath(polygon)}
        fill="none"
        stroke="var(--mask-line)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />

      {/* Invisible thick edges, for inserting a vertex between the right pair (F2). */}
      {polygon.map((p, i) => {
        const next = polygon[(i + 1) % polygon.length]
        return (
          <line
            key={`edge-${i}`}
            x1={p.x}
            y1={p.y}
            x2={next.x}
            y2={next.y}
            stroke="transparent"
            strokeWidth={edgeHitWidth}
            pointerEvents="stroke"
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'copy' }}
            onPointerDown={(e) => onEdgeDown(e, i)}
          />
        )
      })}

      {/* The visible dots. Inert — the transparent hit circles below carry the events. */}
      {polygon.map((p, i) => (
        <circle
          key={`handle-${i}`}
          cx={p.x}
          cy={p.y}
          r={handleRadius}
          fill="var(--mask-line)"
          stroke="var(--mask-wash)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          opacity={canDelete ? 1 : 0.65}
          pointerEvents="none"
        />
      ))}

      {/*
        D46 — a ring around the hovered sample. Two concentric strokes, dark then light,
        so it stays visible over any hue underneath, and pointer-events none because it
        sits inside the mask directly on top of the body drag area.
      */}
      {highlight && (
        <g pointerEvents="none">
          <circle
            cx={highlight.x}
            cy={highlight.y}
            r={highlightRadius}
            fill="none"
            stroke="var(--mask-wash)"
            strokeWidth="4"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
          <circle
            cx={highlight.x}
            cy={highlight.y}
            r={highlightRadius}
            fill="none"
            stroke="var(--mask-line)"
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}

      {/* Hit areas last, so a handle always wins over the edge underneath it. */}
      {polygon.map((p, i) => (
        <circle
          key={`hit-${i}`}
          cx={p.x}
          cy={p.y}
          r={hitRadius}
          fill="transparent"
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => onHandleDown(e, i)}
          onPointerMove={(e) => onHandleMove(e, i)}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        />
      ))}
    </svg>
  )
}
