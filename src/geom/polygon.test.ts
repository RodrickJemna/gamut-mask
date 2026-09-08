import { describe, it } from 'vitest'

/**
 * CLAUDE.md names point-in-polygon with the even-odd rule, including non-convex and
 * self-intersecting polygons, as a test priority. That is the bulk of this file.
 */

describe('containsPoint — convex', () => {
  it.todo('centre of a triangle is inside, a point well outside is not')
  it.todo('agrees with a brute-force ray count on a dense grid over a square')
  it.todo('is unaffected by vertex order (CW and CCW give the same answer)')
  it.todo('handles a horizontal edge exactly level with the query point')
  it.todo('counts a vertex exactly on the test ray once, not twice')
})

describe('containsPoint — non-convex (D24)', () => {
  it.todo('an L shape: the notch is outside, both arms inside')
  it.todo('a star polygon: the concave pockets between points are outside')
})

describe('containsPoint — self-intersecting, even-odd (D24)', () => {
  it.todo('a bowtie: both lobes inside, the crossing point region excluded per even-odd')
  it.todo('a pentagram drawn as a 5-point self-crossing ring: the inner pentagon is OUTSIDE')
  it.todo('a doubled-back ring encloses zero area')
})

describe('containsPoint — degenerate', () => {
  it.todo('empty, 1-point and 2-point rings return false everywhere')
  it.todo('a zero-area (collinear) ring returns false everywhere')
})

describe('clampToDisk (D22)', () => {
  it.todo('leaves interior points bit-identical')
  it.todo('projects (1,1) radially onto the rim, not to (1,1)')
  it.todo('output radius is <= 1 for a dense sweep of far-outside points')
  it.todo('preserves the angle exactly when it clamps')
  it.todo('handles the origin without dividing by zero')
})

describe('signedArea / centroid', () => {
  it.todo('unit square has area 1; sign flips with winding')
  it.todo('centroid of a symmetric polygon is its centre of symmetry')
  it.todo('centroid is the area centroid, not the vertex mean (asymmetric test case)')
  it.todo('degenerate ring falls back to the vertex mean instead of NaN')
})
