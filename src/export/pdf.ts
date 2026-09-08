/**
 * A minimal PDF writer. Spec: D43.
 *
 * Hand-rolled because D37 fixes runtime dependencies at React and react-dom, and the
 * document this app needs is narrow: one page, filled rectangles, base-14 text, and one
 * embedded JPEG. That is a few hundred lines of a text-based format, not a reason to take
 * on jsPDF or pdf-lib.
 *
 * Two things here are easy to get silently wrong, so both are tested:
 *
 *  - The cross-reference table holds absolute BYTE offsets. Assembling the file as
 *    strings and converting at the end corrupts them the moment a multi-byte character
 *    or binary JPEG data appears, so everything is assembled as byte chunks and offsets
 *    are measured on those.
 *  - Text must be encoded to match the font's /Encoding. Base-14 Helvetica is declared
 *    /WinAnsiEncoding, so strings are encoded to WinAnsi bytes rather than UTF-8. The AK
 *    catalogue contains ü, ä and º, all of which are in that range; UTF-8 would render
 *    them as mojibake.
 */

const ENCODER = new TextEncoder()

/** cp1252 positions for the characters that are NOT at their Unicode code point. */
const CP1252_SPECIALS: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84,
  '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

/**
 * Unicode -> WinAnsi byte values. Characters with no WinAnsi equivalent become '?', which
 * is visible and obviously wrong rather than silently dropping a glyph.
 */
export function toWinAnsiBytes(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63
    if (code >= 0x20 && code <= 0x7e) out.push(code)
    else if (code >= 0xa0 && code <= 0xff) out.push(code)
    else if (CP1252_SPECIALS[ch] !== undefined) out.push(CP1252_SPECIALS[ch])
    else out.push(63) // '?'
  }
  return out
}

/** A PDF literal string: WinAnsi bytes with (, ) and \ escaped. */
export function pdfString(text: string): Uint8Array {
  const body = toWinAnsiBytes(text)
  const out: number[] = [0x28] // (
  for (const b of body) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c)
    out.push(b)
  }
  out.push(0x29) // )
  return new Uint8Array(out)
}

function ascii(text: string): Uint8Array {
  return ENCODER.encode(text)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

export type PdfImage = {
  /** Raw JPEG file bytes, embedded with /DCTDecode — no re-encoding. */
  jpeg: Uint8Array
  width: number
  height: number
}

export type PdfPage = {
  widthPt: number
  heightPt: number
  /** Content-stream operators. Build them with `Content`. */
  operators: Uint8Array
  image?: PdfImage
  title?: string
}

/**
 * Assembles a single-page document.
 *
 * Object numbering is fixed: 1 catalog, 2 pages, 3 page, 4 contents, 5 Helvetica,
 * 6 Helvetica-Bold, 7 image (when present), 8 info (when a title is given).
 */
export function buildPdf(page: PdfPage): Uint8Array {
  const objects: Uint8Array[] = []
  const add = (body: Uint8Array | string) =>
    objects.push(typeof body === 'string' ? ascii(body) : body)

  const hasImage = page.image !== undefined
  const imageRef = hasImage ? ' /XObject << /Im0 7 0 R >>' : ''

  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  add(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.widthPt} ${page.heightPt}] ` +
      `/Resources << /Font << /F1 5 0 R /F2 6 0 R >>${imageRef} >> /Contents 4 0 R >>`,
  )
  add(
    concat([
      ascii(`<< /Length ${page.operators.length} >>\nstream\n`),
      page.operators,
      ascii('\nendstream'),
    ]),
  )
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  if (page.image) {
    add(
      concat([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${page.image.width} ` +
            `/Height ${page.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
            `/Filter /DCTDecode /Length ${page.image.jpeg.length} >>\nstream\n`,
        ),
        page.image.jpeg,
        ascii('\nendstream'),
      ]),
    )
  }
  const infoNumber = hasImage ? 8 : 7
  if (page.title) {
    add(concat([ascii('<< /Title '), pdfString(page.title), ascii(' >>')]))
  }

  const chunks: Uint8Array[] = []
  let offset = 0
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    offset += bytes.length
  }

  // The binary comment on line 2 marks the file as containing binary data, which stops
  // naive tools from mangling it in text mode.
  push(ascii('%PDF-1.4\n'))
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(offset)
    push(ascii(`${i + 1} 0 obj\n`))
    push(body)
    push(ascii('\nendobj\n'))
  })

  const xrefOffset = offset
  const count = objects.length + 1
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`
  push(ascii(xref))
  push(
    ascii(
      `trailer\n<< /Size ${count} /Root 1 0 R` +
        `${page.title ? ` /Info ${infoNumber} 0 R` : ''} >>\n` +
        `startxref\n${xrefOffset}\n%%EOF\n`,
    ),
  )

  return concat(chunks)
}

