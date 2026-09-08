/**
 * The colours inside the mask, grouped by wheel wedge. Spec: F6, D36, D25, D13, D16.
 *
 * Row content is fixed by D36: swatch, hex, lightness, saturation. Lightness is Oklab L
 * on 0-100, saturation is the radius as a percentage. Clicking a row copies the hex —
 * the clipboard is the only export in v1 (D13).
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
 * PAINT MATCHING (D40) shows the nearest bottle in the AK catalogue, or "No paint found"
 * when the nearest is further than the 5% tolerance. The difference is shown either way,
 * because "nearest is 14% off" is more useful than a bare refusal — it tells you how far
 * outside real pigment the colour sits. Expect the rim to be mostly unmatched: no
 * pigment reaches sRGB primary saturation.
 */

import { useMemo, useState } from 'react'
import { lightnessLabel, saturationLabel, toHex } from '../color/format.ts'
import { ANCHORS, wedgeIndexOf, wedgeOffsetOf } from '../color/wheel.ts'
import type { Sample } from '../geom/sample.ts'
import { differencePercent, isWithinTolerance, nearestPaint } from '../paints/match.ts'

type Props = {
  samples: Sample[]
  requested: number
}

export function SampleList({ samples, requested }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  const wedges = useMemo(() => {
    const buckets: Sample[][] = ANCHORS.map(() => [])
    for (const sample of samples) buckets[wedgeIndexOf(sample.theta)].push(sample)
    for (const bucket of buckets) {
      bucket.sort((a, b) => wedgeOffsetOf(a.theta) - wedgeOffsetOf(b.theta))
    }
    return buckets
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
        <h2>
          Colors in mask ({samples.length}
          {/* D25: report the real count rather than padding to the requested one. */}
          {samples.length < requested ? ` of ${requested} — mask too small` : ''})
        </h2>
      </div>

      {samples.length === 0 ? (
        <p className="empty">No colours — the mask encloses no area.</p>
      ) : (
        <div className="wedges">
          {ANCHORS.map((anchor, i) => {
            const bucket = wedges[i]
            return (
              <section className="wedge" key={anchor.letter}>
                <h3>
                  <span className="wedge-letter">{anchor.letter}</span>
                  {anchor.name}
                  <span className="wedge-count">{bucket.length}</span>
                </h3>

                {bucket.length === 0 ? (
                  <p className="wedge-empty">Not in mask</p>
                ) : (
                  <div className="samples-grid">
                    {bucket.map((sample) => {
                      const hex = toHex(sample.rgb8)
                      // Keyed on identity, not index: index keys make React reuse a row
                      // for a different colour when the count changes, which shows as a
                      // swatch briefly displaying the wrong colour.
                      const key = `${hex}-${sample.x.toFixed(4)}-${sample.y.toFixed(4)}`
                      const match = nearestPaint(sample.oklab)
                      const close = isWithinTolerance(match)
                      return (
                        <button
                          key={key}
                          type="button"
                          className="sample"
                          onClick={() => void copy(hex)}
                          title={
                            close
                              ? `Copy hex — nearest paint ${match.paint.ref} ${match.paint.name} (${match.paint.range})`
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
                          {close ? (
                            <span className="sample-paint">
                              <span className="paint-ref">{match.paint.ref}</span>
                              {match.paint.name}
                            </span>
                          ) : (
                            <span className="sample-paint none">No paint found</span>
                          )}
                          <span className={close ? 'sample-delta' : 'sample-delta none'}>
                            &Delta;{differencePercent(match.distance)}%
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
