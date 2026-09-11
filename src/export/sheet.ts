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
import { ANCHORS, type WheelSpec, wedgeIndexOf, wedgeOffsetOf } from '../color/wheel.ts'
import type { Sample } from '../geom/sample.ts'
import {
  closestOverall,
  differencePercent,
  matchingPaints,
  MATCH_TOLERANCE_PERCENT,
} from '../paints/match.ts'
import { BRANDS, BRAND_TAG, type Brand } from '../paints/types.ts'
import { buildSchemes } from '../palette/scheme.ts'
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
 * Height of one colour entry: the colour line plus one paint line per brand (D44). Paints
 * get their own lines because laid out beside the colour they truncate to roughly eight
 * characters, and an unreadable paint name defeats the point of matching.
 *
 * DERIVED from BRANDS rather than written out. It was 30, correct for exactly two brands;
 * adding a third (D51) would have overlapped the row below it, which is the kind of
 * breakage a constant hides until someone reads a printed sheet.
 */
const ENTRY_H = 12 + 9 * BRANDS.length

/** D54 block: the proportional bar's width, and the height one scheme occupies. */
const SCHEME_BAR_W = 200
const SCHEME_H = 14 + 3 * 10 + 8
const SWATCH = 13

const TEXT = '#111111'
const MUTED = '#666666'
const DIM = '#8c8c8c'
const RULE = '#cccccc'

export const SHEET_WIDTH_PT = PAGE_W
export const SHEET_MARGIN_PT = MARGIN