/**
 * Content-stream builder using TOP-DOWN coordinates.
 *
 * PDF's own origin is bottom-left with y increasing upward, which fights every layout
 * calculation written the way a page is read. Every method here takes y from the top and
 * converts once, at the boundary.
 */
export class Content {
  private parts: Uint8Array[] = []
  private readonly heightPt: number

  // Written out rather than a constructor parameter property: tsconfig sets
  // erasableSyntaxOnly, which disallows that shorthand.
  constructor(heightPt: number) {
    this.heightPt = heightPt
  }

  private op(text: string): void {
    this.parts.push(ascii(text))
  }

  private y(top: number): number {
    return this.heightPt - top
  }

  /** Fills a rectangle given its top-left corner. */
  rect(x: number, top: number, w: number, h: number, hex: string): this {
    const [r, g, b] = rgbFromHex(hex)
    this.op(`${r} ${g} ${b} rg\n${x} ${this.y(top + h)} ${w} ${h} re f\n`)
    return this
  }

  /** Strokes a rectangle outline given its top-left corner. */
  strokeRect(x: number, top: number, w: number, h: number, hex: string, lineWidth = 0.5): this {
    const [r, g, b] = rgbFromHex(hex)
    this.op(
      `${r} ${g} ${b} RG ${lineWidth} w\n${x} ${this.y(top + h)} ${w} ${h} re S\n`,
    )
    return this
  }

  line(x1: number, top1: number, x2: number, top2: number, hex: string, lineWidth = 0.5): this {
    const [r, g, b] = rgbFromHex(hex)
    this.op(
      `${r} ${g} ${b} RG ${lineWidth} w\n${x1} ${this.y(top1)} m ${x2} ${this.y(top2)} l S\n`,
    )
    return this
  }

  /** `top` is the text baseline measured from the top of the page. */
  text(
    x: number,
    top: number,
    value: string,
    opts: { size?: number; bold?: boolean; hex?: string } = {},
  ): this {
    const size = opts.size ?? 9
    const [r, g, b] = rgbFromHex(opts.hex ?? '#000000')
    this.parts.push(ascii(`BT ${r} ${g} ${b} rg /${opts.bold ? 'F2' : 'F1'} ${size} Tf ${x} ${this.y(top)} Td `))
    this.parts.push(pdfString(value))
    this.parts.push(ascii(' Tj ET\n'))
    return this
  }

  /** Draws the page's single image into the given top-left box. */
  image(x: number, top: number, w: number, h: number): this {
    this.op(`q ${w} 0 0 ${h} ${x} ${this.y(top + h)} cm /Im0 Do Q\n`)
    return this
  }

  build(): Uint8Array {
    return concat(this.parts)
  }
}

/** '#rrggbb' -> three 0..1 components rounded to 4 places, as PDF expects. */
export function rgbFromHex(hex: string): [string, string, string] {
  const n = Number.parseInt(hex.slice(1), 16)
  const c = (v: number) => (Math.round((v / 255) * 10000) / 10000).toString()
  return [c((n >> 16) & 0xff), c((n >> 8) & 0xff), c(n & 0xff)]
}

/** Width of a string in points, for the base-14 Helvetica metrics used here. */
export function textWidth(value: string, size: number, bold = false): number {
  // Average-case metrics: exact AFM widths would mean shipping two 256-entry tables for
  // the sake of ellipsising a paint name, so this approximates and callers leave slack.
  const factor = bold ? 0.58 : 0.52
  return value.length * size * factor
}
