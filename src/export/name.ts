/**
 * Filename for an exported sheet. Spec: D43.
 *
 * Derived from the colours themselves, so the same palette always produces the same
 * name. That is deliberate: re-exporting a palette you already saved overwrites or is
 * recognised as the same sheet, rather than littering the folder with near-duplicates.
 * A timestamp would guarantee uniqueness at the cost of that property.
 */

/**
 * FNV-1a, 32-bit. A non-cryptographic hash is the right tool here — this only has to
 * distinguish palettes a human might save, and it has to be short enough to read in a
 * filename.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * `gamut-<8 hex chars>.pdf`, keyed on the ordered list of colours.
 *
 * Order is included rather than sorted away, because two masks holding the same colours
 * in a different arrangement around the wheel are different palettes to plan from.
 */
export function sheetFileName(hexes: readonly string[]): string {
  const key = hexes.join('-')
  return `gamut-${fnv1a(key).toString(16).padStart(8, '0')}.pdf`
}
