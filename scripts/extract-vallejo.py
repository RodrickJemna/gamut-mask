"""
Extract the Vallejo paint catalogue into JSON: code, name, range, sRGB.

Layout, per cell on a "... chart" page: a filled swatch RECT, immediately below it the
code (NN.NNN), then the English name, then the Spanish name. The swatch is located by
matching the code's left edge and taking the rect whose bottom sits just above it; the
name is the FIRST text line under the code, the second being the Spanish translation.

COLOURS ARE SAMPLED FROM A RASTERISED PAGE, not read from the rect's fill.

That is not the obvious choice, so: on some pages the swatch fills come back as proper
RGB triples, but on others — 86 of 106 on page 13 — they arrive as a single float,
because those rects are painted in a colour space pdfplumber does not resolve and it
surfaces one component. Trusting that float produced "71.002 Medium Yellow = #000000".
Rendering the page and sampling the pixel sidesteps colour spaces entirely and gives
what a human sees.

The method was validated before being trusted: on page 12, where every fill IS a proper
RGB triple, sampled pixels reproduced all 121 declared colours with a maximum channel
error of ZERO.

Rendering uses macOS Quick Look (`qlmanage`), which is build-time only.

Only ranges whose cells pair cleanly are included. Metal / True Metallic are left out
because a flat swatch misrepresents a metallic, and the pigment and wash ranges because
they are not bottled colour — the same call made for the AK catalogue.
"""
import json, os, re, shutil, subprocess, sys, tempfile
import pdfplumber
from pypdf import PdfReader, PdfWriter
from PIL import Image

PDF = "/Users/kieferrobert/Downloads/Catalogo_2026-R02.pdf"
CODE = re.compile(r'^\d{2}\.\d{3}$')

# Chart pages whose cells pair reliably, in the order they should be processed. Order
# matters: the canonical chart for a range comes first, so a code cross-referenced on a
# later page is dropped as a duplicate rather than overwriting the real entry.
CHART_PAGES = [12, 13, 28, 29, 52, 53, 72, 82]

# The range comes from the CODE PREFIX, which is authoritative in Vallejo's numbering,
# not from which page the code was found on. Chart pages carry cross-references to other
# ranges — the Game Air chart holds 51 codes of its own and 7 Model Color ones — so
# labelling by page mislabels those.
RANGE_BY_PREFIX = {
    '69': 'Mecha Color',
    '70': 'Model Color',
    '71': 'Model Air',
    '72': 'Game Color',
    '76': 'Game Air',
}
# 73.xxx is the auxiliary line — pigments, washes, textures. Not bottled colour, the same
# call made for the AK pigment pages.


CELL_WIDTH = 48.0
RENDER_PX = 2400

# Auxiliary media: varnishes, thinners, mediums. Their catalogue swatches are blank white,
# so leaving them in would let any near-white sample "match" Matt Varnish. Excluded by
# ref rather than by name pattern — "Medium" is overwhelmingly a colour word here
# (Medium Blue, Medium Olive, Medium Grey and a dozen more).
EXCLUDE_REFS = {
    '70.470', '70.510', '70.520', '70.521', '70.522', '70.524', '70.596', '70.597',
    '71.261', '73.214',
    '72.650', '72.651', '72.652', '72.653',
    '69.701', '69.702', '69.703',
}


def render_page(pageno, workdir):
    """Renders one page to a PNG via Quick Look, returning (image, points->pixels scale)."""
    reader = PdfReader(PDF)
    writer = PdfWriter()
    writer.add_page(reader.pages[pageno - 1])
    single = os.path.join(workdir, f'p{pageno}.pdf')
    with open(single, 'wb') as f:
        writer.write(f)
    subprocess.run(
        ['qlmanage', '-t', '-s', str(RENDER_PX), '-o', workdir, single],
        check=True, capture_output=True,
    )
    image = Image.open(os.path.join(workdir, f'p{pageno}.pdf.png')).convert('RGB')
    width_pt = float(reader.pages[pageno - 1].mediabox.width)
    return image, image.size[0] / width_pt


