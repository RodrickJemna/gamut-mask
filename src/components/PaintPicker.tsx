/**
 * The shelf: which of the catalogued paints the author actually owns. Spec: D57.
 *
 * A DIALOG, not a panel section. 1540 checkboxes cannot live in a 224 px column that is
 * already fighting for thirteen pixels, and stocking a shelf is something you do once and
 * then leave alone — the opposite of the controls around the wheel, which exist for
 * fiddling. So it opens over the app and closes again.
 *
 * NO VIRTUALISATION. 1540 rows of a checkbox and two spans is a few thousand DOM nodes,
 * which a browser handles without help; a windowing library would be a runtime dependency
 * for a list that is opened rarely. The search box cuts it further when it matters.
 *
 * Grouped by brand then range, because that is how the pots are labelled and how a
 * painter looks for one. Each group ticks whole, which is what makes stocking a real
 * shelf tolerable: most people own a set, not a scattering.
 */

import { useDeferredValue, useMemo, useState } from 'react'
import { PAINTS } from '../paints/catalogue.ts'
import { paintKey } from '../paints/inventory.ts'
import { BRANDS, BRAND_TAG, type Brand } from '../paints/types.ts'
import type { Action } from '../state/types.ts'

type Props = {
  owned: readonly string[]
  dispatch: (action: Action) => void
  onClose: () => void
}

type Group = { brand: Brand; range: string; keys: string[] }

const GROUPS: Group[] = (() => {
  const byGroup = new Map<string, Group>()
  for (const paint of PAINTS) {
    const id = `${paint.brand} ${paint.range}`
    let group = byGroup.get(id)
    if (!group) {
      group = { brand: paint.brand, range: paint.range, keys: [] }
      byGroup.set(id, group)
    }
    group.keys.push(paintKey(paint))
  }
  // Brand order follows BRANDS, so the dialog agrees with the filter everywhere else.
  return [...byGroup.values()].sort(
    (a, b) =>
      BRANDS.indexOf(a.brand) - BRANDS.indexOf(b.brand) || a.range.localeCompare(b.range),
  )
})()

const LABEL = new Map(
  PAINTS.map((paint) => [
    paintKey(paint),
    // Citadel prints no codes, so its ref IS the name; showing both would repeat it.
    paint.name === '' ? paint.ref : `${paint.ref}  ${paint.name}`,
  ]),
)
const HEX = new Map(PAINTS.map((paint) => [paintKey(paint), paint.hex]))
const SEARCH = new Map(
  PAINTS.map((paint) => [
    paintKey(paint),
    `${paint.brand} ${paint.ref} ${paint.name} ${paint.range}`.toLowerCase(),
  ]),
)

export function PaintPicker({ owned, dispatch, onClose }: Props) {
  const [query, setQuery] = useState('')
  // Deferred, so typing stays responsive while 1540 rows are re-filtered.
  const search = useDeferredValue(query).trim().toLowerCase()
  const ownedSet = useMemo(() => new Set(owned), [owned])

  const groups = useMemo(() => {
    if (search === '') return GROUPS
    return GROUPS.map((group) => ({
      ...group,
      keys: group.keys.filter((key) => SEARCH.get(key)?.includes(search)),
    })).filter((group) => group.keys.length > 0)
  }, [search])

  const shown = groups.reduce((sum, group) => sum + group.keys.length, 0)

  const setGroup = (keys: string[], on: boolean) => {
    const next = new Set(owned)
    for (const key of keys) {
      if (on) next.add(key)
      else next.delete(key)
    }
    dispatch({ type: 'setOwned', keys: [...next] })
  }

  return (
    <div className="picker-scrim" onPointerDown={onClose}>
      {/*
        The dialog swallows pointer events so a click inside it does not reach the scrim's
        close handler; clicking outside is the expected way to dismiss this.
      */}
      <div
        className="picker"
        role="dialog"
        aria-label="My paints"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="picker-head">
          <h2>My paints</h2>
          <span className="picker-count">
            {owned.length} of {PAINTS.length} owned
          </span>
          <button type="button" className="picker-close" onClick={onClose} aria-label="Close">
            Done
          </button>
        </div>

        <div className="picker-tools">
          <input
            type="search"
            value={query}
            placeholder="Search name, code or range"
            aria-label="Search paints"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {search !== '' && <span className="picker-count">{shown} shown</span>}
          {owned.length > 0 && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'setOwned', keys: [] })}
              data-hint="Clear the shelf"
              data-hint-body="Unticks every paint. The mask, the wheel and the brand filter are untouched."
            >
              Clear all
            </button>
          )}
        </div>

        <div className="picker-groups">
          {groups.map((group) => {
            const ownedHere = group.keys.filter((key) => ownedSet.has(key)).length
            const all = ownedHere === group.keys.length
            return (
              <section key={`${group.brand}/${group.range}`}>
                <h3>
                  <span className="brand-tag">{BRAND_TAG[group.brand]}</span>
                  {group.range}
                  <span className="picker-count">
                    {ownedHere}/{group.keys.length}
                  </span>
                  <button type="button" onClick={() => setGroup(group.keys, !all)}>
                    {all ? 'none' : 'all'}
                  </button>
                </h3>
                <div className="picker-list">
                  {group.keys.map((key) => (
                    <label
                      key={key}
                      className={ownedSet.has(key) ? 'picker-row on' : 'picker-row'}
                    >
                      <input
                        type="checkbox"
                        checked={ownedSet.has(key)}
                        onChange={() => dispatch({ type: 'toggleOwned', key })}
                      />
                      <span className="picker-swatch" style={{ background: HEX.get(key) }} />
                      <span className="picker-name">{LABEL.get(key)}</span>
                    </label>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
