/**
 * The drawing surface the sheet layout targets. Spec: D43, D45.
 *
 * Exists so ONE layout can render to two outputs. The PDF and the JPEG show the same
 * sheet, and the alternative — a canvas copy of the layout beside the PDF one — is two
 * bodies of positioning code that would drift apart on the first change to either.
 *
 * Coordinates are TOP-DOWN throughout, in points. PDF's own origin is bottom-left, so
 * `Content` converts at its boundary; a canvas is already top-down and only scales.
 */

export type TextStyle = {
  size?: number
  bold?: boolean
  hex?: string
}

export type Surface = {
  /** Fills a rectangle given its top-left corner. */
  rect(x: number, top: number, w: number, h: number, hex: string): void
  strokeRect(
    x: number, top: number, w: number, h: number, hex: string, lineWidth?: number,
  ): void
  line(
    x1: number, top1: number, x2: number, top2: number, hex: string, lineWidth?: number,
  ): void
  /** `top` is the text baseline measured from the top of the page. */
  text(x: number, top: number, value: string, style?: TextStyle): void
  /** Draws the sheet's single image into the given top-left box. */
  image(x: number, top: number, w: number, h: number): void
  /**
   * Width of `value` in points on this surface.
   *
   * Each surface measures with its own metrics rather than sharing an approximation, so
   * right-aligned text and ellipsised names are correct in both outputs instead of
   * correct in one and slightly off in the other.
   */
  measure(value: string, size: number, bold?: boolean): number
}
