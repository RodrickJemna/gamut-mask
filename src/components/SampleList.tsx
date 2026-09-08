/**
 * The colours inside the mask, grouped by wheel wedge. Spec: F6, D36, D25, D13, D16.
 *
 * The colours are the mask's centre, vertices and edge midpoints (D47), so the count
 * follows the shape of the mask rather than a slider.
 *
 * Row content is fixed by D36: swatch, hex, lightness, saturation. Lightness is Oklab L
 * on 0-100, saturation is the radius as a percentage. Clicking a row copies the hex.
 *
 * GROUPING. The samples arrive sorted by angle (D17), but one flat list reads badly for
 * palette work: you want to see the reds together and know at a glance which hue families
 * the mask touches. So they are bucketed into the six anchor wedges and shown in wheel
 * order, R Y G C B M.
 *
 * This also fixes a real wart in the flat list. Red's wedge straddles the 0/360 seam, so
 * sorting the default analogous wedge by raw angle put hues 0-21 at the top of the grid
 * and 339-349 at the bottom — colours adjacent on the wheel landed at opposite ends.
 * Ordering within a wedge uses `wedgeOffsetOf`, which unwraps the seam.
 *
 * All six wedges are always shown, empty ones included. For gamut masking, knowing which
 * hue families the mask EXCLUDES is as useful as seeing what it includes, and a fixed set
 * of headings keeps the layout from reflowing while the rotate slider moves.
 *
 * The lightness column is a DERIVED consequence, not a control (D16): no L slider, no
 * value ramp, no sorting by lightness.
 *
 * PAINT MATCHING (D40, D44, D48) lists the nearest bottle in each ENABLED brand that is
 * within the 5% tolerance — all that qualify, or "No paint found" when none do. With no
 * brands enabled the paint lines are omitted altogether: nothing was searched, so
 * "No paint found" would be a different and false claim. The difference is shown either way, because "nearest is 14% off" is more
 * useful than a bare refusal: it says how far outside real pigment the colour sits.
 * Expect the rim to be mostly unmatched, since no pigment reaches sRGB primary
 * saturation.
 */

import { useMemo, useState } from 'react'
import { lightnessLabel, saturationLabel, toHex } from '../color/format.ts'
import { ANCHORS, wedgeIndexOf, wedgeOffsetOf } from '../color/wheel.ts'
import type { Sample } from '../geom/sample.ts'
import { closestOverall, differencePercent, matchingPaints } from '../paints/match.ts'
import { BRAND_TAG, type Brand } from '../paints/types.ts'

type Props = {
  samples: Sample[]
  /** Brands to match against (D48). Empty means paint matching is off entirely. */
  brands: readonly Brand[]
  /** Index into `samples` currently highlighted on the wheel, or null (D46). */
  highlighted: number | null
  onHighlight: (index: number | null) => void
}

