/**
 * Composes the export sheet: the wheel, the mask settings, and the colours with their
 * paint matches. Spec: D43, D44.
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
  closestOverall,
  differencePercent,
  matchingPaints,
  MATCH_TOLERANCE_PERCENT,
} from '../paints/match.ts'
import { BRAND_TAG } from '../paints/types.ts'
import { buildPdf, Content, type PdfImage } from './pdf.ts'
import type { Surface } from './surface.ts'

// A4 portrait.
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 40
/** Content must stay above this; crossing it starts a new page. */
const FOOTER_TOP = PAGE_H - MARGIN - 22

const WHEEL_SIZE = 220
/**
 * Height of one colour entry: the colour line plus up to two paint lines, one per brand
 * (D44). Paints get their own lines because laid out beside the colour they truncate to
 * roughly eight characters, and an unreadable paint name defeats the point of matching.
 */
const ENTRY_H = 30
const SWATCH = 13

const TEXT = '#111111'
const MUTED = '#666666'
const DIM = '#8c8c8c'
const RULE = '#cccccc'

export const SHEET_WIDTH_PT = PAGE_W
export const SHEET_MARGIN_PT = MARGIN

export type SheetContent = {
  samples: Sample[]
  polygon: { x: number; y: number }[]
  preset: string | null
  rotation: number
  size: number
}

export type SheetInput = SheetContent & {
  /** The wheel and mask, pre-rendered — see `renderWheelImage`. */
  image: PdfImage
}

