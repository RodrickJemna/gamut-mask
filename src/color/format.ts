/**
 * Display formatting for the sample list. Spec: D36, F6.
 *
 * D36 fixes each row as swatch, hex, lightness, saturation. This file owns the numbers;
 * the component owns the labels and the '%' sign. Both readouts are deliberately two
 * independent one-liners, because D36 says they must stay easy to remove if they turn
 * out to be noise.
 */

/** Lower-case '#rrggbb'. Exact: this string is the only output the tool produces (D13). */
export function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Oklab L on a 0-100 scale.
 *
 * D16 context, so this is not misread: lightness is a consequence of the model, never a
 * control. There is no L axis and no L slider. The user reads this number; they never
 * set it.
 */
export function lightnessLabel(oklabL: number): number {
  return Math.round(oklabL * 100)
}

/** Radius `t` as a percentage — per-hue normalised saturation (D35), not absolute chroma. */
export function saturationLabel(t: number): number {
  return Math.round(t * 100)
}
