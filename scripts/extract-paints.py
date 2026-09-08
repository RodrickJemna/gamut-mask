"""
Extract the AK paint catalogue into JSON: ref, name, range, sRGB.

Two page formats, both handled:

  1. EQUIVALENCE TABLE pages — a row per paint, swatch drawn as a VECTOR rect in the
     COLOR column. Column-aware on purpose: these tables also carry AK codes in
     cross-reference columns (CITADEL, for one), and matching /AK\\d+/ anywhere on a row
     pairs a foreign code with a different paint's swatch.

  2. Swatch-grid pages (Real Colors) — a grid of cells, swatch drawn as an embedded
     RASTER image. Those images turn out to be flat single-colour fills, so sampling is
     exact rather than approximate.

Deliberately excluded: the pigments page (powders, not bottled paint) and the auxiliary
products page (not colours). Both are easy to add if wanted.
"""
import io, json, re, sys
import pdfplumber
from pypdf import PdfReader
from PIL import Image

PDF = "/Users/kieferrobert/Downloads/AK_Catalogue2026.pdf"
TABLE_PAGES = [10, 11, 12, 13, 14, 15, 16, 17]
GRID_PAGES = [39, 40, 41]
AK_REF = re.compile(r'^AK\d{3,6}$')
GRID_CODE = re.compile(r'^RC\d{3,4}$')
SERIES_PREFIX = {'AFV', 'AIR', 'FIG'}

# Auxiliary media and varnishes, not colours. Their catalogue swatches are placeholder
# greys — the five AK mediums all share #636363 — so leaving them in would let a neutral
# sample "match" Matte Medium. Excluded by explicit ref rather than by a name pattern:
# "Medium" is overwhelmingly a colour word here (Medium Grey, Medium Blue, and 12 more),
# so a regex on it would discard real paints.
EXCLUDE_REFS = {
    'AK11231',  # Retarder
    'AK11232',  # Metal Medium
    'AK11233',  # Glaze Medium
    'AK11234',  # Matte Medium
    'AK11235',  # Gloss Medium
    'RC801',    # Flat Varnish
    'RC802',    # Satin Varnish
    'RC803',    # Gloss Varnish
}

def join_line(group):
    """
    Joins one baseline's characters, inserting a space wherever there is a real gap.

    The PDF does not always contain a space character between the TYPE tag and the name
    even though they are visibly separated, so a raw join produced "AIRWWI German Fokker
    Grey". Gaps within a word are a fraction of a point; the gap between columns here is
    around ten, so the threshold has a wide margin.
    """
    out = []
    prev = None
    for c in sorted(group, key=lambda c: c['x0']):
        if prev is not None and c['x0'] - prev['x1'] > max(0.9, 0.25 * c['size']):
            out.append(' ')
        out.append(c['text'])
        prev = c
    return ' '.join(''.join(out).split())


def read_name_cell(page, x0, x1, row_centre, tol=7.0):
    """
    Reads a NAME cell, grouping characters into LINES by baseline.

    Some names wrap onto two lines inside the cell, and the TYPE tag (AFV/AIR/FIG) sits
    on a third baseline between them. Cropping the cell and calling extract_text sorts
    every character by x, which interleaves the lines: "Portland Stone" over "No.64"
    came out as "P N o o r .6 tl 4 and Stone". 35 of 647 names were corrupted that way.

    Returns (name, series_tag).
    """
    chars = [
        c for c in page.chars
        if x0 < c['x0'] < x1 and abs((c['top'] + c['bottom']) / 2 - row_centre) < tol
    ]
    if not chars:
        return '', None

    # Cluster by baseline: distinct lines sit several points apart, characters on the
    # same line share a top to within rounding.
    lines = []
    for c in sorted(chars, key=lambda c: c['top']):
        if lines and abs(c['top'] - lines[-1][0]) < 1.0:
            lines[-1][1].append(c)
        else:
            lines.append((c['top'], [c]))

    series_tag = None
    parts = []
    for _, group in lines:
        text = join_line(group)
        if not text:
            continue
        # The TYPE tag sits on its own baseline in some rows and shares the name's
        # baseline in others, so both cases have to be handled or ~200 paints lose their
        # series.
        if text in SERIES_PREFIX:
            series_tag = text
            continue
        head, _, rest = text.partition(' ')
        if head in SERIES_PREFIX:
            series_tag = head
            text = rest.strip()
            if not text:
                continue
        parts.append(text)
    return ' '.join(parts), series_tag


skipped = []

def to_rgb(col):
    if col is None: return None
    if isinstance(col, (int, float)):
        v = int(round(float(col) * 255)); return (v, v, v)
    if not isinstance(col, (list, tuple)): return None
    try: vals = [float(c) for c in col]
    except (TypeError, ValueError): return None
    clamp = lambda v: max(0.0, min(1.0, v))
    if len(vals) == 1:
        v = int(round(clamp(vals[0]) * 255)); return (v, v, v)
    if len(vals) == 3:
        return tuple(int(round(clamp(v) * 255)) for v in vals)
    if len(vals) == 4:
        c, m, y, k = [clamp(v) for v in vals]
        return tuple(int(round(255 * (1 - min(1.0, ch + k)))) for ch in (c, m, y))
    return None