def sample_swatch(image, scale, rect):
    """Median of a small patch at the swatch centre, so a stray edge pixel cannot skew it."""
    cx = (rect['x0'] + rect['x1']) / 2 * scale
    cy = (rect['top'] + rect['bottom']) / 2 * scale
    px = [
        image.getpixel((int(cx + dx), int(cy + dy)))
        for dx in range(-8, 9, 4) for dy in range(-8, 9, 4)
    ]
    return tuple(sorted(p[i] for p in px)[len(px) // 2] for i in range(3))

def to_rgb(col):
    if col is None: return None
    if isinstance(col, (int, float)):
        v = int(round(float(col) * 255)); return (v, v, v)
    if not isinstance(col, (list, tuple)): return None
    try: vals = [float(c) for c in col]
    except (TypeError, ValueError): return None
    cl = lambda v: max(0.0, min(1.0, v))
    if len(vals) == 1:
        v = int(round(cl(vals[0]) * 255)); return (v, v, v)
    if len(vals) == 3: return tuple(int(round(cl(v) * 255)) for v in vals)
    if len(vals) == 4:
        c, m, y, k = [cl(v) for v in vals]
        return tuple(int(round(255 * (1 - min(1.0, ch + k)))) for ch in (c, m, y))
    return None

# Typographic ligatures appear as single glyphs and have to be expanded, or names come
# out as "Camou<fl>age".
LIGATURES = {
    '\ufb00': 'ff', '\ufb01': 'fi', '\ufb02': 'fl',
    '\ufb03': 'ffi', '\ufb04': 'ffl', '\ufb05': 'st', '\ufb06': 'st',
}


def join_line(group):
    """
    Joins one baseline's characters into text.

    Two quirks handled. Ligature glyphs are expanded to their letters. And this catalogue
    puts a real space character immediately after a ligature mid-word — the source text
    genuinely reads "Camou<fl> age" — so a space directly following a ligature is
    dropped. Mid-word that is always the typesetting artefact, never a word boundary.
    """
    out, prev = [], None
    prev_was_ligature = False
    for c in sorted(group, key=lambda c: c['x0']):
        text = c['text']
        if text == ' ' and prev_was_ligature:
            prev = c
            continue
        if prev is not None and c['x0'] - prev['x1'] > max(0.9, 0.25 * c['size']):
            out.append(' ')
        out.append(LIGATURES.get(text, text))
        prev_was_ligature = text in LIGATURES
        prev = c
    return ' '.join(''.join(out).split())

rows, skipped = [], []

workdir = tempfile.mkdtemp(prefix='vallejo-render-')
with pdfplumber.open(PDF) as pdf:
    for pageno in CHART_PAGES:
        page = pdf.pages[pageno - 1]
        image, scale = render_page(pageno, workdir)
        words = page.extract_words()
        swatches = [
            r for r in page.rects
            if 30 <= r['width'] <= 70 and 20 <= r['height'] <= 60
        ]
        for w in words:
            if not CODE.match(w['text']): continue
            if w['text'] in EXCLUDE_REFS: continue
            range_name = RANGE_BY_PREFIX.get(w['text'].split('.')[0])
            if range_name is None:
                skipped.append({'page': pageno, 'code': w['text'], 'why': 'range not wanted'})
                continue
            # The swatch sits directly above its code, sharing a left edge.
            cand = [
                r for r in swatches
                if abs(r['x0'] - w['x0']) < 6 and 0 <= w['top'] - r['bottom'] <= 12
            ]
            if not cand:
                skipped.append({'page': pageno, 'code': w['text'], 'why': 'no swatch above code'})
                continue
            # Nearest by vertical gap, so a background rect cannot win over the swatch.
            swatch = min(cand, key=lambda r: w['top'] - r['bottom'])
            rgb = sample_swatch(image, scale, swatch)

            # First text line under the code is English; the next is Spanish.
            below = [
                c for c in page.chars
                if w['top'] + 3 < c['top'] < w['top'] + 12
                and w['x0'] - 3 <= c['x0'] < w['x0'] + CELL_WIDTH
            ]
            if not below:
                skipped.append({'page': pageno, 'code': w['text'], 'why': 'no name line'})
                continue
            first_top = min(c['top'] for c in below)
            line = [c for c in below if abs(c['top'] - first_top) < 1.0]
            name = join_line(line)
            if not name:
                skipped.append({'page': pageno, 'code': w['text'], 'why': 'empty name'})
                continue
            rows.append({'ref': w['text'], 'name': name, 'range': range_name, 'rgb': list(rgb)})

seen, uniq = set(), []
for r in rows:
    if r['ref'] in seen: continue
    seen.add(r['ref']); uniq.append(r)

shutil.rmtree(workdir, ignore_errors=True)
json.dump({'paints': uniq, 'skipped': skipped}, open(sys.argv[1], 'w'), indent=1)
print(f"paints: {len(uniq)}  skipped: {len(skipped)}", file=sys.stderr)