export function SampleList({ samples, brands, highlighted, onHighlight }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  /**
   * Buckets carry each sample's INDEX as well as the sample. The index is what gets
   * reported for highlighting: an index re-resolves against whatever `samples` currently
   * holds, so nudging a slider mid-hover cannot leave the wheel marking a position that
   * no longer exists.
   */
  const { neutrals, wedges } = useMemo(() => {
    const neutral: { sample: Sample; index: number }[] = []
    const buckets: { sample: Sample; index: number }[][] = ANCHORS.map(() => [])
    samples.forEach((sample, index) => {
      // A colour with no chroma has no hue, so filing it under a wedge would be a lie —
      // the mask's centre was landing under RED purely because a neutral's angle is
      // fixed at 0. It gets its own group instead.
      if (sample.t === 0) neutral.push({ sample, index })
      else buckets[wedgeIndexOf(sample.theta)].push({ sample, index })
    })
    for (const bucket of buckets) {
      bucket.sort((a, b) => wedgeOffsetOf(a.sample.theta) - wedgeOffsetOf(b.sample.theta))
    }
    return { neutrals: neutral, wedges: buckets }
  }, [samples])

  async function copy(hex: string) {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(hex)
      window.setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1000)
    } catch {
      // Rejects when the document is not focused, or outside a secure context. Never
      // claim success — the hex text is selectable as a fallback.
      setCopied(null)
    }
  }

  return (
    <section className="samples">
      <div className="samples-head">
        <h2>Colors in mask ({samples.length})</h2>
      </div>

      {samples.length === 0 ? (
        <p className="empty">No colours — the mask encloses no area.</p>
      ) : (
        <div className="wedges">
          {[
            ...(neutrals.length > 0
              ? [{ letter: '\u00b7', name: 'Neutral', bucket: neutrals, key: 'neutral' }]
              : []),
            ...ANCHORS.map((anchor, i) => ({
              letter: anchor.letter,
              name: anchor.name,
              bucket: wedges[i],
              key: anchor.letter,
            })),
          ].map(({ letter, name, bucket, key }) => {
            return (
              <section className="wedge" key={key}>
                <h3>
                  <span className="wedge-letter">{letter}</span>
                  {name}
                  <span className="wedge-count">{bucket.length}</span>
                </h3>

                {bucket.length === 0 ? (
                  <p className="wedge-empty">Not in mask</p>
                ) : (
                  <div className="samples-grid">
                    {bucket.map(({ sample, index }) => {
                      const hex = toHex(sample.rgb8)
                      // Keyed on identity, not index: index keys make React reuse a row
                      // for a different colour when the count changes, which shows as a
                      // swatch briefly displaying the wrong colour.
                      const key = `${hex}-${sample.x.toFixed(4)}-${sample.y.toFixed(4)}`
                      const matches = matchingPaints(sample.oklab, brands)
                      const closest = closestOverall(sample.oklab, brands)
                      return (
                        <button
                          key={key}
                          type="button"
                          className={index === highlighted ? 'sample highlighted' : 'sample'}
                          onClick={() => void copy(hex)}
                          onPointerEnter={() => onHighlight(index)}
                          onPointerLeave={() => onHighlight(null)}
                          // Focus as well as hover: the rows are buttons, so this comes
                          // almost free for anyone tabbing through the list.
                          onFocus={() => onHighlight(index)}
                          onBlur={() => onHighlight(null)}
                          title={
                            matches.length > 0
                              ? matches
                                  .map(
                                    (m) =>
                                      `${m.paint.brand} ${m.paint.ref} ${m.paint.name} (${m.paint.range})`,
                                  )
                                  .join('\n')
                              : 'Copy hex — no paint within 5%'
                          }
                        >
                          <span className="sample-swatch" style={{ background: hex }} />
                          <span className="sample-hex">
                            {copied === hex ? 'copied' : hex}
                          </span>
                          <span className="sample-nums">
                            L {lightnessLabel(sample.oklab.L)} &middot; S{' '}
                            {saturationLabel(sample.t)}%
                          </span>
                          <span className="sample-paints">
                            {/* Nothing at all when no brand is being searched. */}
                            {closest === null ? null : matches.length === 0 ? (
                              <span className="sample-paint-row">
                                <span className="sample-paint none">No paint found</span>
                                <span className="sample-delta none">
                                  &Delta;{differencePercent(closest.distance)}%
                                </span>
                              </span>
                            ) : (
                              matches.map((m) => (
                                <span className="sample-paint-row" key={m.paint.brand}>
                                  <span className="sample-paint">
                                    <span className="paint-brand">
                                      {BRAND_TAG[m.paint.brand]}
                                    </span>
                                    <span className="paint-ref">{m.paint.ref}</span>
                                    {m.paint.name}
                                  </span>
                                  <span className="sample-delta">
                                    &Delta;{differencePercent(m.distance)}%
                                  </span>
                                </span>
                              ))
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