def header(words, text):
    return next((w for w in words if w['text'] == text and w['top'] < 130), None)

out = []

with pdfplumber.open(PDF) as pdf:
    # ---- format 1: equivalence tables -------------------------------------------
    for pageno in TABLE_PAGES:
        page = pdf.pages[pageno - 1]
        words = page.extract_words()
        h_ref, h_color = header(words, 'REF.'), header(words, 'COLOR')
        if not (h_ref and h_color):
            skipped.append({'page': pageno, 'why': 'missing header'}); continue
        ref_cx = (h_ref['x0'] + h_ref['x1']) / 2
        color_cx = (h_color['x0'] + h_color['x1']) / 2

        swatches = []
        for s in list(page.rects) + list(page.curves):
            if not (s['x0'] - 2 <= color_cx <= s['x1'] + 2): continue
            if not (5 <= s['height'] <= 30 and 6 <= s['width'] <= 60): continue
            rgb = to_rgb(s.get('non_stroking_color'))
            if rgb is None: continue
            swatches.append({'y': (s['top'] + s['bottom']) / 2, 'rgb': rgb})

        for w in words:
            if not AK_REF.match(w['text']): continue
            if abs((w['x0'] + w['x1']) / 2 - ref_cx) > 22: continue   # REF column only
            ry = (w['top'] + w['bottom']) / 2
            name, series_tag = read_name_cell(page, w['x1'] + 1, h_color['x0'] - 4, ry)
            near = min(swatches, key=lambda s: abs(s['y'] - ry), default=None)
            if near is None or abs(near['y'] - ry) > 8:
                skipped.append({'page': pageno, 'ref': w['text'], 'name': name,
                                'why': 'no swatch shape in COLOR column'})
                continue
            series = f'Acrylic 3GEN {series_tag}' if series_tag else 'Acrylic 3GEN'
            out.append({'ref': w['text'], 'name': name, 'range': series,
                        'rgb': list(near['rgb'])})

    # ---- format 2: swatch grids (raster) ----------------------------------------
    reader = PdfReader(PDF)
    for pageno in GRID_PAGES:
        page = pdf.pages[pageno - 1]
        words = page.extract_words()
        squares = [im for im in page.images
                   if 20 <= im['width'] <= 60 and abs(im['width'] - im['height']) < 3]
        # decode this page's embedded images once, keyed by position
        decoded = {}
        for im in reader.pages[pageno - 1].images:
            try:
                pil = Image.open(io.BytesIO(im.data)).convert('RGB')
            except Exception:
                continue
            w_, h_ = pil.size
            core = [pil.getpixel((x, y))
                    for x in range(w_ // 4, max(w_ // 4 + 1, w_ - w_ // 4))
                    for y in range(h_ // 4, max(h_ // 4 + 1, h_ - h_ // 4))]
            med = tuple(sorted(c[i] for c in core)[len(core) // 2] for i in range(3))
            # pypdf reports 'X758.png' while pdfplumber names the same XObject 'X758',
            # so key on the stem or the two never join up.
            decoded[im.name.rsplit('.', 1)[0]] = med
        # pdfplumber and pypdf list images in the same order per page, so zip by index
        # map each code to the swatch 39pt to its left
        for w in words:
            if not GRID_CODE.match(w['text']): continue
            want_x, want_top = w['x0'] - 39, w['top'] - 1
            sw = next((im for im in squares
                       if abs(im['x0'] - want_x) < 7 and abs(im['top'] - want_top) < 7), None)
            if sw is None:
                skipped.append({'page': pageno, 'ref': w['text'], 'why': 'no swatch image'})
                continue
            rgb = decoded.get(str(sw.get('name', '')).rsplit('.', 1)[0])
            if rgb is None:
                skipped.append({'page': pageno, 'ref': w['text'], 'why': 'image not decodable'})
                continue
            crop = page.crop((w['x0'] - 1, w['top'] + 7, w['x0'] + 82, w['top'] + 32))
            name = ' '.join((crop.extract_text() or '').split())
            out.append({'ref': w['text'], 'name': name, 'range': 'Real Colors',
                        'rgb': list(rgb)})

# de-duplicate by ref, keep first
seen, uniq = set(), []
for p in out:
    if p['ref'] in EXCLUDE_REFS: continue
    if p['ref'] in seen: continue
    seen.add(p['ref']); uniq.append(p)

json.dump({'paints': uniq, 'skipped': skipped}, open(sys.argv[1], 'w'), indent=1)
print(f"paints: {len(uniq)}  skipped: {len(skipped)}", file=sys.stderr)
