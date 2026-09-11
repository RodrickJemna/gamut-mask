"""
Extract the Citadel paints named in the Painting System chart: name, section, sRGB.

Source: CitadelPaintingSystem.pdf — ONE PAGE HOLDING ONE FLATTENED JPEG, 1198x4468, with
NO TEXT LAYER AT ALL. pdfplumber reports zero characters, so unlike every other extractor
here there is nothing to read: the names have to be recognised optically.

WHAT THIS CHART IS, and what it therefore is not. It is a recipe table — each row is
"base coat, then these layers, then these drybrushes" — not a product catalogue. So:

  - Coverage is only the paints GW happens to use in these recipes, not the Citadel range.
  - There are NO PRODUCT CODES anywhere on it. Citadel paints are identified by name, so
    the name goes in `ref` (it is the identifier) and `name` is left empty rather than
    printing the same string twice in every row of the UI.
  - Paints REPEAT across rows, which is a gift: the same name is read from up to a dozen
    different cells, so agreement between them is a free check on the sampling.

OCR is the macOS Vision framework, driven by scripts/ocr-vision.swift. Vision ships with
the OS, which beats adding a Tesseract install to a hobby project, and the system Python
here is 3.9 — too old to build a modern pyobjc. Build-time only, like `qlmanage`.

Reading the whole page in one pass does not work: at 1198 px wide the cell text is small
enough that Vision truncates it, returning "WHITE SCAP" and "CASANDOR!". Each cell is
therefore cropped and upscaled before recognition, which also removes the need to match
text back to a cell by geometry.

GRID. Rows are found as horizontal bands of non-white pixels, about 57 px tall on an 80 px
pitch. A cell is judged EMPTY by having no recognised text, never by being pale: several
of these paints are white or near-white, and a brightness test drops them. Column edges are fixed and were read off the image by looking for x positions where
the colour changes in most bands; the BASE column is wider than the rest.

COLOUR is the mode of the cell interior, as for Pro Acryl and for the same reason: the
name is printed across the middle of the swatch, so there is no clean rectangle, but the
lettering is a minority scattered across antialiased edges while the paint is one exact
value.

THE SHADES EXCLUDE THEMSELVES. Wash cells are printed as a GRADIENT fading to white, to
show that they are translucent — so their mode share collapses, exactly as the Pro Acryl
1-Step swatches did. MIN_FLAT_SHARE therefore drops them on the evidence rather than by a
name list, which is the same judgement the other three extractors make about washes and
glazes, arrived at without me having to enumerate GW's shade range.

Metallics, glazes, technical and texture products are below the main grid and are skipped
by position, for the same reason they are skipped for the other brands.
"""
import collections, json, re, subprocess, sys, tempfile
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

SOURCE = Path(sys.argv[1] if len(sys.argv) > 1 else 'CitadelPaintingSystem.pdf')
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'scripts/citadel.json')
OCR_TOOL = Path(__file__).with_name('ocr-vision.swift')

# Column edges in image pixels. Six cells: three layering steps, the base, two drybrush
# steps. The base column is the wide one.
COLUMN_EDGES = [142, 284, 426, 567, 773, 914, 1055]
# Everything at or below the METALLICS heading is a different kind of product.
MAIN_GRID_BOTTOM = 2960
GRID_TOP = 460

BAND_MIN_HEIGHT = 20
BAND_HOT_COLUMNS = 100
# Rows are ~57 px on an ~80 px pitch, so anything closer than this is one row that the
# hotness test split, not two rows. The very first row of the chart is pale enough that a
# single scanline dipped below the threshold and cut it in half, which cropped its cells
# to 24 px and turned their names into OCR noise.
BAND_MERGE_GAP = 12
# Inset from the cell edge before sampling or cropping, to clear the border and the
# antialiased join with the neighbouring cell.
CELL_INSET_X = 8
CELL_INSET_Y = 6
# Below this share, the cell is not one flat colour: see the note on shades above.
MIN_FLAT_SHARE = 25
OCR_UPSCALE = 4


def native_image(pdf_path):
    """The page's single embedded JPEG, at its own resolution rather than re-rastered."""
    page = PdfReader(str(pdf_path)).pages[0]
    images = list(page.images)
    if len(images) != 1:
        raise SystemExit(f'expected one embedded image, found {len(images)}')
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        images[0].image.save(f)
        return Image.open(f.name).convert('RGB')


