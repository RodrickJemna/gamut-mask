"""
Extract the Monument Hobbies Pro Acryl catalogue into JSON: code, name, range, sRGB.

Source: "Set List.pdf", a single 1080x4694 pt page holding every set as a grid of tiles.

LAYOUT, per tile: a filled rounded-rect path about 105 pt square, with the paint's NAME
and its CODE printed ON TOP of it in white — not beside it. So a tile is located as a
path and its text is whatever falls inside its box, rather than by matching a code's left
edge to a nearby swatch the way the Vallejo chart needs.

TWO THINGS ABOUT THIS PDF WILL WASTE YOUR TIME IF YOU DO NOT KNOW THEM.

1. EVERY GLYPH IS DRAWN TWICE, which is how the file fakes bold. `extract_text` therefore
   returns "BBoolldd" and "A0MP0-0202". Deduplication has to be POSITIONAL, and its
   tolerance is measured rather than guessed: over all 6471 glyphs, the distance from a
   glyph to the nearest identical one is under 0.05 pt for 92% of them and then jumps
   straight to ~89 pt, with six glyphs in between. So DEDUPE_TOLERANCE catches every real
   copy and nothing else.

   Both ends of that range bite. Rounding positions to 0.1 pt instead leaves "Light" as
   "Ligght", because two copies 0.007 apart can still straddle a rounding boundary. And a
   1.0 pt tolerance is far too loose: it deletes glyphs belonging to the OTHER rendering
   described below, which is how "Red" became "R d" — the two copies of its "e" are only
   0.49 pt apart.

2. SOME TILES CARRY THE TEXT TWICE IN TWO DIFFERENT LAYOUTS, on top of the per-glyph
   doubling. The AMP tiles print their code as both "006" at 11.2 pt and "AMP-006" at
   9.5 pt, two points apart vertically — inside one line height, so grouping glyphs into
   lines by position alone interleaves them into "A0MP0-0606". Their names are doubled the
   same way, once wrapped over three lines and once on one line, at the same nominal size
   but different glyph advances.

   So the code is chosen by SIZE GROUP — each distinct size is joined separately and the
   longest result that looks like a code wins, which prefers "AMP-006" over "006".

   Names need the layers separated first. The two renderings of "Black" sit 0.96 pt apart,
   inside any sane line height, so grouping at 5 pt merged them and sorting by x
   interleaved them into "BBllaacckk". Within ONE rendering every glyph reports the same
   `top` to about 0.006 pt — pdfplumber takes it from the text matrix, not from the ink —
   while the closest the two layers ever come is 0.442 pt, on AMP-007 Orange Yellow. So
   NAME_LINE_TOLERANCE sits in a gap with about 70x of margin either side; it is not a
   knob to turn, and 0.6 was already too loose to split that one tile. Then a line whose words are a subsequence of
   another line's is dropped, which collapses a duplicate rendering ("Black", "Black") and
   also an unwrapped copy of a wrapped one ("Cool", "Cool Grey", "Grey" -> "Cool Grey"),
   while a genuinely wrapped name ("Dark", "Camo", "Green") is a subsequence of nothing
   and survives whole.

3. THE TILE'S OWN FILL IS NOT ITS COLOUR. Each tile is painted as several stacked paths
   and the topmost is white, so reading `non_stroking_color` off the path returns
   (1,1,1) for every paint in the catalogue. Colours are SAMPLED FROM A RASTERISED PAGE
   instead — the same conclusion the Vallejo extractor reached for a different reason.

   Validated before being trusted: the one tile whose underlying fill pdfplumber does
   resolve, 010 Purple at (0.494, 0.31, 0.486), sampled back as #7e4f7c — exactly
   (126, 79, 124), zero channel error.

   THE SWATCH IS A CIRCLE ON BLACK with the name and code printed ACROSS ITS MIDDLE, so
   there is no rectangle of clean colour to read. The estimator is the MODE over the
   inscribed disc: on a flat swatch the paint colour is 72% of those pixels at the median
   and the lettering is scattered across antialiased greys, so the most common value is
   the paint. A median over a text-free strip was tried first and is worse — the strip has
   to be small enough to miss the tallest wrapped names, and on 014 Dark Ultramarine three
   copies of the same tile then gave three different answers while the mode gave one.

   Sampled independently from every stacked copy of a tile and resolved by MAJORITY, which
   makes the duplication a free consistency check rather than a nuisance: 175 of 176
   duplicated codes agree exactly, and the one that does not is outvoted 2 to 1.

Rendering uses macOS Quick Look (`qlmanage`), build-time only, like the Vallejo script.

EXCLUSIONS are the same judgement as for AK and Vallejo: ranges where a flat swatch
misrepresents what is in the bottle. Metallics are out, by set and by name, and so are the
transparents and washes, which are glazes rather than opaque colour — matching them
against a mask colour would promise something they cannot do. Fluorescents are IN, as they
are for both other brands.

The 1-Step sets are out too, and that exclusion is MEASURED rather than declared. Their
swatches are painted as a gradient, so no single colour represents them; the mode
consequently collapses onto the white lettering, at 2-6% of the disc against a median of
72% elsewhere. Rejecting any swatch whose mode share falls below MIN_FLAT_SHARE picks out
exactly those 24 paints and nothing else — and will catch the next gradient swatch
Monument prints instead of silently reducing it to a colour it does not have.
"""
import collections, json, re, subprocess, sys, tempfile
from pathlib import Path

