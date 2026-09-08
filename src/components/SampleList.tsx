/**
 * The colours inside the mask. Spec: F6, D36, D25, D13, D16.
 *
 * Row content is fixed by D36: swatch, hex, lightness, saturation. Lightness is Oklab L
 * on 0-100, saturation is the radius as a percentage. Clicking a row copies the hex —
 * the clipboard is the only export in v1 (D13).
 *
 * The lightness column is a DERIVED consequence, not a control (D16): no L slider, no
 * value ramp, no sorting by lightness.
 */

import { useState } from 'react'
import { lightnessLabel, saturationLabel, toHex } from '../color/format.ts'
import type { Sample } from '../geom/sample.ts'

type Props = {
  samples: Sample[]
  requested: number
}

export function SampleList({ samples, requested }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(hex: string) {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(hex)
      window.setTimeout(() => setCopied((c) => (c === hex ? null : c)), 1000)
    } catch {
      // Rejects when the document is not focused, or outside a secure context
      // (localhost counts, a plain-http LAN address does not). Never claim success.
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
        <span className="samples-note">
          Assumes sRGB. On an uncalibrated monitor this plans relative harmony; it does not
          predict absolute paint colour.
        </span>
      </div>

      {samples.length === 0 ? (
        <p className="empty">No colours — the mask encloses no area.</p>
      ) : (
        <div className="samples-grid">
          {samples.map((sample) => {
            const hex = toHex(sample.rgb8)
            // Keyed on identity, not index: index keys make React reuse a row for a
            // different colour when the count changes, which shows as a swatch briefly
            // displaying the wrong colour.
            const key = `${hex}-${sample.x.toFixed(4)}-${sample.y.toFixed(4)}`
            return (
              <button
                key={key}
                type="button"
                className="sample"
                onClick={() => void copy(hex)}
                title="Copy hex"
              >
                <span className="sample-swatch" style={{ background: hex }} />
                <span className="sample-hex">{copied === hex ? 'copied' : hex}</span>
                <span className="sample-nums">
                  L {lightnessLabel(sample.oklabL)}
                  <br />S {saturationLabel(sample.t)}%
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
