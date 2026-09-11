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
 * Two tiers: brand, then range. That is how the pots are labelled and how a painter looks
 * for one, and it gives the fold (D58) a unit worth folding — AK alone is five ranges and
 * 647 rows, so hiding a manufacturer you do not buy is the difference between scrolling
 * past it and not. Each range still ticks whole, which is what makes stocking a real shelf
 * tolerable: most people own a set, not a scattering.
 */

import { useDeferredValue, useMemo, useState } from 'react'
import { PAINTS } from '../paints/catalogue.ts'
import { paintKey } from '../paints/inventory.ts'
import { BRANDS, type Brand } from '../paints/types.ts'
import type { Action } from '../state/types.ts'

type Props = {
  owned: readonly string[]
  /** Brands folded shut; held by App so a close-and-reopen keeps the folds (D58). */
  folded: ReadonlySet<Brand>
  onFold: (folded: ReadonlySet<Brand>) => void
  dispatch: (action: Action) => void
  onClose: () => void
}

type Range = { range: string; keys: string[] }
type BrandGroup = { brand: Brand; keys: string[]; ranges: Range[] }

const CATALOGUE: BrandGroup[] = (() => {
  const brands = new Map<Brand, BrandGroup>()
  const ranges = new Map<string, Range>()
  for (const paint of PAINTS) {
    let brand = brands.get(paint.brand)
    if (!brand) {
      brand = { brand: paint.brand, keys: [], ranges: [] }
      brands.set(paint.brand, brand)
    }
    const id = `${paint.brand}/${paint.range}`
    let range = ranges.get(id)
    if (!range) {
      range = { range: paint.range, keys: [] }
      ranges.set(id, range)
      brand.ranges.push(range)
    }
    const key = paintKey(paint)
    brand.keys.push(key)
    range.keys.push(key)
  }
  for (const brand of brands.values()) brand.ranges.sort((a, b) => a.range.localeCompare(b.range))
  // Brand order follows BRANDS, so the dialog agrees with the filter everywhere else.
  return [...brands.values()].sort((a, b) => BRANDS.indexOf(a.brand) - BRANDS.indexOf(b.brand))
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

export function PaintPicker({ owned, folded, onFold, dispatch, onClose }: Props) {
  const [query, setQuery] = useState('')
  // Deferred, so typing stays responsive while 1540 rows are re-filtered.
  const search = useDeferredValue(query).trim().toLowerCase()
  const ownedSet = useMemo(() => new Set(owned), [owned])

  const catalogue = useMemo(() => {
    if (search === '') return CATALOGUE
    return CATALOGUE.map((brand) => {
      const ranges = brand.ranges
        .map((range) => ({
          ...range,
          keys: range.keys.filter((key) => SEARCH.get(key)?.includes(search)),
        }))
        .filter((range) => range.keys.length > 0)
      // Narrowed too, so a brand's count and its all/none button describe what is shown.
      return { ...brand, ranges, keys: ranges.flatMap((range) => range.keys) }
    }).filter((brand) => brand.ranges.length > 0)
  }, [search])

  const shown = catalogue.reduce((sum, brand) => sum + brand.keys.length, 0)

  const setKeys = (keys: string[], on: boolean) => {
    const next = new Set(owned)
    for (const key of keys) {
      if (on) next.add(key)
      else next.delete(key)
    }
    dispatch({ type: 'setOwned', keys: [...next] })
  }

  const toggleFold = (brand: Brand) => {
    const next = new Set(folded)
    // delete() reports whether it removed one, which is the fold's current state.
    if (!next.delete(brand)) next.add(brand)
    onFold(next)
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
          {catalogue.map((brand) => {
            const ownedHere = brand.keys.filter((key) => ownedSet.has(key)).length
            const all = ownedHere === brand.keys.length
            /*
              A fold never hides a search hit: a query that matched 40 paints and then
              showed a row of shut headers reads as a broken search, not as a fold. So
              searching expands everything, and the folds come back when the box clears.
            */
            const open = search !== '' || !folded.has(brand.brand)
            return (
              <section key={brand.brand} className="picker-brand">
                <h3 className="picker-brand-head">
                  <button
                    type="button"
                    className="picker-fold"
                    aria-expanded={open}
                    onClick={() => toggleFold(brand.brand)}
                    data-hint={open ? `Hide ${brand.brand}` : `Show ${brand.brand}`}
                    data-hint-body="Folds the manufacturer away. Only what is on screen changes — ticked paints stay ticked."
                  >
                    <span className="picker-caret" aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                    {brand.brand}
                  </button>
                  <span className="picker-count">
                    {ownedHere}/{brand.keys.length}
                  </span>
                  <button type="button" onClick={() => setKeys(brand.keys, !all)}>
                    {all ? 'none' : 'all'}
                  </button>
                </h3>

                {open
                  && brand.ranges.map((range) => {
                    const ownedIn = range.keys.filter((key) => ownedSet.has(key)).length
                    const whole = ownedIn === range.keys.length
                    return (
                      <section key={range.range} className="picker-range">
                        <h4 className="picker-range-head">
                          {range.range}
                          <span className="picker-count">
                            {ownedIn}/{range.keys.length}
                          </span>
                          <button type="button" onClick={() => setKeys(range.keys, !whole)}>
                            {whole ? 'none' : 'all'}
                          </button>
                        </h4>
                        <div className="picker-list">
                          {range.keys.map((key) => (
                            <label
                              key={key}
                              className={ownedSet.has(key) ? 'picker-row on' : 'picker-row'}
                            >
                              <input
                                type="checkbox"
                                checked={ownedSet.has(key)}
                                onChange={() => dispatch({ type: 'toggleOwned', key })}
                              />
                              <span
                                className="picker-swatch"
                                style={{ background: HEX.get(key) }}
                              />
                              <span className="picker-name">{LABEL.get(key)}</span>
                            </label>
                          ))}
                        </div>
                      </section>
                    )
                  })}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
