import { describe, expect, it } from 'vitest'
import { sheetFileName } from './name.ts'

describe('sheetFileName', () => {
  it('shares the hash across formats, so the pair is obviously one sheet', () => {
    const hexes = ['#ce5d4f', '#83a874']
    expect(sheetFileName(hexes, 'pdf').replace('.pdf', '')).toBe(
      sheetFileName(hexes, 'jpg').replace('.jpg', ''),
    )
  })

  it('is deterministic for the same palette', () => {
    const hexes = ['#ce5d4f', '#ab7168', '#aa8e6d']
    expect(sheetFileName(hexes, 'pdf')).toBe(sheetFileName([...hexes], 'pdf'))
  })

  it('differs when a colour differs', () => {
    expect(sheetFileName(['#ce5d4f', '#ab7168'], 'pdf')).not.toBe(
      sheetFileName(['#ce5d4f', '#ab7169'], 'pdf'),
    )
  })

  it('differs when the order differs — a rearranged palette is a different palette', () => {
    expect(sheetFileName(['#ce5d4f', '#ab7168'], 'pdf')).not.toBe(
      sheetFileName(['#ab7168', '#ce5d4f'], 'pdf'),
    )
  })

  it('is a safe, fixed-shape filename', () => {
    expect(sheetFileName(['#ce5d4f'], 'pdf')).toMatch(/^gamut-[0-9a-f]{8}\.pdf$/)
    expect(sheetFileName([], 'jpg')).toMatch(/^gamut-[0-9a-f]{8}\.jpg$/)
  })

  it('does not collide across a large set of realistic palettes', () => {
    const names = new Set<string>()
    for (let i = 0; i < 4000; i++) {
      const palette = Array.from({ length: 12 }, (_, k) =>
        `#${(((i * 7919 + k * 104729) % 0xffffff) >>> 0).toString(16).padStart(6, '0')}`,
      )
      names.add(sheetFileName(palette, 'pdf'))
    }
    expect(names.size).toBe(4000)
  })
})