import pdfplumber
from PIL import Image

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else 'Set List.pdf')
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'scripts/proacryl.json')

# Tile geometry, in points.
TILE_MIN, TILE_MAX = 90, 130
# Radius of the sampled disc, as a fraction of the tile. Inside the printed circle, clear
# of its antialiased edge and of the black surround.
SAMPLE_RADIUS = 0.42
# Below this share of the disc, the most common colour is not the swatch: see the note on
# the 1-Step sets above.
MIN_FLAT_SHARE = 25

NAME_SIZE_MIN = 14.0     # name glyphs; codes are ~11.2
HEADER_SIZE_MIN = 40.0   # section titles are ~52.5
LINE_TOLERANCE = 5.0     # section titles: glyphs within this vertical distance are one line
NAME_LINE_TOLERANCE = 0.1  # names: tight, to keep two stacked renderings apart
DEDUPE_TOLERANCE = 0.05    # see note 1: measured, not chosen
SPACE_GAP = 2.2          # x-gap, relative to glyph width, that means a word break

CODE_RE = re.compile(r'^(?:\d{3}|F\d{2}|S\d{2}|E\d{3}|AMP-\d{3})$')

# Ranges left out, matched case-insensitively against the section title.
EXCLUDED_RANGES = ('metalic', 'metallic')
# Individual paints left out wherever they appear, by name. Whole words only — 'gold'
# must not take "Golden Yellow" with it, and 'bismuth' is deliberately absent because
# Bismuth Yellow is a pigment, not a metallic.
EXCLUDED_NAME_RE = re.compile(
    r'\b(transparent|wash|gold|silver|bronze|steel|magnesium|copper|brass|gunmetal|pewter|metallic)\b',
    re.I,
)


def dedupe(chars):
    """Drop the second copy of each doubled glyph. See note 1 on the tolerance."""
    kept = []
    buckets = {}
    for c in sorted(chars, key=lambda c: (c['top'], c['x0'])):
        key = (c['text'], round(c['x0']), round(c['top']))
        duplicate = False
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for other in buckets.get((c['text'], key[1] + dx, key[2] + dy), ()):
                    if (abs(other['x0'] - c['x0']) <= DEDUPE_TOLERANCE
                            and abs(other['top'] - c['top']) <= DEDUPE_TOLERANCE):
                        duplicate = True
        if duplicate:
            continue
        buckets.setdefault(key, []).append(c)
        kept.append(c)
    return kept


def join_line(chars):
    """Concatenate one line, inserting a space at every real word gap."""
    chars = sorted(chars, key=lambda c: c['x0'])
    out = []
    for i, c in enumerate(chars):
        if i:
            prev = chars[i - 1]
            gap = c['x0'] - prev['x1']
            if gap > (prev['x1'] - prev['x0']) / SPACE_GAP:
                out.append(' ')
        out.append(c['text'])
    return ''.join(out)


