/**
 * The combined catalogue. Spec: D40, D44, D51.
 *
 * One flat list, with each paint carrying its brand, because matching runs per brand and
 * a single scan that partitions by brand is simpler than keeping parallel structures.
 */

import { AK_PAINTS } from './ak.ts'
import { PRO_ACRYL_PAINTS } from './proacryl.ts'
import { VALLEJO_PAINTS } from './vallejo.ts'
import type { Paint } from './types.ts'

export const PAINTS: readonly Paint[] = [
  ...AK_PAINTS,
  ...VALLEJO_PAINTS,
  ...PRO_ACRYL_PAINTS,
]

export type { Brand, Paint } from './types.ts'
export { BRANDS, BRAND_TAG } from './types.ts'
