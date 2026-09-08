/**
 * Renders the same sheet as the PDF, as a single JPEG. Spec: D45.
 *
 * Shares the layout with the PDF through `Surface` — one body of positioning code, two
 * outputs. The difference is shape: the PDF paginates onto A4, the JPEG is ONE
 * continuous sheet, because that is the natural form for an image and a reader cannot
 * flip a JPEG's pages.
 *
 * Consequence: the height is not known until the layout has run, and a canvas needs its
 * size up front. So the layout runs twice — once against a measuring surface that draws
 * nothing, then against the real canvas.
 */

import { renderWheelImage } from './wheelImage.ts'
import { CanvasSurface, MeasuringSurface } from './canvasSurface.ts'
import { layoutSheet, SHEET_WIDTH_PT, type SheetContent } from './sheet.ts'
import type { Point } from '../color/wheel.ts'

/**
 * Points to pixels. 2.5 puts the sheet at about 1490px wide — comfortable on screen and
 * still sharp enough to read the paint names when printed or zoomed.
 */
const SCALE = 2.5

const QUALITY = 0.92

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function buildSheetJpeg(input: SheetContent & { polygon: Point[] }): Uint8Array {
  // A throwaway context, purely so the sizing pass can measure text.
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('2D canvas context unavailable')
  const heightPt = layoutSheet(new MeasuringSurface(probe), input, {
    footerTop: Number.POSITIVE_INFINITY,
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(SHEET_WIDTH_PT * SCALE)
  canvas.height = Math.round(heightPt * SCALE)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  // Paper white: JPEG has no alpha, so anything left untouched would come out black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const surface = new CanvasSurface(ctx, SCALE)

  // The wheel comes from the same renderer the PDF uses, drawn from the canvas it was
  // encoded from rather than by decoding its JPEG bytes — decoding an Image is
  // asynchronous, and this way the two exports cannot disagree about what the mask
  // looked like.
  surface.sheetImage = renderWheelImage(input.polygon).canvas

  layoutSheet(surface, input, { footerTop: Number.POSITIVE_INFINITY })

  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
  return base64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1))
}
