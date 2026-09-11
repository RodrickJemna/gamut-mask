/**
 * The 60-30-10 suggestions, across the bottom of the page. Spec: D54.
 *
 * Three schemes side by side, each a proportional bar: the segment widths ARE the 60, 30
 * and 10 percent, so the recommendation is legible as a picture of a paint job rather
 * than as three swatches of equal size. Reading the bar left to right is reading the
 * model from its largest area to its smallest, which is the order you paint in.
 *
 * The BIAS figure is shown, not hidden: how far off the neutral the area-weighted palette
 * lands, 0% being balanced. A narrow gamut cannot get near zero — every colour in an
 * analogous mask pulls the same way — and the number is the only honest way to say so.
 * This panel shows L, S and paint deltas for the same reason.
 *
 * Hovering a segment rings that colour on the wheel, reusing D46 rather than inventing a
 * second highlight: the schemes are drawn from the same samples as the list, so the same
 * index means the same thing.
 */

import { useMemo } from 'react'
import { toHex } from '../color/format.ts'
import type { Sample } from '../geom/sample.ts'
import { matchingPaints } from '../paints/match.ts'
import { BRAND_TAG, type Brand } from '../paints/types.ts'
import { buildSchemes, type Scheme } from '../palette/scheme.ts'

type Props = {
  samples: Sample[]
  brands: readonly Brand[]
  /** Index into `samples`, for the D46 ring on the wheel. */
  onHighlight: (index: number | null) => void
  highlighted: number | null
}

const ROLE_NAMES = ['Dominant', 'Secondary', 'Accent']

export function SchemeStrip({ samples, brands, onHighlight, highlighted }: Props) {
  const schemes = useMemo(() => buildSchemes(samples, 3), [samples])

  /**
   * Which sample each role is, so hovering can drive the wheel's ring. Matched by
   * position rather than by colour: two samples can share a hex (a mask crossing itself
   * can land on the same colour twice) and the ring needs the right one.
   */
  const indexOf = useMemo(() => {
    const map = new Map<Sample, number>()
    samples.forEach((sample, i) => map.set(sample, i))
    return map
  }, [samples])

  const paintsFor = useMemo(() => {
    const map = new Map<Sample, string>()
    for (const scheme of schemes) {
      for (const role of scheme.roles) {
        if (map.has(role.sample)) continue
        const matches = matchingPaints(role.sample.oklab, brands)
        map.set(
          role.sample,
          matches.length === 0
            ? 'No paint within 5%'
            : matches
                .map((m) => `${BRAND_TAG[m.paint.brand]} ${m.paint.ref} ${m.paint.name}`.trim())
                .join('\n'),
        )
      }
    }
    return map
  }, [schemes, brands])

  return (
    <section className="schemes" aria-label="60-30-10 palettes">
      <div className="schemes-head">
        <h2>60&ndash;30&ndash;10</h2>
        <span className="schemes-note">
          Areas balance inversely to lightness &times; chroma and the hues oppose, so the
          weighted palette sits on the neutral (Munsell). Dominant most muted, accent
          strongest.
        </span>
      </div>

      {schemes.length === 0 ? (
        <p className="schemes-empty">
          {samples.length < 3
            ? `Only ${samples.length} distinguishable ${
                samples.length === 1 ? 'colour' : 'colours'
              } in this mask — widen it, or pick a wheel that spreads them further apart.`
            : 'No scheme here: a palette needs an accent with some chroma in it.'}
        </p>
      ) : (
        <div className="scheme-list">
          {schemes.map((scheme, n) => (
            <SchemeBar
              key={n}
              scheme={scheme}
              indexOf={indexOf}
              paintsFor={paintsFor}
              onHighlight={onHighlight}
              highlighted={highlighted}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SchemeBar({
  scheme,
  indexOf,
  paintsFor,
  onHighlight,
  highlighted,
}: {
  scheme: Scheme
  indexOf: Map<Sample, number>
  paintsFor: Map<Sample, string>
  onHighlight: (index: number | null) => void
  highlighted: number | null
}) {
  return (
    <div className="scheme">
      <div className="scheme-bar">
        {scheme.roles.map((role, i) => {
          const hex = toHex(role.sample.rgb8)
          const index = indexOf.get(role.sample) ?? null
          return (
            <button
              key={i}
              type="button"
              className={index !== null && index === highlighted ? 'seg on' : 'seg'}
              style={{ flexGrow: role.share, background: hex }}
              onPointerEnter={() => onHighlight(index)}
              onPointerLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(index)}
              onBlur={() => onHighlight(null)}
              title={`${ROLE_NAMES[i]} — ${Math.round(role.share * 100)}% — ${hex}\n${
                paintsFor.get(role.sample) ?? ''
              }`}
              aria-label={`${ROLE_NAMES[i]}, ${Math.round(role.share * 100)} percent, ${hex}`}
            />
          )
        })}
      </div>
      {/*
        The labels are NOT aligned to the segments. They were, which reads well until you
        notice the 10% cell is 31px wide at 1024 and 40px at 1280 — neither fits a hex, so
        every accent's code was clipped. The bar above already carries the proportions;
        the legend only has to be readable, so it flows at natural width.
      */}
      <div className="scheme-legend">
        {scheme.roles.map((role, i) => (
          <span key={i} className="scheme-role">
            <span className="scheme-share">{Math.round(role.share * 100)}%</span>
            <span className="sample-hex">{toHex(role.sample.rgb8)}</span>
          </span>
        ))}
        <span
          className="scheme-balance"
          title="How far off the neutral this palette sits: the area-weighted sum of lightness x chroma, as a share of its own total. 0% balances on middle grey; a narrow gamut cannot get near it, because all of its colours pull the same way."
        >
          bias {Math.round(scheme.bias * 100)}%
        </span>
      </div>
    </div>
  )
}
