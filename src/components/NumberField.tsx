/**
 * A small numeric input for a value that also has a slider. Spec: D49.
 *
 * Why this exists: a slider can only be dragged, so an exact value is a matter of luck
 * and a scheme cannot be written down and reproduced. "Triad at 120 degrees, 80%" should
 * be enough to get the same mask back.
 *
 * COMMIT ON BLUR OR ENTER, not per keystroke. While the field has focus it shows a local
 * draft string and the mask does not move. Dispatching on every keystroke sounds more
 * responsive but misbehaves in the obvious cases: clearing the field to retype it is
 * momentarily empty, so it would parse as nothing and either throw the mask to a default
 * or reject the edit, and typing "45" would pass through 4 first. Escape abandons the
 * draft.
 *
 * NO CLAMPING HERE. The field parses and hands the number over; the reducer already
 * normalises rotation modulo 360 and clamps size to its own range, and duplicating that
 * would give two answers to the same question. The visible consequence is deliberate:
 * typing 400 degrees leaves 40 in the box, because that is where the mask now is.
 */

import { useState, type KeyboardEvent } from 'react'

type Props = {
  /** Current value in DISPLAY units — degrees, or percent for the size. */
  value: number
  /** Advisory only, for the spinner and the keyboard: see the note above on clamping. */
  min: number
  max: number
  /** Rendered after the number, inside the field's own box. */
  suffix: string
  label: string
  onCommit: (value: number) => void
}

export function NumberField({ value, min, max, suffix, label, onCommit }: Props) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft === null) return
    const parsed = Number.parseFloat(draft)
    setDraft(null)
    // Not a number: silently revert to the real value rather than guessing what was meant.
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(null)
      event.currentTarget.blur()
    }
  }

  return (
    <span className="num">
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        // The draft while typing, the real value the rest of the time — so an edit made
        // with the slider is picked up immediately, and a half-typed number is not.
        value={draft ?? String(Math.round(value))}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span className="num-suffix">{suffix}</span>
    </span>
  )
}
