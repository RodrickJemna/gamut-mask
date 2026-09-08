/**
 * Paint catalogue types, shared by the per-brand data modules. Spec: D40, D44.
 */

/**
 * The brands matched against. Both are matched independently, so a colour can match one,
 * both, or neither — see `nearestPerBrand`.
 */
export type Brand = 'AK' | 'Vallejo'

export const BRANDS: readonly Brand[] = ['AK', 'Vallejo']

/** Short badge used where the full brand name will not fit. */
export const BRAND_TAG: Record<Brand, string> = { AK: 'AK', Vallejo: 'VJ' }

export type Paint = {
  brand: Brand
  /** Manufacturer reference, e.g. 'AK11029' or '70.951'. */
  ref: string
  name: string
  /** Product line, for display alongside the ref. */
  range: string
  /** Catalogue swatch colour, '#rrggbb'. */
  hex: string
}