export type SheetContent = {
  samples: Sample[]
  /** Brands to match against (D48). Empty omits the paint lines entirely. */
  brands: readonly Brand[]
  /** The shelf matching is restricted to, or null for the whole catalogues (D57). */
  owned: ReadonlySet<string> | null
  polygon: { x: number; y: number }[]
  preset: string | null
  /**
   * The wheel the colours were read from (D53). The SPEC, not its label: the sheet both
   * prints the name and renders the disk, and carrying two fields would let them drift.
   */
  wheel: WheelSpec
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
  const { samples, polygon, preset, wheel, rotation, size, brands, owned } = input
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
    // The wheel comes first: it says what the colours below ARE, so a sheet read weeks
    // later cannot be mistaken for one planned on a different surface (D53).
    ['Wheel', wheel.label],
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
  const brandLine =
    brands.length === 0 ? 'Off' : brands.join(', ')
  for (const line of [
    `Brands: ${brandLine}`,
    // Stated on the sheet, because a sheet matched against a shelf of sixty pots is not
    // the same document as one matched against 1540 and must not read like it.
    ...(owned ? [`Restricted to ${owned.size} owned paints.`] : []),
    `Nearest within ${MATCH_TOLERANCE_PERCENT}% in Oklab.`,
    'Catalogue swatch colours, not measured',
    'paint — a starting point, not a reading.',
  ]) {
    c.text(infoX, infoY, line, { size: 8, hex: DIM })
    infoY += 11
  }

  y = wheelTop + WHEEL_SIZE + 30

  /**
   * D54 — the 60-30-10 suggestions, on the sheet because the sheet is the thing that goes
   * to the bench: knowing WHICH of the colours below is the 60% and which the 10% is the
   * part you cannot reconstruct from a list of swatches.
   *
   * Laid out as a proportional bar plus one line per role, rather than labels aligned
   * under the bar's segments as on screen. The bar here is 200pt wide, so its 10% segment
   * is 20pt — not enough for a hex, let alone a paint name, which is the same reason the
   * on-screen legend stopped being aligned to its segments.
   */
  const schemes = buildSchemes(samples, 3)
  ensure(30)
  c.text(MARGIN, y, '60-30-10', { size: 8, bold: true, hex: MUTED })
  c.text(
    MARGIN + 56,
    y,
    'Balanced when the three areas x lightness x chroma are equal and their hues cancel '
      + '(Munsell). "Off" is how far from that, split into the two ways it can fail.',
    { size: 7, hex: DIM },
  )
  y += 6
  c.line(MARGIN, y, PAGE_W - MARGIN, y, RULE, 0.5)
  y += 14

  if (schemes.length === 0) {
    c.text(
      MARGIN,
      y,
      samples.length < 3
        ? `Only ${samples.length} distinguishable colour${samples.length === 1 ? '' : 's'}`
          + ' in this mask — too few for a three-part palette.'
        : 'No scheme: a palette needs an accent with some chroma in it.',
      { size: 8, hex: DIM },
    )
    y += 16
  }

  for (const scheme of schemes) {
    ensure(SCHEME_H)
    const barTop = y - 8
    let x = MARGIN
    for (const role of scheme.roles) {
      const w = SCHEME_BAR_W * role.share
      c.rect(x, barTop, w, 11, toHex(role.sample.rgb8))
      x += w
    }
    c.strokeRect(MARGIN, barTop, SCHEME_BAR_W, 11, RULE, 0.4)

    const off = `off ${Math.round(scheme.imbalance * 100)}%`
    c.text(MARGIN + SCHEME_BAR_W + 12, y, off, { size: 8, hex: DIM })
    c.text(
      MARGIN + SCHEME_BAR_W + 12 + c.measure(off, 8) + 8,
      y,
      `(hue ${Math.round(scheme.direction * 100)}%, strength ${Math.round(scheme.magnitude * 100)}%)`,
      { size: 7, hex: DIM },
    )

    y += 14
    for (const role of scheme.roles) {
      const hex = toHex(role.sample.rgb8)
      c.text(MARGIN + 6, y, `${Math.round(role.share * 100)}%`, { size: 8, hex: MUTED })
      c.text(MARGIN + 30, y, hex, { size: 8, hex: TEXT })
      const matches = matchingPaints(role.sample.oklab, brands, owned)
      const paint =
        brands.length === 0
          ? ''
          : matches.length === 0
            ? `no paint within ${MATCH_TOLERANCE_PERCENT}%`
            : matches
                .map((m) => `${BRAND_TAG[m.paint.brand]} ${m.paint.ref} ${m.paint.name}`.trim())
                .join(' / ')
      if (paint) {
        c.text(
          MARGIN + 82,
          y,
          fit(c, paint, PAGE_W - MARGIN - (MARGIN + 82), 8),
          { size: 8, hex: matches.length === 0 ? DIM : MUTED },
        )
      }
      y += 10
    }
    y += 8
  }

  y += 6

  /**
   * Grouped exactly as the screen groups them, neutral group included. A colour with no
   * chroma has no hue, so filing it under a wedge would be arbitrary — and having the
   * sheet disagree with the list about where it belongs would be worse.
   */
  const neutrals: Sample[] = []
  const buckets: Sample[][] = ANCHORS.map(() => [])
  for (const s of samples) {
    if (s.t === 0) neutrals.push(s)
    else buckets[wedgeIndexOf(s.theta)].push(s)
  }
  for (const b of buckets) b.sort((p, q) => wedgeOffsetOf(p.theta) - wedgeOffsetOf(q.theta))

  const groups: { letter: string; name: string; bucket: Sample[] }[] = [
    ...(neutrals.length > 0
      ? [{ letter: '\u00b7', name: 'Neutral', bucket: neutrals }]
      : []),
    ...ANCHORS.map((anchor, i) => ({
      letter: anchor.letter,
      name: anchor.name,
      bucket: buckets[i],
    })),
  ]

  const cols = samples.length > 24 ? 3 : 2
  const GUTTER = 16
  const colW = (PAGE_W - MARGIN * 2 - GUTTER * (cols - 1)) / cols

  for (const group of groups) {
    const bucket = group.bucket
    if (bucket.length === 0) continue

    ensure(18 + ENTRY_H)
    c.text(MARGIN, y, `${group.letter}  ${group.name.toUpperCase()}`, {
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
        drawEntry(c, sample, MARGIN + col * (colW + GUTTER), top, colW, brands, owned)
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
function drawEntry(
  c: Surface,
  sample: Sample,
  x: number,
  top: number,
  colW: number,
  brands: readonly Brand[],
  owned: ReadonlySet<string> | null,
): void {
  const hex = toHex(sample.rgb8)
  c.rect(x, top - SWATCH + 2, SWATCH, SWATCH, hex)
  c.strokeRect(x, top - SWATCH + 2, SWATCH, SWATCH, RULE, 0.4)

  const textX = x + SWATCH + 6
  c.text(textX, top, hex, { size: 8.5, hex: TEXT })
  const nums = `L ${lightnessLabel(sample.oklab.L)}   S ${saturationLabel(sample.t)}%`
  c.text(x + colW - 20 - c.measure(nums, 7.5), top, nums, { size: 7.5, hex: DIM })

  const matches = matchingPaints(sample.oklab, brands, owned)
  if (matches.length === 0) {
    // Nothing at all when no brand is being searched — see D48.
    const closest = closestOverall(sample.oklab, brands, owned)
    if (closest === null) return
    const delta = `${differencePercent(closest.distance)}%`
    c.text(textX, top + 9, 'No paint found', { size: 7.5, hex: DIM })
    c.text(x + colW - 20 - c.measure(delta, 7.5), top + 9, delta, { size: 7.5, hex: DIM })
    return
  }
  matches.forEach((m, row) => {
    const lineY = top + 9 + row * 9
    // The drift word (D49) rides on the delta cell, so it stays right-aligned with the
    // percentages and the paint name absorbs the width it takes.
    const delta = `${differencePercent(m.distance)}%${m.drift === null ? '' : ` ${m.drift}`}`
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