/** Trims to fit `maxWidth` on this surface, appending an ellipsis when it has to cut. */
function fit(s: Surface, value: string, maxWidth: number, size: number): string {
  if (s.measure(value, size) <= maxWidth) return value
  let cut = value
  while (cut.length > 1 && s.measure(`${cut}...`, size) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}...`
}

export type LayoutOptions = {
  /**
   * Where content must stop. For the PDF this is the page footer and crossing it starts a
   * new page; for the single-sheet JPEG it is effectively unbounded.
   */
  footerTop: number
  /** Called when content would cross `footerTop`; returns the surface to continue on. */
  onPageBreak?: () => Surface
}

/**
 * Draws the sheet, returning the y of the bottom of the content.
 *
 * Surface-agnostic and used twice per JPEG export: once against a measuring surface to
 * discover the height, then against the real canvas.
 */
export function layoutSheet(
  surface: Surface,
  input: SheetContent,
  options: LayoutOptions,
): number {
  const { samples, polygon, preset, rotation, size } = input
  let c = surface
  let y = 0

  const footer = (bottom: number) => {
    c.line(MARGIN, bottom + 8, PAGE_W - MARGIN, bottom + 8, RULE, 0.5)
    c.text(
      MARGIN,
      bottom + 18,
      'Assumes sRGB. On an uncalibrated monitor this plans relative harmony; '
        + 'it does not predict absolute paint colour.',
      { size: 7, hex: DIM },
    )
  }

  const stamp = new Date().toLocaleString()
  const heading = (continued: boolean) => {
    y = MARGIN + 12
    c.text(MARGIN, y, continued ? 'Gamut Mask (continued)' : 'Gamut Mask', {
      size: continued ? 12 : 17,
      bold: true,
      hex: TEXT,
    })
    c.text(PAGE_W - MARGIN - c.measure(stamp, 8), y, stamp, { size: 8, hex: DIM })
    y += 10
    c.line(MARGIN, y, PAGE_W - MARGIN, y, RULE, 0.8)
  }

  const ensure = (needed: number) => {
    if (!options.onPageBreak || y + needed <= options.footerTop) return
    footer(options.footerTop)
    c = options.onPageBreak()
    heading(true)
    y += 18
  }

  heading(false)

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
    ['Colours', String(samples.length)],
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
    'Nearest AK and Vallejo paint within',
    `${MATCH_TOLERANCE_PERCENT}% in Oklab. Beyond that, none.`,
    'Catalogue swatch colours, not measured',
    'paint — a starting point, not a reading.',
  ]) {
    c.text(infoX, infoY, line, { size: 8, hex: DIM })
    infoY += 11
  }

  y = wheelTop + WHEEL_SIZE + 30
  const buckets: Sample[][] = ANCHORS.map(() => [])
  for (const s of samples) buckets[wedgeIndexOf(s.theta)].push(s)
  for (const b of buckets) b.sort((p, q) => wedgeOffsetOf(p.theta) - wedgeOffsetOf(q.theta))

  const cols = samples.length > 24 ? 3 : 2
  const GUTTER = 16
  const colW = (PAGE_W - MARGIN * 2 - GUTTER * (cols - 1)) / cols

  for (let w = 0; w < ANCHORS.length; w++) {
    const bucket = buckets[w]
    if (bucket.length === 0) continue

    ensure(18 + ENTRY_H)
    c.text(MARGIN, y, `${ANCHORS[w].letter}  ${ANCHORS[w].name.toUpperCase()}`, {
      size: 8,
      bold: true,
      hex: MUTED,
    })
    c.text(PAGE_W - MARGIN - 12, y, String(bucket.length), { size: 8, hex: DIM })
    y += 4
    c.line(MARGIN, y, PAGE_W - MARGIN, y, RULE, 0.5)
    y += 14

    for (let row = 0; row * cols < bucket.length; row++) {
      ensure(ENTRY_H)
      const top = y
      for (let col = 0; col < cols; col++) {
        const sample = bucket[row * cols + col]
        if (!sample) break
        drawEntry(c, sample, MARGIN + col * (colW + GUTTER), top, colW)
      }
      y += ENTRY_H
    }
    y += 10
  }

  const bottom = options.onPageBreak ? options.footerTop : y
  footer(bottom)
  return bottom + 22
}

export function buildSheet(input: SheetInput): Uint8Array {
  const pages: Content[] = []
  let current = new Content(PAGE_H)
  pages.push(current)

  layoutSheet(current, input, {
    footerTop: FOOTER_TOP,
    onPageBreak: () => {
      current = new Content(PAGE_H)
      pages.push(current)
      return current
    },
  })

  return buildPdf({
    widthPt: PAGE_W,
    heightPt: PAGE_H,
    pages: pages.map((page) => ({ operators: page.build() })),
    image: input.image,
    title: 'Gamut Mask',
  })
}

/** One colour: its swatch and readings, then a line per matched brand (D44). */
function drawEntry(c: Surface, sample: Sample, x: number, top: number, colW: number): void {
  const hex = toHex(sample.rgb8)
  c.rect(x, top - SWATCH + 2, SWATCH, SWATCH, hex)
  c.strokeRect(x, top - SWATCH + 2, SWATCH, SWATCH, RULE, 0.4)

  const textX = x + SWATCH + 6
  c.text(textX, top, hex, { size: 8.5, hex: TEXT })
  const nums = `L ${lightnessLabel(sample.oklab.L)}   S ${saturationLabel(sample.t)}%`
  c.text(x + colW - 20 - c.measure(nums, 7.5), top, nums, { size: 7.5, hex: DIM })

  const matches = matchingPaints(sample.oklab)
  if (matches.length === 0) {
    const closest = closestOverall(sample.oklab)
    const delta = `${differencePercent(closest.distance)}%`
    c.text(textX, top + 9, 'No paint found', { size: 7.5, hex: DIM })
    c.text(x + colW - 20 - c.measure(delta, 7.5), top + 9, delta, { size: 7.5, hex: DIM })
    return
  }
  matches.forEach((m, row) => {
    const lineY = top + 9 + row * 9
    const delta = `${differencePercent(m.distance)}%`
    const deltaX = x + colW - 20 - c.measure(delta, 7.5)
    c.text(textX, lineY, BRAND_TAG[m.paint.brand], { size: 6.5, bold: true, hex: DIM })
    c.text(textX + 16, lineY, m.paint.ref, { size: 7.5, bold: true, hex: TEXT })
    const nameX = textX + 16 + 42
    c.text(nameX, lineY, fit(c, m.paint.name, deltaX - nameX - 6, 7.5), {
      size: 7.5,
      hex: MUTED,
    })
    c.text(deltaX, lineY, delta, { size: 7.5, hex: DIM })
  })
}
