import { describe, expect, it } from 'vitest'
import { Content, buildPdf, pdfString, rgbFromHex, toWinAnsiBytes } from './pdf.ts'

const decode = (bytes: Uint8Array) => String.fromCharCode(...bytes)

/**
 * The two things that go silently wrong in a hand-written PDF are byte offsets and text
 * encoding, so both are checked against the bytes themselves rather than by eye.
 */

describe('WinAnsi encoding', () => {
  it('passes ASCII through', () => {
    expect(toWinAnsiBytes('AK11029 Rock Grey')).toEqual(
      [...'AK11029 Rock Grey'].map((c) => c.charCodeAt(0)),
    )
  })

  it('encodes the catalogue characters that are not ASCII', () => {
    // These three are the only non-ASCII characters in the AK catalogue, and all sit at
    // their Latin-1 code points in WinAnsi.
    expect(toWinAnsiBytes('ü')).toEqual([0xfc])
    expect(toWinAnsiBytes('ä')).toEqual([0xe4])
    expect(toWinAnsiBytes('º')).toEqual([0xba])
  })

  it('maps the cp1252 punctuation that is NOT at its Unicode code point', () => {
    expect(toWinAnsiBytes('—')).toEqual([0x97])
    expect(toWinAnsiBytes('’')).toEqual([0x92])
  })

  it('substitutes a question mark for anything unrepresentable', () => {
    expect(toWinAnsiBytes('日')).toEqual([63])
    expect(toWinAnsiBytes('🎨')).toEqual([63])
  })

  it('never emits a byte outside 0..255', () => {
    for (const b of toWinAnsiBytes('AÄ—日🎨º~ ')) {
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(255)
    }
  })
})

describe('pdfString', () => {
  it('wraps in parentheses', () => {
    expect(decode(pdfString('hi'))).toBe('(hi)')
  })

  it('escapes the characters that would end the string early', () => {
    expect(decode(pdfString('a(b)c\\d'))).toBe('(a\\(b\\)c\\\\d)')
  })

  it('escapes an unbalanced parenthesis', () => {
    expect(decode(pdfString('RLM 79 (1942'))).toBe('(RLM 79 \\(1942)')
  })
})

describe('rgbFromHex', () => {
  it('converts to 0..1 components', () => {
    expect(rgbFromHex('#000000')).toEqual(['0', '0', '0'])
    expect(rgbFromHex('#ffffff')).toEqual(['1', '1', '1'])
    expect(rgbFromHex('#808080')).toEqual(['0.502', '0.502', '0.502'])
  })
})

describe('buildPdf structure', () => {
  const simple = () =>
    buildPdf({
      widthPt: 595,
      heightPt: 842,
      pages: [{ operators: new Content(842).text(40, 40, 'Gamut Mask (ü)').build() }],
      title: 'Gamut Mask',
    })

  it('starts with a PDF header and a binary marker', () => {
    const out = simple()
    expect(decode(out.subarray(0, 8))).toBe('%PDF-1.4')
    // Byte 2 of the comment line must be >= 128 or tools may treat the file as text.
    expect(out[10]).toBeGreaterThan(127)
  })

  it('ends with %%EOF', () => {
    expect(decode(simple().slice(-6))).toBe('%%EOF\n')
  })

  /**
   * The real test. Every xref entry is an absolute byte offset that must land exactly on
   * its object header. Assembling the file as a string and encoding at the end breaks
   * these the moment a multi-byte character appears — and the file still opens in some
   * viewers, which is what makes it a silent failure.
   */
  it('every xref offset points at the start of its object', () => {
    const out = simple()
    const text = decode(out)
    // '\nxref\n', not 'xref\n': the latter also matches inside 'startxref'.
    const xrefAt = text.lastIndexOf('\nxref\n') + 1
    expect(xrefAt).toBeGreaterThan(0)

    const header = /xref\n0 (\d+)\n/.exec(text.slice(xrefAt))
    expect(header).not.toBeNull()
    const count = Number(header![1])

    const lines = text.slice(xrefAt + header![0].length).split('\n')
    // Entry 0 is the mandatory free-object record; the real objects follow it.
    expect(lines[0]).toBe('0000000000 65535 f ')
    const entries = lines.slice(1, count)
    expect(entries).toHaveLength(count - 1)

    entries.forEach((entry, i) => {
      expect(entry).toMatch(/^\d{10} 00000 n $/)
      const offset = Number(entry.slice(0, 10))
      expect(text.startsWith(`${i + 1} 0 obj`, offset)).toBe(true)
    })
  })

  it('startxref points at the xref table', () => {
    const out = simple()
    const text = decode(out)
    const at = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.startsWith('xref\n', at)).toBe(true)
  })

  it('declares /Size as objects + 1 and a /Root', () => {
    const text = decode(simple())
    const size = Number(/\/Size (\d+)/.exec(text)![1])
    const objects = [...text.matchAll(/^\d+ 0 obj$/gm)].length
    expect(size).toBe(objects + 1)
    expect(text).toContain('/Root 1 0 R')
  })

  it('lays out multiple pages with correct kids and count', () => {
    const page = (label: string) => ({
      operators: new Content(842).text(40, 40, label).build(),
    })
    const text = decode(
      buildPdf({ widthPt: 595, heightPt: 842, pages: [page('one'), page('two'), page('three')] }),
    )
    expect(text).toContain('/Count 3')
    expect(text).toContain('/Kids [5 0 R 7 0 R 9 0 R]')
    expect([...text.matchAll(/\/Type \/Page[^s]/g)]).toHaveLength(3)
  })

  it('rejects a document with no pages', () => {
    expect(() => buildPdf({ widthPt: 10, heightPt: 10, pages: [] })).toThrow()
  })

  it('declares WinAnsiEncoding on both fonts, matching how text is encoded', () => {
    const text = decode(simple())
    expect([...text.matchAll(/\/WinAnsiEncoding/g)]).toHaveLength(2)
  })

  it('embeds a JPEG with DCTDecode and the exact byte length', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
    const out = buildPdf({
      widthPt: 200,
      heightPt: 200,
      pages: [{ operators: new Content(200).image(0, 0, 100, 100).build() }],
      image: { jpeg, width: 4, height: 4 },
    })
    const text = decode(out)
    expect(text).toContain('/Filter /DCTDecode')
    expect(text).toContain(`/Length ${jpeg.length}`)
    expect(text).toContain('/XObject << /Im0 5 0 R >>')
  })

  it('keeps the content stream /Length equal to the actual stream bytes', () => {
    const ops = new Content(842).text(10, 20, 'x(ü)').rect(0, 0, 5, 5, '#ff0000').build()
    const text = decode(buildPdf({ widthPt: 595, heightPt: 842, pages: [{ operators: ops }] }))
    const declared = Number(/<< \/Length (\d+) >>\nstream\n/.exec(text)![1])
    expect(declared).toBe(ops.length)
  })
})

describe('Content coordinates', () => {
  it('converts top-down y to PDF bottom-up y', () => {
    // A rect 10pt tall whose top is 100 from the page top sits at y = 842 - 110 = 732.
    const ops = decode(new Content(842).rect(20, 100, 30, 10, '#000000').build())
    expect(ops).toContain('20 732 30 10 re f')
  })

  it('places a text baseline measured from the top', () => {
    const ops = decode(new Content(842).text(15, 50, 'hi').build())
    expect(ops).toContain('15 792 Td')
  })
})
