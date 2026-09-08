/**
 * Display formatting for the sample list. Spec: D36, F6.
 *
 * IMPLEMENT
 *
 *   toHex(rgb8: [number, number, number]): string   // '#rrggbb', lower case
 *   lightnessLabel(oklabL: number): number          // Oklab L, 0..1 -> 0..100 integer
 *   saturationLabel(t: number): number              // radius t, 0..1 -> 0..100 integer
 *
 * D36 fixes each list row as: swatch, hex, lightness, saturation. Lightness is Oklab `L`
 * on a 0-100 scale; saturation is the radius `t` as a percentage. Both are plain rounded
 * integers — no units baked into the string, no decimals, no padding. The component owns
 * the '%' and the labels, this file owns the numbers.
 *
 * Round-trip note: `toHex` must be exact, because clicking a row copies the hex to the
 * clipboard (D13, D36) and that string is the only output this tool produces. Pad each
 * channel to two digits.
 *
 * D36 also says both numbers are easy to remove if they turn out to be noise. Keep them
 * as two independent one-line functions so that stays true.
 *
 * D16 context, so this file is not misread: the lightness column is a *consequence* of
 * the model, not a control. There is no L axis and no L slider, and adding one is a
 * withdrawn decision. The user reads this number; they never set it.
 *
 * Too small to need its own test file. If the rounding boundary ever matters, fold the
 * cases into `wheel.test.ts`.
 */
