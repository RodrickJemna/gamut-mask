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
 * THE DRAFT IS HELD IN A REF as well as in state, and `commit` reads the ref. State alone
 * has a real ordering bug: Escape has to clear the draft and then blur the field, but
 * `blur()` dispatches the blur event SYNCHRONOUSLY while the `setDraft(null)` from a
 * moment earlier has not been applied yet, so `commit` still saw the abandoned text and
 * committed it. Typing 999 and pressing Escape rotated the mask to 279 degrees. The ref
 * updates immediately, so the abandonment is visible to the blur it causes.
 *
 * REVERTING WRITES THE DOM DIRECTLY, which needs justifying because it is not how a
 * controlled input is normally driven. Clearing the field and tabbing away left it
 * visibly EMPTY while the state was unchanged at 40 degrees: dropping the draft takes the
 * rendered `value` back to "40", but React did not write that to the node, and the
 * readout sat there lying about the mask. Measured in the browser, not deduced — and the
 * same sequence recovered in other orderings, so it is a reconciliation detail of number
 * inputs rather than something the component can express more correctly.
 *
 * So a revert assigns the canonical text through a ref as well as clearing the draft. The
 * two agree by construction — the draft being null means the rendered value IS that
 * canonical text — so this makes the DOM match the props rather than diverge from them.
 *
 * NO CLAMPING HERE. The field parses and hands the number over; the reducer already
 * normalises rotation modulo 360 and clamps size to its own range, and duplicating that
 * would give two answers to the same question. The visible consequence is deliberate:
 * typing 400 degrees leaves 40 in the box, because that is where the mask now is.
 */

import { useRef, useState, type KeyboardEvent } from 'react'

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
  const draftRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const canonical = String(Math.round(value))

  function writeDraft(next: string | null) {
    draftRef.current = next
    setDraft(next)
  }

  /** Drop the draft and put the real value back on screen. See the note above. */
  function revert() {
    writeDraft(null)
    if (inputRef.current) inputRef.current.value = canonical
  }

  function commit() {
    const pending = draftRef.current
    if (pending === null) return
    const parsed = Number.parseFloat(pending)
    // An empty or unparseable field reverts rather than guessing what was meant. So does
    // a value equal to the current one, which would otherwise leave "040" on screen.
    if (!Number.isFinite(parsed) || parsed === value) {
      revert()
      return
    }
    writeDraft(null)
    onCommit(parsed)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      // Clears the ref, so the blur this triggers finds nothing to commit.
      revert()
      event.currentTarget.blur()
    }
  }

  return (
    <span className="num">
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        // The draft while typing, the real value the rest of the time — so an edit made
        // with the slider is picked up immediately, and a half-typed number is not.
        value={draft ?? canonical}
        onChange={(e) => writeDraft(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span className="num-suffix">{suffix}</span>
    </span>
  )
}
