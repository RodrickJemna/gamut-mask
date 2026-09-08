import { describe, it } from 'vitest'

describe('coordinate convention (implementation-plan section 2)', () => {
  it.todo('dir(0) is (0,-1) — R points up')
  it.todo('dir(90) is (1,0), dir(180) is (0,1), dir(270) is (-1,0) — clockwise on screen')
  it.todo('angleOf(dir(t)) === t for t in 0..359')
  it.todo('angleOf normalises to [0,360): negative and >360 inputs wrap')
  it.todo('polar/angleOf/radiusOf round trip for t in 0..1')
})

describe('anchors (D21, D34)', () => {
  it.todo('six anchors, exactly 60 deg apart, R at 0')
  it.todo('order clockwise is R Y G C B M')
  it.todo('complements are 180 deg apart: R-C, Y-B, G-M')
})

describe('rim (D35)', () => {
  it.todo('anchor angles give exact sRGB primaries/secondaries: R=#ff0000 ... M=#ff00ff')
  it.todo('every rim colour has one channel at 1 and one at 0')
  it.todo('rim is continuous in theta, including across the 360/0 seam')
  it.todo('rim is in gamut for all theta (it is the hexagon, so by construction)')
})

describe('sample (the model)', () => {
  it.todo('t = 0 is the neutral centre for every theta: a = b = 0, L = 0.6')
  it.todo('t = 1 equals rimOklab(theta)')
  it.todo('t = 1 round-trips to the exact rim sRGB byte triple')
  it.todo('within one hue, Oklab chroma is monotonically non-decreasing in t')
  it.todo('is continuous across the 360/0 seam at every t')
  it.todo('never returns NaN or out-of-range bytes over a dense (theta, t) sweep')
  it.todo('stays on its Oklab hue line: a/b ratio constant in t, up to chroma reduction')
})
