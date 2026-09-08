/**
 * Composes the export sheet: the wheel, the mask settings, and the colours with their
 * paint matches. Spec: D43.
 *
 * The wheel goes in as a bitmap because it is a per-pixel gradient (D30). Everything else
 * is real PDF text and vector rectangles, so the sheet prints crisply, the hex codes can
 * be selected and copied out of it, and the file stays small.
 *
 * The wheel bitmap is INJECTED rather than rendered here, which keeps this module free of
 * the DOM. That is what lets the layout be built and inspected outside a browser — the
 * only way to actually look at the generated page rather than trust the arithmetic.
 */

import { lightnessLabel, saturationLabel, toHex } from '../color/format.ts'
import { ANCHORS, wedgeIndexOf, wedgeOffsetOf } from '../color/wheel.ts'
import type { Sample } from '../geom/sample.ts'
import {
  differencePercent,
  isWithinTolerance,
  nearestPaint,
  MATCH_TOLERANCE_PERCENT,
} from '../paints/match.ts'
import { buildPdf, Content, textWidth, type PdfImage } from './pdf.ts'

// A4 portrait.
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 40

const WHEEL_SIZE = 220
/**
 * Height of one colour entry. Each entry is TWO lines — colour on the first, paint on the
 * second — for the same reason the on-screen card is: laid out on one line, the paint
 * name gets about 37pt in a two-column grid, which truncates it to roughly eight
 * characters. On its own line it gets the full column and nothing truncates.
 */
const ENTRY_H = 21
const SWATCH = 13

const TEXT = '#111111'
const MUTED = '#666666'
const DIM = '#8c8c8c'
const RULE = '#cccccc'

export type SheetInput = {
  /** The wheel and mask, pre-rendered — see `renderWheelImage`. */
  image: PdfImage
  samples: Sample[]
  polygon: { x: number; y: number }[]
  preset: string | null
  rotation: number
  size: number
  requested: number
}

