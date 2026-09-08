"""
Turns the extractor JSON into the TypeScript data modules the app imports.

Usage: generate-catalogue.py <ak.json> <vallejo.json>
Run the two extractors first; see scripts/extract-paints.py and extract-vallejo.py.
"""
import json, sys

ROOT = "/Users/kieferrobert/dev/gamut-mask/src/paints"

HEADER = """/**
 * {brand} paint catalogue, extracted from {source}.
 *
 * GENERATED — do not hand-edit. Regenerate with `scripts/{script}` followed by
 * `scripts/generate-catalogue.py`; those files document the page formats they read, the
 * exclusions they apply, and how the colours are obtained.
 *
 * Committed rather than built, because it is derived once from a PDF the repository does
 * not contain. It is source data for the app, not a build artefact.
 *
 * WHAT THESE COLOURS ARE, precisely: the swatch colours printed in the catalogue. They
 * are the manufacturer's own print renderings, not spectrophotometer readings of dried
 * paint. Good enough to say "this bottle is in the right area", not good enough to treat
 * as colorimetric truth — see D40 and D44 in the spec, and the caveat the UI shows.
 */

import type {{ Paint }} from './types.ts'

export const {const}: readonly Paint[] = [
"""

def emit(path, brand, source, script, const, rows):
    esc = lambda s: s.replace('\\', '\\\\').replace("'", "\\'")
    hexof = lambda rgb: '#' + ''.join(f'{c:02x}' for c in rgb)
    rows = sorted(rows, key=lambda p: (p['range'], p['ref']))
    out = [HEADER.format(brand=brand, source=source, script=script, const=const)]
    for p in rows:
        out.append(
            f"  {{ brand: '{brand}', ref: '{p['ref']}', name: '{esc(p['name'])}', "
            f"range: '{esc(p['range'])}', hex: '{hexof(p['rgb'])}' }},"
        )
    out.append(']\n')
    open(path, 'w').write('\n'.join(out))
    return len(rows)

ak = json.load(open(sys.argv[1]))['paints']
vj = json.load(open(sys.argv[2]))['paints']
n1 = emit(f'{ROOT}/ak.ts', 'AK', 'AK_Catalogue2026.pdf', 'extract-paints.py', 'AK_PAINTS', ak)
n2 = emit(f'{ROOT}/vallejo.ts', 'Vallejo', 'Catalogo_2026-R02.pdf (Vallejo)', 'extract-vallejo.py', 'VALLEJO_PAINTS', vj)
print(f'ak.ts: {n1} paints, vallejo.ts: {n2} paints')
