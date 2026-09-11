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
 * The heading carries a COUNT of how many samples have a bottle at all (D50). It is the
 * cheap half of reachability feedback: the scrim on the wheel says where paint runs out
 * before you place a mask, this says how the mask you have actually did.
 *
 * Each matched row also carries ONE word for how the bottle differs from the swatch —
 * darker, lighter, greyer or stronger (D49). It is a comparison between two known
 * colours, not a lightness axis on the wheel (D16): see driftLabel in paints/match.ts for
 * why chroma is reported alongside lightness rather than lightness alone.
 *
 * A colour you can ALREADY PAINT is marked green (D59): a ring around the swatch when any
 * of its matches is on the shelf, and the green brand tag says which bottle it is. The
 * mark goes on the swatch rather than the card border, because that border is already
 * saying two things — hover, and the highlight that mirrors the wheel's ring — and the
 * highlight has to win, which would hide the mark exactly while you point at the row.
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
import { paintKey } from '../paints/inventory.ts'
import { closestOverall, differencePercent, matchingPaints } from '../paints/match.ts'
import { BRAND_TAG, type Brand } from '../paints/types.ts'

type Props = {
  samples: Sample[]
  /** Brands to match against (D48). Empty means paint matching is off entirely. */
  brands: readonly Brand[]
  /** The shelf to restrict matching to, or null for the whole catalogues (D57). */
  owned: ReadonlySet<string> | null
  /**
   * The shelf itself, whichever way `owned` is set: what the green marker tests against
   * (D59). With the Only-mine filter on, every match is owned by construction and every
   * matched swatch is ringed — redundant, but a rule with no exceptions is easier to read
   * than one that means something different in each mode, and a ringed swatch still says
   * the useful thing beside the rows that found nothing.
   */
  shelf: ReadonlySet<string>
  /** Index into `samples` currently highlighted on the wheel, or null (D46). */
  highlighted: number | null
  onHighlight: (index: number | null) => void
}

export function SampleList({
  samples,
  brands,
  owned,
  shelf,
  highlighted,
  onHighlight,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  /**
   * Buckets carry each sample's INDEX as well as the sample. The index is what gets
   * reported for highlighting: an index re-resolves against whatever `samples` currently
   * holds, so nudging a slider mid-hover cannot leave the wheel marking a position that
   * no longer exists.
   */
  /**
   * Matching for every sample, computed ONCE per (samples, brands) rather than inline in
   * the row. It was being done twice per row already — `matchingPaints` and
   * `closestOverall` each scan every enabled brand's catalogue — and the D50 counter
   * needs the same answer a third time. Roughly 1300 distance evaluations per sample per
   * brand, on every render including every drag frame, so hoisting it is not premature.
   */
  const matched = useMemo(
    () =>
      samples.map((sample) => ({
        matches: matchingPaints(sample.oklab, brands, owned),
        closest: closestOverall(sample.oklab, brands, owned),
      })),
    [samples, brands, owned],
  )

  /**
   * D50 — how many samples have a bottle at all. Not shown when no brand is enabled:
   * nothing was searched, so "0 of 13" would be a false claim rather than a finding.
   */
  const matchedCount = matched.filter((m) => m.matches.length > 0).length

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
        {brands.length > 0 && samples.length > 0 && (
          <span
            className={matchedCount < samples.length ? 'coverage short' : 'coverage'}
            title="Samples with at least one paint within 5%"
          >
            {matchedCount} of {samples.length} matched
          </span>
        )}
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
                      const { matches, closest } = matched[index]
                      /*
                        D59 — is any of the bottles offered here one you already have? Set
                        lookups, a handful per card, so this stays in the row rather than
                        in the matching memo: the shelf changes on its own (ticking a paint
                        with the filter off leaves the matches identical), and folding it
                        into that memo would recompute 1300 distance evaluations per brand
                        to learn something a Set already knows.
                      */
                      const mine = matches.filter((m) => shelf.has(paintKey(m.paint)))
                      const cardClass = ['sample']
                      if (index === highlighted) cardClass.push('highlighted')
                      if (mine.length > 0) cardClass.push('mine')
                      return (
                        <button
                          key={key}
                          type="button"
                          className={cardClass.join(' ')}
                          onClick={() => void copy(hex)}
                          onPointerEnter={() => onHighlight(index)}
                          onPointerLeave={() => onHighlight(null)}
                          // Focus as well as hover: the rows are buttons, so this comes
                          // almost free for anyone tabbing through the list.
                          onFocus={() => onHighlight(index)}
                          onBlur={() => onHighlight(null)}
                          /*
                            D56 — the hover explains the READINGS, not the paints. The
                            paint lines are already spelled out on the card; what is not
                            legible is what L, S and the deltas mean, and S in particular
                            is the wheel's per-hue-normalised radius rather than absolute
                            chroma, which is exactly the thing that made a scheme's role
                            order look arbitrary when it was checked.
                          */
                          data-hint={hex}
                          data-hint-body={
                            `L ${lightnessLabel(sample.oklab.L)} is Oklab lightness on 0-100. `
                            + `S ${saturationLabel(sample.t)}% is saturation as a share of `
                            + 'what THIS hue can reach, not absolute chroma \u2014 a blue and a '
                            + 'red at the same S differ by about a quarter in chroma.\n'
                            + (closest === null
                              ? 'No brand is enabled, so nothing was matched.'
                              : matches.length === 0
                                ? `The nearest paint is \u0394${differencePercent(closest.distance)}% away in Oklab; `
                                  + 'anything over 5% is reported as no match rather than '
                                  + 'offered as one.'
                                : `\u0394 is the Oklab distance to that bottle as a percentage, `
                                  + 'from its printed catalogue swatch. A word after it says '
                                  + 'which way it is off \u2014 darker, lighter, greyer or stronger.')
                            + (matches.length > 0
                              ? '\n'
                                + matches
                                    // The RANGE is only here: the card itself has no room
                                    // for it, and it is what tells you which product line
                                    // to actually buy — Model Air and Model Color are not
                                    // interchangeable on a brush.
                                    .map(
                                      (m) =>
                                        `${BRAND_TAG[m.paint.brand]} ${m.paint.ref} `
                                        + `${m.paint.name} (${m.paint.range})`.replace('  ', ' ')
                                        // D59 — the green tag says which bottle is yours;
                                        // this says it in words for the same reason the
                                        // range is here rather than on the card.
                                        + (shelf.has(paintKey(m.paint)) ? '  \u2014 on your shelf' : ''),
                                    )
                                    .join('\n')
                              : '')
                            + '\nClick to copy the hex.'
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
                                <span
                                  className={
                                    shelf.has(paintKey(m.paint))
                                      ? 'sample-paint-row mine'
                                      : 'sample-paint-row'
                                  }
                                  key={m.paint.brand}
                                >
                                  <span className="sample-paint">
                                    <span className="paint-brand">
                                      {BRAND_TAG[m.paint.brand]}
                                    </span>
                                    <span className="paint-ref">{m.paint.ref}</span>
                                    {m.paint.name}
                                  </span>
                                  <span className="sample-delta">
                                    &Delta;{differencePercent(m.distance)}%
                                    {/* One word for the dominant deviation, when there
                                        is one — see driftLabel in paints/match.ts. */}
                                    {m.drift !== null && (
                                      <span className="sample-drift">{m.drift}</span>
                                    )}
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
