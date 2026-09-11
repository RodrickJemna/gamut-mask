/**
 * Keeping the inventory between sessions. Spec: D57.
 *
 * WHY NOT JUST `localStorage`. The app's real launch path is the bundled HTML opened from
 * disk, in Safari, and Safari blocks web storage on `file://` origins by default —
 * cookies outright, and `localStorage` behind a Develop-menu setting. So the mechanism
 * that would be the obvious choice is unavailable exactly where the app is used, and
 * anything that depends on it would appear to work for me and lose the author's shelf.
 *
 * THE URL FRAGMENT IS THE PRIMARY STORE. It needs no storage API at all, works on
 * `file://` in every browser, and survives `npm run bundle` because it lives in the
 * bookmark rather than in the file. An inventory is a few hundred characters (879 for
 * sixty paints), so it fits with room to spare. `history.replaceState` keeps it current
 * as boxes are ticked, which means a RELOAD already restores the shelf; re-bookmarking is
 * only needed to carry a change into the next cold start.
 *
 * `localStorage` is still attempted, in a try/catch, purely as a convenience where the
 * browser permits it — then even a cold start needs no bookmark. It is never depended on:
 * every read tolerates it being absent or throwing, which it does in a private window, on
 * a `file://` origin in Safari, and inside a thumbnailer.
 *
 * WHAT IS NOT HERE: the whole app state. The fragment could carry the mask, the wheel and
 * the brand filter too, but then every drag frame would rewrite the URL and need
 * throttling. The mask is cheap to redraw and the shelf is not cheap to retype, so the
 * fragment carries the shelf and the explicit save file (D58) carries everything.
 */

import { decodeOwned, encodeOwned } from '../paints/inventory.ts'

/** Named so a future payload can join it in the same fragment without ambiguity. */
const FRAGMENT_KEY = 'inv'
const STORAGE_KEY = 'mwp.inventory'

/** Reads one key out of the fragment, which is a `key=value&key=value` list. */
function fromFragment(): string | null {
  const raw = window.location.hash.replace(/^#/, '')
  if (raw === '') return null
  for (const part of raw.split('&')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq) === FRAGMENT_KEY) {
      return decodeURIComponent(part.slice(eq + 1))
    }
  }
  return null
}

function fromStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Blocked origin, private window, disabled site data: not an error, just absent.
    return null
  }
}

export type LoadedInventory = {
  owned: string[]
  /** Paints in the saved shelf that this build's catalogue no longer contains. */
  dropped: number
  source: 'fragment' | 'storage'
}

/**
 * The saved inventory, preferring the fragment.
 *
 * The fragment wins because it is the one the author can see and share: if a link says
 * one thing and the browser's storage another, the link is what they meant. Returns null
 * when there is nothing readable, which leaves the shelf alone rather than clearing it.
 */
export function loadInventory(): LoadedInventory | null {
  for (const [source, token] of [
    ['fragment', fromFragment()],
    ['storage', fromStorage()],
  ] as const) {
    if (token === null) continue
    const decoded = decodeOwned(token)
    // A token that will not decode is skipped rather than treated as an empty shelf: a
    // truncated URL must not wipe an evening's ticking.
    if (!decoded) continue
    if (decoded.owned.length === 0 && decoded.dropped === 0) continue
    return { ...decoded, source }
  }
  return null
}

/**
 * Writes the inventory to both stores.
 *
 * `replaceState`, not `pushState`: ticking a checkbox is not a navigation, and filling the
 * back button with sixty entries would make the browser's own Back button useless for
 * leaving the page.
 */
export function saveInventory(owned: readonly string[]): void {
  const token = encodeOwned(owned)

  const others = window.location.hash
    .replace(/^#/, '')
    .split('&')
    .filter((part) => part !== '' && !part.startsWith(`${FRAGMENT_KEY}=`))
  const parts = token === '' ? others : [...others, `${FRAGMENT_KEY}=${token}`]
  const hash = parts.length === 0 ? '' : `#${parts.join('&')}`

  // Only when it actually changed, or every render would push a history entry.
  if (hash !== window.location.hash && !(hash === '' && window.location.hash === '')) {
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
    } catch {
      // Some environments refuse replaceState on a file:// URL. The shelf still works for
      // this session, and storage below may still take it.
    }
  }

  try {
    if (token === '') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // See fromStorage: absence is expected, not exceptional.
  }
}

/** The shareable link for the current shelf, for a copy button. */
export function inventoryLink(owned: readonly string[]): string {
  const token = encodeOwned(owned)
  const base = `${window.location.origin}${window.location.pathname}`
  return token === '' ? base : `${base}#${FRAGMENT_KEY}=${token}`
}
