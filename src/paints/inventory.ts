/**
 * Which paints the author actually owns, and how that survives a session. Spec: D57.
 *
 * WHY IT EXISTS. Matching against 1540 bottles answers "which paint is closest", but the
 * question at the bench is "can I paint this tonight" — and the answer depends on the
 * sixty or so pots on the shelf, not on the catalogue. D48's brand filter narrows by
 * manufacturer, which is the wrong axis for that.
 *
 * A PAINT IS IDENTIFIED BY `brand|ref`. Verified across the whole catalogue: zero
 * collisions, and none even on the bare ref. Refs are the manufacturers' own printed
 * codes — or, for Citadel, the paint's name, since it prints no codes — so they survive a
 * re-extraction of the source PDFs, which array indices would not.
 *
 * THE ENCODING NAMES THE PAINTS, and that is the whole design decision here. A bitmask
 * over the catalogue would be a flat 260 characters however many pots you own, against
 * 879 for a sixty-paint shelf — but it encodes POSITIONS, so re-extracting a catalogue and
 * shifting one entry would silently decode an old bookmark into the wrong paints. A
 * mis-decode that looks plausible is the worst failure this feature could have. Naming
 * them costs a few hundred characters and cannot go wrong that way: anything the current
 * catalogue does not contain is simply dropped, and counted, so the UI can say so.
 *
 * Measured payload sizes, base64url, which is what lands in the URL fragment:
 *
 *    20 paints ->   292 chars
 *    60 paints ->   879
 *   120 paints ->  1759
 *   300 paints ->  4399
 *
 * All far inside any URL limit for a local bookmark.
 */

import { PAINTS } from './catalogue.ts'
import type { Paint } from './types.ts'

/**
 * Bumped only if the payload's shape changes. Decoding refuses anything it does not
 * recognise rather than guessing, so an old app cannot misread a newer file.
 */
export const INVENTORY_VERSION = 1

/** The identity of a paint, stable across a re-extraction of its catalogue. */
export function paintKey(paint: Paint): string {
  return `${paint.brand}|${paint.ref}`
}

const BY_KEY: ReadonlyMap<string, Paint> = new Map(
  PAINTS.map((paint) => [paintKey(paint), paint]),
)

/** Catalogue order, so an unchanged inventory always encodes to the same string. */
const ORDER: ReadonlyMap<string, number> = new Map(
  PAINTS.map((paint, index) => [paintKey(paint), index]),
)

export function paintByKey(key: string): Paint | undefined {
  return BY_KEY.get(key)
}

export function isKnownPaint(key: string): boolean {
  return BY_KEY.has(key)
}

/**
 * Sorted into catalogue order and de-duplicated.
 *
 * Callers get a canonical list, which matters for two things that would otherwise be
 * subtly wrong: the encoded payload is then a pure function of the SET, so ticking A then
 * B and ticking B then A produce the same bookmark; and the picker's rows do not reorder
 * as boxes are ticked.
 */
export function canonicalOwned(keys: Iterable<string>): string[] {
  const known = [...new Set(keys)].filter(isKnownPaint)
  return known.sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0))
}

/** base64 -> base64url, so the payload is safe in a URL fragment with no escaping. */
const toUrlSafe = (base64: string): string =>
  base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromUrlSafe = (encoded: string): string =>
  encoded.replace(/-/g, '+').replace(/_/g, '/')

/**
 * The inventory as one compact token.
 *
 * Keys are ASCII — verified over the whole catalogue, the only punctuation being
 * `| . - '` — so `btoa` is safe without a UTF-8 dance. A newline separates entries
 * because no key contains one.
 */
export function encodeOwned(keys: Iterable<string>): string {
  const owned = canonicalOwned(keys)
  if (owned.length === 0) return ''
  return `${INVENTORY_VERSION}.${toUrlSafe(btoa(owned.join('\n')))}`
}

export type DecodedInventory = {
  owned: string[]
  /** Keys the current catalogue no longer contains. Reported rather than hidden. */
  dropped: number
}

/**
 * Reads a token back, keeping only paints this build actually has.
 *
 * Returns null for anything unreadable — a truncated URL, a hand-edited token, a version
 * from the future — so the caller can leave the inventory alone instead of silently
 * clearing a shelf the author spent an evening ticking.
 */
export function decodeOwned(token: string): DecodedInventory | null {
  const trimmed = token.trim()
  if (trimmed === '') return { owned: [], dropped: 0 }

  const separator = trimmed.indexOf('.')
  if (separator < 1) return null
  if (Number(trimmed.slice(0, separator)) !== INVENTORY_VERSION) return null

  let decoded: string
  try {
    decoded = atob(fromUrlSafe(trimmed.slice(separator + 1)))
  } catch {
    return null
  }

  const keys = decoded.split('\n').filter((key) => key !== '')
  const owned = canonicalOwned(keys)
  return { owned, dropped: new Set(keys).size - owned.length }
}
