import { describe, expect, it } from 'vitest'
import { sample as wheelSample } from '../color/wheel.ts'
import {
  FIELD_T,
  FIELD_THETA,
  REACH_LIMIT,
  brandField,
  combinedField,
  fieldAt,
  isReachable,
} from './coverage.ts'
import { isWithinTolerance, matchingPaints } from './match.ts'
import { BRANDS } from './types.ts'

/**
 * The load-bearing property is AGREEMENT: the region shaded on the wheel and the words in
 * the colour list are two readings of the same question, and D40 already has a scar from
 * letting two such readings drift apart ("No paint found" beside "Δ5%").
 */
describe('reachability agrees with matching', () => {
  it('uses the same threshold isWithinTolerance does', () => {
    for (let d = 0; d <= 0.12; d += 0.0001) {
      expect(d < REACH_LIMIT).toBe(isWithinTolerance({ paint: null!, distance: d, drift: null }))
    }
  })

  /**
   * Checked at GRID NODES, where the field holds an exact nearest distance and no
   * interpolation is involved — between nodes the two may legitimately disagree by the
   * interpolation error, which is the price of a smooth boundary.
   *
   * Subsampled: every node against the whole catalogue would be 30M distance evaluations.
   */
  it('matches matchingPaints at the grid nodes', () => {
    const field = combinedField(BRANDS)
    expect(field).not.toBeNull()
    if (!field) return

    let checked = 0
    for (let i = 0; i < FIELD_THETA; i += 12) {
      for (let j = 0; j < FIELD_T; j += 4) {
        const theta = (i * 360) / FIELD_THETA
        const t = j / (FIELD_T - 1)
        const listSays = matchingPaints(wheelSample(theta, t), BRANDS).length > 0
        expect(isReachable(field, theta, t)).toBe(listSays)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(400)
  })

  it('agrees per brand as well as combined', () => {
    for (const brand of BRANDS) {
      const field = combinedField([brand])
      expect(field).not.toBeNull()
      if (!field) continue
      for (let i = 0; i < FIELD_THETA; i += 30) {
        for (let j = 0; j < FIELD_T; j += 8) {
          const theta = (i * 360) / FIELD_THETA
          const t = j / (FIELD_T - 1)
          const listSays = matchingPaints(wheelSample(theta, t), [brand]).length > 0
          expect(isReachable(field, theta, t)).toBe(listSays)
        }
      }
    }
  })
})

describe('fieldAt', () => {
  const field = brandField('AK')

  it('returns the stored value exactly at a grid node', () => {
    for (const [i, j] of [
      [0, 0],
      [17, 5],
      [200, 63],
      [359, 30],
    ] as const) {
      expect(fieldAt(field, (i * 360) / FIELD_THETA, j / (FIELD_T - 1))).toBeCloseTo(
        field[i * FIELD_T + j],
        6,
      )
    }
  })

  it('wraps in theta, so there is no seam at 0 degrees', () => {
    // 0 is where the first anchor sits, so a discontinuity there would be the most
    // visible one on the wheel.
    expect(fieldAt(field, 360, 0.5)).toBeCloseTo(fieldAt(field, 0, 0.5), 12)
    // t is pinned to an exact radial node (j = 32), so only the theta interpolation is
    // under test: at a t between nodes the result mixes four cells, not two.
    const j = 32
    const t = j / (FIELD_T - 1)
    const across = fieldAt(field, 359.5, t)
    const a = field[359 * FIELD_T + j]
    const b = field[0 * FIELD_T + j]
    // Interpolating across the seam must land between its two neighbours, not jump.
    expect(across).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-6)
    expect(across).toBeLessThanOrEqual(Math.max(a, b) + 1e-6)
    expect(across).toBeCloseTo((a + b) / 2, 6)
  })

  it('clamps the radius instead of reading out of bounds', () => {
    expect(fieldAt(field, 90, -1)).toBe(fieldAt(field, 90, 0))
    expect(fieldAt(field, 90, 5)).toBe(fieldAt(field, 90, 1))
    expect(Number.isFinite(fieldAt(field, 90, 1))).toBe(true)
  })

  it('handles negative angles', () => {
    expect(fieldAt(field, -90, 0.4)).toBeCloseTo(fieldAt(field, 270, 0.4), 12)
  })
})

describe('combinedField', () => {
  it('is null when no brand is enabled', () => {
    // Not an all-unreachable field: nothing was searched, so there is nothing to assert.
    expect(combinedField([])).toBeNull()
  })

  it('is the per-cell minimum of the brands it combines', () => {
    // Over every brand, not a hardcoded pair — this test named AK and Vallejo and so
    // silently stopped covering the combination the moment a third catalogue arrived.
    // Arrow, not a bare reference: `map` passes the index as the second argument, which
    // brandField now reads as a wheel (D53).
    const fields = BRANDS.map((brand) => brandField(brand))
    const all = combinedField(BRANDS)
    expect(all).not.toBeNull()
    if (!all) return
    for (let i = 0; i < all.length; i += 97) {
      expect(all[i]).toBeCloseTo(Math.min(...fields.map((f) => f[i])), 6)
    }
  })

  it('does not depend on the order the brands are given in', () => {
    const a = combinedField(['AK', 'Vallejo'])
    const b = combinedField(['Vallejo', 'AK'])
    expect(a).toBe(b)
  })

  it('never makes a colour less reachable by enabling another brand', () => {
    const ak = combinedField(['AK'])
    const both = combinedField(BRANDS)
    if (!ak || !both) throw new Error('expected fields')
    for (let i = 0; i < both.length; i++) expect(both[i]).toBeLessThanOrEqual(ak[i])
  })
})

/**
 * Records what the scrim actually covers, because the number in the plan doc was
 * misleading: 73.4% is coverage per CELL of a uniform theta-t grid, which over-counts the
 * centre — a cell at t = 0.05 covers a twentieth of the area of one at t = 1. By AREA,
 * which is what the eye sees, the two catalogues together reach only about 58%.
 */
describe('what the two catalogues actually cover', () => {
  it('covers about 58% of the disk by area, not 73%', () => {
    const field = combinedField(BRANDS)
    if (!field) throw new Error('expected a field')
    let area = 0
    let reached = 0
    let cells = 0
    let cellsReached = 0
    for (let i = 0; i < FIELD_THETA; i++) {
      for (let j = 0; j < FIELD_T; j++) {
        const t = j / (FIELD_T - 1)
        const ok = field[i * FIELD_T + j] < REACH_LIMIT
        const weight = t + 0.5 / (FIELD_T - 1)
        area += weight
        cells++
        if (ok) {
          reached += weight
          cellsReached++
        }
      }
    }
    const byArea = reached / area
    const byCell = cellsReached / cells
    expect(byArea).toBeGreaterThan(0.5)
    expect(byArea).toBeLessThan(0.65)
    // The old figure, reproduced here so the difference is on the record rather than a
    // contradiction between two documents.
    expect(byCell).toBeGreaterThan(0.7)
    expect(byCell).toBeLessThan(0.77)
    expect(byCell - byArea).toBeGreaterThan(0.1)
  })

  it('is not simply "the rim" — some hues run out at half saturation', () => {
    const field = combinedField(BRANDS)
    if (!field) throw new Error('expected a field')
    const firstUnreachable = (theta: number) => {
      for (let j = 0; j < FIELD_T; j++) {
        const t = j / (FIELD_T - 1)
        if (!isReachable(field, theta, t)) return t
      }
      return 1
    }
    // Red reaches the rim; blue and magenta give out well inside it. This is why a
    // counter alone is not enough — the shape is not guessable.
    expect(firstUnreachable(0)).toBeGreaterThan(0.9)
    expect(firstUnreachable(240)).toBeLessThan(0.6)
    expect(firstUnreachable(300)).toBeLessThan(0.6)
  })
})
