/**
 * The hover explanation. Spec: D56.
 *
 * Replaces the native `title` tooltips, which take about a second to appear, cannot be
 * styled, and truncate the multi-line text this app wants to show. For a panel this dense
 * the delay is the problem: you point at "S 41%" to find out what it means, not to wait.
 *
 * DRIVEN BY DATA ATTRIBUTES, listened for at the document, so nothing has to be threaded
 * through the component tree. Any element opts in with `data-hint` (the title) and
 * optionally `data-hint-body`; the nearest such ancestor wins, which means a button's
 * inner canvas or span inherits its owner's hint without extra markup. The alternative —
 * a context plus a prop on every control — is a lot of plumbing for a tooltip, and it is
 * the kind of thing that ends up half-applied.
 *
 * Positioned from the target's own rect rather than the pointer: it then does not jitter
 * as the mouse moves inside a card, and it can be shown for KEYBOARD focus too, where
 * there is no pointer position to use at all.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Clear of the viewport edge, and of the element the tip belongs to. */
const EDGE = 8
const OFFSET = 6

type Hint = { title: string; body: string; rect: DOMRect }

export function HintTip() {
  const [hint, setHint] = useState<Hint | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState({ left: 0, top: 0 })

  useEffect(() => {
    const read = (target: EventTarget | null): Hint | null => {
      if (!(target instanceof Element)) return null
      const owner = target.closest('[data-hint]')
      if (!(owner instanceof HTMLElement)) return null
      return {
        title: owner.dataset.hint ?? '',
        body: owner.dataset.hintBody ?? '',
        rect: owner.getBoundingClientRect(),
      }
    }

    const show = (event: Event) => setHint(read(event.target))
    const hide = (event: Event) => {
      // Only clear when the pointer actually leaves the hinted element, or moving across
      // a card's own children would flicker the tip off and on.
      const next = read((event as PointerEvent).relatedTarget ?? null)
      if (!next) setHint(null)
    }

    document.addEventListener('pointerover', show)
    document.addEventListener('pointerout', hide)
    document.addEventListener('focusin', show)
    document.addEventListener('focusout', () => setHint(null))
    // A scroll or a wheel change moves the target out from under the tip.
    window.addEventListener('scroll', () => setHint(null), true)
    return () => {
      document.removeEventListener('pointerover', show)
      document.removeEventListener('pointerout', hide)
      document.removeEventListener('focusin', show)
      document.removeEventListener('focusout', () => setHint(null))
    }
  }, [])

  /**
   * Measured after render, because the tip's own size decides whether it fits below the
   * target and how far it must be nudged off the viewport edge.
   */
  useLayoutEffect(() => {
    const tip = tipRef.current
    if (!hint || !tip) return
    const { width, height } = tip.getBoundingClientRect()
    const below = hint.rect.bottom + OFFSET
    const fitsBelow = below + height + EDGE <= window.innerHeight
    setPlacement({
      left: Math.min(
        Math.max(EDGE, hint.rect.left + hint.rect.width / 2 - width / 2),
        window.innerWidth - width - EDGE,
      ),
      top: fitsBelow ? below : Math.max(EDGE, hint.rect.top - height - OFFSET),
    })
  }, [hint])

  if (!hint || (!hint.title && !hint.body)) return null

  return (
    <div
      className="hint-tip"
      ref={tipRef}
      role="tooltip"
      style={{ left: placement.left, top: placement.top }}
    >
      {hint.title && <span className="hint-title">{hint.title}</span>}
      {hint.body && <span className="hint-body">{hint.body}</span>}
    </div>
  )
}
