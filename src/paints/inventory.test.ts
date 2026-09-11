import { describe, expect, it } from 'vitest'
import { PAINTS } from './catalogue.ts'
import {
  INVENTORY_VERSION,
  canonicalOwned,
  decodeOwned,
  encodeOwned,
  isKnownPaint,
  paintByKey,
  paintKey,
} from './inventory.ts'

const key = (index: number) => paintKey(PAINTS[index])

describe('paint identity', () => {
  it('is unique across the whole catalogue', () => {
    const keys = PAINTS.map(paintKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('resolves back to the paint it names', () => {
    for (const index of [0, 1, 500, 1000, PAINTS.length - 1]) {
      expect(paintByKey(paintKey(PAINTS[index]))).toBe(PAINTS[index])
    }
  })

  it('does not recognise a paint the catalogue lacks', () => {
    expect(isKnownPaint('AK|NOPE')).toBe(false)
    expect(isKnownPaint('Nonsense|AK11029')).toBe(false)
    expect(paintByKey('AK|NOPE')).toBeUndefined()
  })
})

describe('canonicalOwned', () => {
  it('de-duplicates and drops unknown keys', () => {
    expect(canonicalOwned([key(5), key(5), 'AK|NOPE'])).toEqual([key(5)])
  })

  /**
   * The reason this exists: the payload must be a function of the SET, so that ticking
   * two paints in either order yields the same bookmark, and the picker's rows do not
   * reshuffle as boxes are ticked.
   */
  it('is order-independent', () => {
    const forwards = canonicalOwned([key(3), key(40), key(900)])
    const backwards = canonicalOwned([key(900), key(3), key(40)])
    expect(forwards).toEqual(backwards)
  })

  it('sorts into catalogue order', () => {
    const owned = canonicalOwned([key(900), key(3), key(40)])
    expect(owned).toEqual([key(3), key(40), key(900)])
  })
})

describe('encode and decode', () => {
  it('round-trips an inventory', () => {
    const owned = [key(0), key(7), key(700), key(1200)]
    const decoded = decodeOwned(encodeOwned(owned))
    expect(decoded).not.toBeNull()
    expect(decoded!.owned).toEqual(canonicalOwned(owned))
    expect(decoded!.dropped).toBe(0)
  })

  it('round-trips the whole catalogue', () => {
    const all = PAINTS.map(paintKey)
    const decoded = decodeOwned(encodeOwned(all))
    expect(decoded!.owned).toHaveLength(all.length)
  })

  it('round-trips an empty inventory', () => {
    expect(encodeOwned([])).toBe('')
    expect(decodeOwned('')).toEqual({ owned: [], dropped: 0 })
  })

  it('produces a URL-safe token', () => {
    const token = encodeOwned(PAINTS.slice(0, 80).map(paintKey))
    // No character here needs escaping in a fragment, which is the point of base64url.
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]+$/)
  })

  it('is stable: the same set always gives the same token', () => {
    const a = encodeOwned([key(10), key(20), key(30)])
    const b = encodeOwned([key(30), key(10), key(20), key(10)])
    expect(a).toBe(b)
  })

  /**
   * The failure this encoding was chosen to avoid. A bitmask stores POSITIONS, so
   * re-extracting a catalogue and shifting one entry would decode an old token into
   * different paints while looking perfectly valid. Naming them means an unknown key can
   * only ever be dropped, and counted.
   */
  it('drops paints the catalogue no longer has, and says how many', () => {
    const token = encodeOwned([key(1), key(2)])
    const decoded = decodeOwned(token)!
    expect(decoded.owned).toHaveLength(2)

    // Same shape of token, but naming two paints this build does not contain.
    const stale = `${INVENTORY_VERSION}.${btoa(`${key(1)}\nAK|GONE\nVallejo|99.999`)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`
    const partial = decodeOwned(stale)!
    expect(partial.owned).toEqual([key(1)])
    expect(partial.dropped).toBe(2)
  })

  /**
   * Returning null rather than an empty inventory matters: the caller must be able to
   * leave the shelf alone instead of wiping an evening's ticking because a URL got
   * truncated.
   */
  it('returns null for anything unreadable, never an empty shelf', () => {
    for (const bad of [
      'garbage',
      '1.!!!!',
      '.abc',
      '2.' + btoa('AK|AK11029'),
      `${INVENTORY_VERSION}.@@@@`,
    ]) {
      expect(decodeOwned(bad), bad).toBeNull()
    }
  })

  it('refuses a version it does not know', () => {
    const future = `${INVENTORY_VERSION + 1}.${btoa(key(1))}`
    expect(decodeOwned(future)).toBeNull()
  })

  it('stays small enough for a URL fragment', () => {
    // A realistic shelf. Measured: 60 paints is about 879 characters.
    const token = encodeOwned(PAINTS.slice(0, 60).map(paintKey))
    expect(token.length).toBeLessThan(1200)
    // Even an implausible one stays well inside any practical limit.
    expect(encodeOwned(PAINTS.map(paintKey)).length).toBeLessThan(30000)
  })
})
