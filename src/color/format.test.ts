import { describe, expect, it } from 'vitest'
import { lightnessLabel, saturationLabel, toHex } from './format.ts'

/**
 * The plan called this file too small to test. Added anyway: the hex string is the tool's
 * only output (D13), and a missing zero-pad is exactly the kind of defect that ships.
 */

describe('toHex', () => {
  it('formats the primaries and the extremes', () => {
    expect(toHex([255, 0, 0])).toBe('#ff0000')
    expect(toHex([0, 0, 0])).toBe('#000000')
    expect(toHex([255, 255, 255])).toBe('#ffffff')
  })

  it('zero-pads single-digit channels', () => {
    expect(toHex([1, 2, 3])).toBe('#010203')
    expect(toHex([0, 15, 16])).toBe('#000f10')
  })

  it('is lower case and always 7 characters', () => {
    for (let v = 0; v < 256; v++) {
      const hex = toHex([v, 255 - v, (v * 7) % 256])
      expect(hex).toHaveLength(7)
      expect(hex).toBe(hex.toLowerCase())
      expect(hex.startsWith('#')).toBe(true)
    }
  })
})

describe('display numbers (D36)', () => {
  it('scales Oklab L to 0..100', () => {
    expect(lightnessLabel(0)).toBe(0)
    expect(lightnessLabel(0.6)).toBe(60)
    expect(lightnessLabel(1)).toBe(100)
  })

  it('scales radius t to 0..100', () => {
    expect(saturationLabel(0)).toBe(0)
    expect(saturationLabel(0.125)).toBe(13)
    expect(saturationLabel(1)).toBe(100)
  })

  it('returns integers', () => {
    for (let i = 0; i <= 100; i++) {
      expect(Number.isInteger(lightnessLabel(i / 100))).toBe(true)
      expect(Number.isInteger(saturationLabel(i / 100))).toBe(true)
    }
  })
})