def rows_of(chars, tolerance=LINE_TOLERANCE):
    """Group glyphs into visual lines, top to bottom."""
    rows = []
    for c in sorted(chars, key=lambda c: c['top']):
        for row in rows:
            if abs(row[0]['top'] - c['top']) <= tolerance:
                row.append(c)
                break
        else:
            rows.append([c])
    return rows


def lines_of(chars, tolerance=LINE_TOLERANCE):
    return [join_line(r) for r in rows_of(chars, tolerance)]


def is_subsequence(short, long):
    """Every word of `short` appears in `long`, in order."""
    it = iter(long)
    return all(word in it for word in short)


def name_from(chars):
    """
    The paint's name, with a doubled layout collapsed.

    A tile may hold the same name twice, once wrapped and once not. A line whose words are
    a subsequence of another line's is therefore a fragment of that other rendering, not a
    separate part of the name, and is dropped. Lines that genuinely wrap ("Dark", "Camo",
    "Green") are subsequences of nothing and all survive.
    """
    lines = [line for line in (l.strip() for l in lines_of(chars, NAME_LINE_TOLERANCE)) if line]
    keep = []
    for i, line in enumerate(lines):
        words = line.split()
        redundant = any(
            j != i and is_subsequence(words, other.split())
            and (len(other.split()) > len(words) or j < i)
            for j, other in enumerate(lines)
        )
        if not redundant:
            keep.append(line)
    return ' '.join(keep).strip()


def code_from(chars):
    """
    The tile's code, choosing between overlapping renderings by font size.

    Each distinct size is joined on its own, and the longest candidate that looks like a
    code wins: an AMP tile offers both "006" and "AMP-006", and the second is the one that
    identifies the bottle.
    """
    by_size = {}
    for c in chars:
        by_size.setdefault(round(c['size'], 1), []).append(c)
    candidates = []
    for group in by_size.values():
        text = ''.join(join_line(group).split())
        if CODE_RE.match(text):
            candidates.append(text)
    if not candidates:
        return ''.join(join_line(chars).split())
    return max(candidates, key=len)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / 'setlist.pdf'
        work.write_bytes(SOURCE.read_bytes())
        subprocess.run(
            ['qlmanage', '-t', '-s', '4694', '-o', tmp, str(work)],
            check=True, capture_output=True,
        )
        raster = Image.open(Path(tmp) / 'setlist.pdf.png').convert('RGB')

        with pdfplumber.open(SOURCE) as pdf:
            page = pdf.pages[0]
            sx = raster.width / page.width
            sy = raster.height / page.height
            chars = dedupe(page.chars)

            # Section titles, and the column each governs.
            headers = []
            for line in group_headers(chars):
                headers.append(line)

            tiles = {}
            for c in page.curves:
                if not c.get('fill'):
                    continue
                w, h = c['x1'] - c['x0'], c['bottom'] - c['top']
                if not (TILE_MIN < w < TILE_MAX and TILE_MIN < h < TILE_MAX):
                    continue
                tiles.setdefault((round(c['x0']), round(c['top'])), c)

            paints, skipped, disagreed = [], [], []
            readings, meta = {}, {}
            for _, tile in sorted(tiles.items(), key=lambda kv: (kv[0][1], kv[0][0])):
                inside = [
                    c for c in chars
                    if tile['x0'] <= (c['x0'] + c['x1']) / 2 <= tile['x1']
                    and tile['top'] <= (c['top'] + c['bottom']) / 2 <= tile['bottom']
                ]
                codes = [c for c in inside if c['size'] < NAME_SIZE_MIN]
                names = [c for c in inside if c['size'] >= NAME_SIZE_MIN]
                if not codes:
                    continue  # a decorative path, not a paint tile
                code = code_from(codes)
                if not CODE_RE.match(code):
                    skipped.append(('unrecognised code', code, tile['top']))
                    continue
                name = name_from(names)
                if not name:
                    skipped.append(('no name', code, tile['top']))
                    continue

                rng = range_for(headers, tile)
                hexcolour, share = sample(raster, tile, sx, sy)
                # Every stacked copy of a tile is read; resolved by majority below.
                readings.setdefault(code, []).append((hexcolour, share))
                meta.setdefault(code, {'name': name, 'range': rng, 'top': tile['top']})

            for code, values in meta.items():
                name, rng = values['name'], values['range']
                votes = readings[code]
                hexcolour, share = collections.Counter(votes).most_common(1)[0][0]
                if len({v[0] for v in votes}) > 1:
                    disagreed.append((code, sorted({v[0] for v in votes}), hexcolour))

                if any(word in rng.lower() for word in EXCLUDED_RANGES):
                    skipped.append(('excluded range', f'{code} {name} ({rng})'))
                    continue
                if EXCLUDED_NAME_RE.search(name):
                    skipped.append(('excluded paint', f'{code} {name}'))
                    continue
                if share < MIN_FLAT_SHARE:
                    skipped.append(
                        ('swatch is not flat', f'{code} {name} ({rng}) mode {share}%')
                    )
                    continue
                paints.append({
                    'ref': code,
                    'name': name,
                    'range': rng,
                    'rgb': [int(hexcolour[i:i + 2], 16) for i in (1, 3, 5)],
                })

            print(
                f'tiles {len(tiles)}, codes {len(meta)}, paints kept {len(paints)}',
                file=sys.stderr,
            )
            for code, seen, won in disagreed:
                print(f'  copies disagreed on {code}: {seen} -> {won}', file=sys.stderr)
            reasons = {}
            for reason, code in skipped:
                reasons.setdefault(reason, set()).add(code)
            for reason, items in sorted(reasons.items()):
                print(f'  {reason}: {len(items)}', file=sys.stderr)
                for item in sorted(items):
                    print(f'    {item}', file=sys.stderr)
            paints.sort(key=lambda p: (p['range'], p['ref']))
            OUT.write_text(
                json.dumps({'paints': paints}, indent=2, ensure_ascii=False) + '\n'
            )


