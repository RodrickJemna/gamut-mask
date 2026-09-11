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
export type Brand = 'AK' | 'Vallejo' | 'Pro Acryl' | 'Citadel'

export const BRANDS: readonly Brand[] = ['AK', 'Vallejo', 'Pro Acryl', 'Citadel']

/** Short badge used where the full brand name will not fit. */
export const BRAND_TAG: Record<Brand, string> = {
  AK: 'AK',
  Vallejo: 'VJ',
  'Pro Acryl': 'PA',
  Citadel: 'CT',
}

export type Paint = {
  brand: Brand
  /**
   * Manufacturer reference, e.g. 'AK11029', '70.951' or 'S36'.
   *
   * Citadel has no printed codes — its paints are identified by name — so for that brand
   * the ref IS the name and `name` is empty, rather than rendering the same string twice
   * in every row. Unique within a brand either way, which is what identifies a bottle.
   */
  ref: string
  /** Empty where the ref already is the name; see above. */
  name: string
  /** Product line, for display alongside the ref. */
  range: string
  /** Catalogue swatch colour, '#rrggbb'. */
  hex: string
}
