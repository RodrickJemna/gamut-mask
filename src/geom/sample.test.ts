import { describe, it } from 'vitest'

/**
 * CLAUDE.md test priority: "identical mask input must produce an identical sample list".
 * That is the first describe block and it is the reason this module is not random.
 */

describe('determinism (D17)', () => {
  it.todo('same polygon and n, called twice, gives a bit-identical Sample[]')
  it.todo('a fresh copy of the same polygon (different object) gives an identical list')
  it.todo('vertex order rotated by one gives the same set of sample positions')
  it.todo('does not depend on call order or on any module-level mutable state')
  it.todo('rotating the mask by 360 deg reproduces the original list within 1e-9')
})

describe('count (D17, D25)', () => {
  it.todo('returns exactly n for a large mask, for n = 4, 12 and 32')
  it.todo('returns fewer than n for a mask too small to hold them, without throwing')
  it.todo('returns an empty array for a zero-area polygon')
  it.todo('terminates on a thin sliver polygon (regression: pitch search must not hang)')
  it.todo('never returns more than n')
})

describe('placement', () => {
  it.todo('every sample is inside the polygon by the same even-odd rule (D24)')
  it.todo('every sample is inside the disk')
  it.todo('samples of a non-convex mask avoid the notch')
  it.todo('samples of a bowtie mask land in both lobes, none in the excluded middle')
  it.todo('no two samples coincide')
  it.todo('Lloyd iterations reduce nearest-neighbour distance variance vs the raw grid')
})

describe('ordering and payload', () => {
  it.todo('sorted by theta ascending')
  it.todo('theta and t match angleOf/radiusOf of x,y')
  it.todo('rgb8 matches wheel.sampleSrgb8(theta, t)')
  it.todo('a mask on one hue family yields samples spanning a narrow theta range')
})
