/**
 * Paint catalogue types, shared by the per-brand data modules. Spec: D40, D44.
 */

/**
 * The brands matched against. Each is matched independently, so a colour can match any
 * subset of them, or none — see `nearestPerBrand`.
 *
 * BRANDS is the single list everything derives from: the filter checkboxes (D48), the
 * reachability fields (D50) and the sheet's row height all read it, so adding a
 * catalogue is this line plus a data module.
 */
export type Brand = 'AK' | 'Vallejo' | 'Pro Acryl'

export const BRANDS: readonly Brand[] = ['AK', 'Vallejo', 'Pro Acryl']

/** Short badge used where the full brand name will not fit. */
export const BRAND_TAG: Record<Brand, string> = {
  AK: 'AK',
  Vallejo: 'VJ',
  'Pro Acryl': 'PA',
}

export type Paint = {
  brand: Brand
  /** Manufacturer reference, e.g. 'AK11029', '70.951' or 'S36'. */
  ref: string
  name: string
  /** Product line, for display alongside the ref. */
  range: string
  /** Catalogue swatch colour, '#rrggbb'. */
  hex: string
}