def bands(im):
    """Horizontal strips containing a row of cells."""
    px = im.load()
    width, height = im.size
    hot = lambda y: sum(
        1 for x in range(160, min(1050, width), 6)
        if not all(c > 235 for c in px[x, y])
    )
    found, start = [], None
    for y in range(GRID_TOP, min(MAIN_GRID_BOTTOM, height)):
        if hot(y) > BAND_HOT_COLUMNS:
            if start is None:
                start = y
        elif start is not None:
            if y - start > BAND_MIN_HEIGHT:
                found.append((start, y))
            start = None
    merged = []
    for band in found:
        if merged and band[0] - merged[-1][1] < BAND_MERGE_GAP:
            merged[-1] = (merged[-1][0], band[1])
        else:
            merged.append(band)
    return [b for b in merged if b[1] - b[0] > BAND_MIN_HEIGHT]


def cell_colour(im, box):
    """The modal colour of the cell, and what share of it that is."""
    crop = im.crop(box)
    pixels = list(crop.getdata())
    if not pixels:
        return None, 0
    mode, count = collections.Counter(pixels).most_common(1)[0]
    return mode, count * 100 // len(pixels)


def ocr_all(paths):
    """One Vision process for every crop: starting one per cell costs seconds each."""
    proc = subprocess.run(
        ['swift', str(OCR_TOOL)],
        input='\n'.join(str(p) for p in paths),
        capture_output=True, text=True, check=True,
    )
    out = {}
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        lines = sorted(payload['lines'], key=lambda l: -l['y'])
        out[payload['path']] = ' '.join(l['text'] for l in lines if l['conf'] > 0.3)
    return out


def clean(text):
    text = re.sub(r'[^A-Za-z0-9 \'-]', ' ', text)
    return ' '.join(text.split()).upper()


def main():
    im = native_image(SOURCE)
    rows = bands(im)
    print(f'{rows and len(rows)} cell rows between y={GRID_TOP} and {MAIN_GRID_BOTTOM}',
          file=sys.stderr)

    with tempfile.TemporaryDirectory() as tmp:
        cells, paths = [], []
        for band_index, (y0, y1) in enumerate(rows):
            for col in range(len(COLUMN_EDGES) - 1):
                x0, x1 = COLUMN_EDGES[col], COLUMN_EDGES[col + 1]
                box = (x0 + CELL_INSET_X, y0 + CELL_INSET_Y,
                       x1 - CELL_INSET_X, y1 - CELL_INSET_Y)
                colour, share = cell_colour(im, box)
                if colour is None:
                    continue
                # An empty step is recognised by having NO TEXT, never by being pale.
                # Skipping near-white cells instead silently dropped White Scar, Celestra
                # Grey, Ulthuan Grey and Praxeti White — the chart's palest paints are
                # still paints.
                path = Path(tmp) / f'cell_{band_index}_{col}.png'
                crop = im.crop(box)
                crop.resize(
                    (crop.width * OCR_UPSCALE, crop.height * OCR_UPSCALE), Image.LANCZOS
                ).save(path)
                cells.append({'path': str(path), 'colour': colour, 'share': share,
                              'row': band_index, 'col': col})
                paths.append(path)

        print(f'{len(cells)} cells; recognising text', file=sys.stderr)
        text = ocr_all(paths)

    readings, flat = {}, {}
    unnamed = 0
    for cell in cells:
        name = clean(text.get(cell['path'], ''))
        if not name:
            unnamed += 1
            continue
        readings.setdefault(name, []).append(cell['colour'])
        flat.setdefault(name, []).append(cell['share'])

    paints, dropped, disagreed = [], [], []
    for name, colours in sorted(readings.items()):
        colour, _ = collections.Counter(colours).most_common(1)[0]
        if len(set(colours)) > 1:
            disagreed.append((name, len(set(colours)), len(colours)))
        share = max(flat[name])
        if share < MIN_FLAT_SHARE:
            dropped.append((name, share, len(colours)))
            continue
        paints.append({
            'ref': name,
            'name': '',
            'range': 'Painting System',
            'rgb': list(colour),
            'seen': len(colours),
        })

    print(f'\nnames read: {len(readings)}, kept: {len(paints)}, '
          f'cells with no text: {unnamed}', file=sys.stderr)
    print(f'\ndropped as not flat (translucent swatch): {len(dropped)}', file=sys.stderr)
    for name, share, seen in sorted(dropped):
        print(f'    {name:28s} mode {share:3d}%  in {seen} cells', file=sys.stderr)
    if disagreed:
        print(f'\ncells disagreed on a colour: {len(disagreed)}', file=sys.stderr)
        for name, distinct, seen in disagreed:
            print(f'    {name:28s} {distinct} values across {seen} cells', file=sys.stderr)

    OUT.write_text(json.dumps({'paints': paints}, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