def group_headers(chars):
    """Section titles as (text, x0, top), each governing the column it starts."""
    big = [c for c in chars if c['size'] >= HEADER_SIZE_MIN]
    rows = []
    for c in sorted(big, key=lambda c: c['top']):
        for row in rows:
            if abs(row[0]['top'] - c['top']) <= LINE_TOLERANCE:
                row.append(c)
                break
        else:
            rows.append([c])
    out = []
    for row in rows:
        # A line may hold TWO titles side by side ("Expansion Set #1:  Expansion Set #2:").
        row = sorted(row, key=lambda c: c['x0'])
        current = [row[0]]
        for prev, c in zip(row, row[1:]):
            if c['x0'] - prev['x1'] > 60:
                out.append(current)
                current = [c]
            else:
                current.append(c)
        out.append(current)
    return [
        {'text': join_line(g).strip().rstrip(':'), 'x0': g[0]['x0'], 'top': g[0]['top']}
        for g in out
    ]


def range_for(headers, tile):
    """
    The title governing this tile: the nearest one above it, preferring a title whose
    column contains the tile. Two sets can share a line, so the y alone is not enough.
    """
    above = [h for h in headers if h['top'] < tile['top']]
    if not above:
        return 'Pro Acryl'
    newest = max(h['top'] for h in above)
    band = [h for h in above if newest - h['top'] < LINE_TOLERANCE]
    if len(band) > 1:
        # Side-by-side titles: pick the rightmost whose left edge is at or left of the tile.
        left = [h for h in band if h['x0'] <= tile['x1']]
        return max(left, key=lambda h: h['x0'])['text'] if left else band[0]['text']
    return max(above, key=lambda h: h['top'])['text']


def sample(raster, tile, sx, sy):
    """The most common colour in the swatch's disc, and what share of it that is."""
    w, h = tile['x1'] - tile['x0'], tile['bottom'] - tile['top']
    cx = (tile['x0'] + tile['x1']) / 2 * sx
    cy = (tile['top'] + tile['bottom']) / 2 * sy
    r = SAMPLE_RADIUS * min(w * sx, h * sy)
    px = []
    for y in range(int(cy - r), int(cy + r)):
        dy = abs(y - cy)
        dx = (r * r - dy * dy) ** 0.5 if dy < r else 0
        for x in range(int(cx - dx), int(cx + dx)):
            px.append(raster.getpixel((x, y)))
    if not px:
        return None, 0
    mode, count = collections.Counter(px).most_common(1)[0]
    return '#%02x%02x%02x' % mode, count * 100 // len(px)


if __name__ == '__main__':
    main()
