/**
 * The wheel selector: one chip per wheel, each a real miniature of it. Spec: D53.
 *
 * WHY CHIPS RATHER THAN A DROPDOWN OR A BUTTON STACK. The panel is 224 px wide with
 * about 13 px of vertical headroom at 1280x720 — measured, and the D10 caveat has already
 * been pushed off screen twice by rows added above it. A chip row costs one row (~26 px)
 * and, unlike a dropdown, shows the choice instead of naming it, which is the right verb
 * for picking a colour surface. A stack of four labelled buttons would read better still
 * and costs four times the budget.
 *
 * Each chip renders its own wheel through the app's own `renderDisk`, so a chip cannot
 * drift from what selecting it produces — the same reason the PDF reuses that renderer.
 * They are drawn once per mount at 26 CSS px: four discs of about 2.7k pixels each, which
 * is under a millisecond in total and never redrawn, because a wheel's appearance does
 * not depend on anything in the state.
 *
 * The active wheel's NAME sits on the heading line rather than under the chips. At 26 px
 * a muted wheel and a pastel one are distinguishable but not nameable, and the label is
 * what makes the choice sayable — "triad on the muted wheel" — which is the same reason
 * D49 added numeric entry beside the sliders.
 */

import { useEffect, useRef } from 'react'
import { renderDisk } from '../color/render.ts'
import { WHEELS, type WheelId, type WheelSpec } from '../color/wheel.ts'

/** CSS pixels. Large enough to read the wheel's character, small enough for one row. */
const CHIP_SIZE = 26

type Props = {
  active: WheelId
  onSelect: (id: WheelId) => void
}

function Chip({ wheel, active, onSelect }: { wheel: WheelSpec } & Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dpr = window.devicePixelRatio || 1
  const side = Math.max(1, Math.round(CHIP_SIZE * dpr))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(renderDisk(CHIP_SIZE, dpr, wheel), 0, 0)
  }, [wheel, dpr, side])

  const selected = active === wheel.id
  return (
    <button
      type="button"
      className="wheel-chip"
      role="radio"
      aria-checked={selected}
      aria-label={`${wheel.label} wheel`}
      data-hint={`${wheel.label} wheel`}
      data-hint-body={wheel.hint}
      onClick={() => onSelect(wheel.id)}
    >
      <canvas ref={canvasRef} width={side} height={side} aria-hidden="true" />
    </button>
  )
}

export function WheelChips({ active, onSelect }: Props) {
  return (
    // A radiogroup, not a set of toggles: exactly one wheel is in use, and arrow-key
    // navigation is what a keyboard user expects from that.
    <div className="wheel-chips" role="radiogroup" aria-label="Colour wheel">
      {WHEELS.map((wheel) => (
        <Chip key={wheel.id} wheel={wheel} active={active} onSelect={onSelect} />
      ))}
    </div>
  )
}
