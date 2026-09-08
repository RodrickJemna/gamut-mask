import { describe, it } from 'vitest'

describe('rotate', () => {
  it.todo('rotate by 0 is the identity, bit-identical')
  it.todo('rotate by 360 returns the original within 1e-12')
  it.todo('preserves every vertex radius exactly')
  it.todo('advances every vertex angle by exactly delta (mod 360)')
  it.todo('rotate(a) then rotate(b) equals rotate(a+b) within 1e-12')
  it.todo('preserves area and vertex count')
  it.todo('accepts negative and >360 deltas')
  it.todo('does not mirror: winding order is unchanged')
})

describe('scale', () => {
  it.todo('scale by 1 is the identity, bit-identical')
  it.todo('preserves every vertex angle exactly')
  it.todo('multiplies interior vertex radii by the factor')
  it.todo('clamps vertices that would leave the disk (D22), keeping their angle')
  it.todo('scale by 0 collapses every vertex to the origin without NaN')
  it.todo('output is always inside the disk for large factors')
})

describe('rotate and scale commute', () => {
  it.todo('rotate then scale equals scale then rotate, for factors that do not clamp')
})