/** Trims to fit `maxWidth`, appending an ellipsis when it has to cut. */
function fit(value: string, maxWidth: number, size: number): string {
  if (textWidth(value, size) <= maxWidth) return value
  let cut = value
  while (cut.length > 1 && textWidth(`${cut}...`, size) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}...`
}

export function buildSheet(input: SheetInput): Uint8Array {
  const { image, samples, polygon, preset, rotation, size, requested } = input
  const c = new Content(PAGE_H)

  let y = MARGIN + 12
  c.text(MARGIN, y, 'Gamut Mask', { size: 17, bold: true, hex: TEXT })
  const stamp = new Date().toLocaleString()
  c.text(PAGE_W - MARGIN - textWidth(stamp, 8), y, stamp, { size: 8, hex: DIM })
  y += 10
  c.line(MARGIN, y, PAGE_W - MARGIN, y, RULE, 0.8)

  // Wheel on the left, mask settings to its right.
  const wheelTop = y + 16
  c.image(MARGIN, wheelTop, WHEEL_SIZE, WHEEL_SIZE)

  const infoX = MARGIN + WHEEL_SIZE + 26
  let infoY = wheelTop + 12
  c.text(infoX, infoY, 'MASK', { size: 8, bold: true, hex: MUTED })
  infoY += 16
  const rows: [string, string][] = [
    ['Preset', preset ? preset : 'Hand-drawn'],
    ['Rotation', `${Math.round(rotation)}°`],
    ['Size', `${Math.round(size * 100)}%`],
    ['Colours', samples.length < requested
      ? `${samples.length} of ${requested} requested`
      : String(samples.length)],
    ['Vertices', String(polygon.length)],
  ]
  for (const [label, value] of rows) {
    c.text(infoX, infoY, label, { size: 9, hex: MUTED })
    c.text(infoX + 62, infoY, value, { size: 9, hex: TEXT })
    infoY += 14
  }

  infoY += 8
  c.text(infoX, infoY, 'PAINT MATCHING', { size: 8, bold: true, hex: MUTED })
  infoY += 14
  for (const line of [
    `Nearest AK paint within ${MATCH_TOLERANCE_PERCENT}% in Oklab.`,
    'Beyond that, no paint is listed.',
    'Catalogue swatch colours, not measured',
    'paint — a starting point, not a reading.',
  ]) {
    c.text(infoX, infoY, line, { size: 8, hex: DIM })
    infoY += 11
  }

  // Colours, grouped by wedge exactly as the screen groups them.
  y = wheelTop + WHEEL_SIZE + 30
  const buckets: Sample[][] = ANCHORS.map(() => [])
  for (const s of samples) buckets[wedgeIndexOf(s.theta)].push(s)
  for (const b of buckets) b.sort((p, q) => wedgeOffsetOf(p.theta) - wedgeOffsetOf(q.theta))

  /**
   * Two columns normally, three when the palette is large. At 32 colours two columns run
   * past the footer — verified by rendering the page, not by arithmetic — and three fits
   * the maximum N with room to spare. Below the threshold two columns are preferred
   * because they leave paint names more room.
   */
  const cols = samples.length > 24 ? 3 : 2
  const GUTTER = 16
  const colW = (PAGE_W - MARGIN * 2 - GUTTER * (cols - 1)) / cols

  for (let w = 0; w < ANCHORS.length; w++) {
    const bucket = buckets[w]
    if (bucket.length === 0) continue

    c.text(MARGIN, y, `${ANCHORS[w].letter}  ${ANCHORS[w].name.toUpperCase()}`, {
      size: 8,
      bold: true,
      hex: MUTED,
    })
    c.text(PAGE_W - MARGIN - 12, y, String(bucket.length), { size: 8, hex: DIM })
    y += 4
    c.line(MARGIN, y, PAGE_W - MARGIN, y, RULE, 0.5)
    y += 14

    bucket.forEach((sample, i) => {
      const col = i % cols
      const x = MARGIN + col * (colW + GUTTER)
      const top = y + Math.floor(i / cols) * ENTRY_H

      const hex = toHex(sample.rgb8)
      c.rect(x, top - SWATCH + 2, SWATCH, SWATCH, hex)
      c.strokeRect(x, top - SWATCH + 2, SWATCH, SWATCH, RULE, 0.4)

      const textX = x + SWATCH + 6
      c.text(textX, top, hex, { size: 8.5, hex: TEXT })
      const nums = `L ${lightnessLabel(sample.oklab.L)}   S ${saturationLabel(sample.t)}%`
      c.text(x + colW - 20 - textWidth(nums, 7.5), top, nums, { size: 7.5, hex: DIM })

      const match = nearestPaint(sample.oklab)
      const delta = `${differencePercent(match.distance)}%`
      const deltaX = x + colW - 20 - textWidth(delta, 7.5)
      if (isWithinTolerance(match)) {
        c.text(textX, top + 9, match.paint.ref, { size: 7.5, bold: true, hex: TEXT })
        const nameX = textX + 40
        c.text(nameX, top + 9, fit(match.paint.name, deltaX - nameX - 6, 7.5), {
          size: 7.5,
          hex: MUTED,
        })
      } else {
        c.text(textX, top + 9, 'No paint found', { size: 7.5, hex: DIM })
      }
      c.text(deltaX, top + 9, delta, { size: 7.5, hex: DIM })
    })

    y += Math.ceil(bucket.length / cols) * ENTRY_H + 10
  }

  c.line(MARGIN, PAGE_H - MARGIN - 14, PAGE_W - MARGIN, PAGE_H - MARGIN - 14, RULE, 0.5)
  c.text(
    MARGIN,
    PAGE_H - MARGIN - 4,
    'Assumes sRGB. On an uncalibrated monitor this plans relative harmony; '
      + 'it does not predict absolute paint colour.',
    { size: 7, hex: DIM },
  )

  return buildPdf({
    widthPt: PAGE_W,
    heightPt: PAGE_H,
    operators: c.build(),
    image,
    title: 'Gamut Mask',
  })
}
