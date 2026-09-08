import { beforeAll, describe, expect, it } from 'vitest'
import { renderDisk } from './render.ts'

/**
 * Geometry only, not appearance — this locks the D21 orientation, which is the easiest
 * thing in the project to get subtly wrong: flipping the y axis or the sign of the angle
 * mirrors the whole wheel and every other module inherits it silently.
 *
 * Not a UI test. ImageData is stubbed to three fields; no DOM, no React, no jsdom.
 */

class StubImageData {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}

beforeAll(() => {
  ;(globalThis as unknown as { ImageData: unknown }).ImageData = StubImageData
})

const SIDE = 101
const mid = (SIDE - 1) / 2

function pixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
}

/** Which channel dominates — enough to identify a hue family without pinning bytes. */
function dominant(p: [number, number, number, number]): string {
  const [r, g, b] = p
  return [
    r > 200 ? 'R' : '',
    g > 200 ? 'G' : '',
    b > 200 ? 'B' : '',
  ].join('')
}

describe('renderDisk', () => {
  it('is square and sized by size * dpr', () => {
    const img = renderDisk(50, 2)
    expect(img.width).toBe(100)
    expect(img.height).toBe(100)
    expect(img.data).toHaveLength(100 * 100 * 4)
  })

  it('leaves the corners outside the disk transparent', () => {
    const img = renderDisk(SIDE, 1)
    for (const [x, y] of [[0, 0], [SIDE - 1, 0], [0, SIDE - 1], [SIDE - 1, SIDE - 1]]) {
      expect(pixel(img, x, y)[3]).toBe(0)
    }
  })

  it('is opaque at the centre and along the cardinal radii', () => {
    const img = renderDisk(SIDE, 1)
    expect(pixel(img, mid, mid)[3]).toBe(255)
    expect(pixel(img, mid, 1)[3]).toBe(255)
    expect(pixel(img, mid, SIDE - 2)[3]).toBe(255)
  })

  it('has a neutral centre — equal channels (D35: Oklab L = 0.6)', () => {
    const img = renderDisk(SIDE, 1)
    const [r, g, b] = pixel(img, mid, mid)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  /**
   * D21: red up, clockwise. In wheel space y grows down, so "up" is the low row index.
   */
  it('puts red at the top and cyan at the bottom (D21)', () => {
    const img = renderDisk(SIDE, 1)
    expect(dominant(pixel(img, mid, 1))).toBe('R')
    expect(dominant(pixel(img, mid, SIDE - 2))).toBe('GB')
  })

  it('runs clockwise: yellow-green at 3 o clock, violet at 9 o clock (D21)', () => {
    const img = renderDisk(SIDE, 1)
    // 90 deg is between Y (60) and G (120); 270 deg is between B (240) and M (300).
    expect(dominant(pixel(img, SIDE - 2, mid))).toBe('G')
    expect(dominant(pixel(img, 1, mid))).toBe('B')
  })

  it('is not mirrored: the top-right octant is warmer than the top-left', () => {
    const img = renderDisk(SIDE, 1)
    const off = Math.round(mid * 0.6)
    const right = pixel(img, mid + off, mid - off)
    const left = pixel(img, mid - off, mid - off)
    // Clockwise from red, the right side heads to yellow (green rises), the left to
    // magenta (blue rises).
    expect(right[1]).toBeGreaterThan(left[1])
    expect(left[2]).toBeGreaterThan(right[2])
  })

  it('feathers the rim rather than cutting it hard', () => {
    const img = renderDisk(201, 1)
    const alphas = new Set<number>()
    for (let x = 0; x < img.width; x++) {
      for (let y = 0; y < img.height; y++) {
        const a = pixel(img, x, y)[3]
        if (a > 0 && a < 255) alphas.add(a)
      }
    }
    expect(alphas.size).toBeGreaterThan(0)
  })
})
