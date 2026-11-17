#!/usr/bin/env python3
"""Bake the favicon's "SM" from a variable font into scripts/lib/favicon-glyph.json.

An SVG favicon is its own document and cannot load a web font, so the letters
are shipped as outlines. Needs fontTools (pip install fonttools).

  python3 tools/extract-favicon-glyph.py Quicksand[wght].ttf --wght 500 --gap -5

The glyph is Quicksand (SIL OFL 1.1, https://github.com/google/fonts/tree/main/ofl/quicksand).
S and M are scaled to a 35-unit cap height, baseline at y=50 on a 64 grid, and
centred. A negative --gap overlaps them; both contours wind the same way, so one
nonzero-filled <path> unions them.
"""
import argparse, json, os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ap = argparse.ArgumentParser()
ap.add_argument('font')
ap.add_argument('--wght', type=int, default=500)
ap.add_argument('--gap', type=float, default=-5, help='space between S and M in grid units (negative = overlap)')
ap.add_argument('--stack', action='store_true', help='centre S and M on top of each other (a monogram); ignores --gap')
ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'scripts', 'lib', 'favicon-glyph.json'))
a = ap.parse_args()

CAP, BASE, GRID = 35, 50, 64
f = instantiateVariableFont(TTFont(a.font), {'wght': a.wght})
gs, cm = f.getGlyphSet(), f.getBestCmap()

def bounds(ch):
    bp = BoundsPen(gs); gs[cm[ord(ch)]].draw(bp); return bp.bounds

h = bounds('H'); k = CAP / (h[3] - h[1])
sb, mb = bounds('S'), bounds('M')
sw, mw = (sb[2] - sb[0]) * k, (mb[2] - mb[0]) * k
if a.stack:
    a.gap = -(sw + mw) / 2
x0 = (GRID - (sw + a.gap + mw)) / 2
fmt = lambda v: ('%.2f' % v).rstrip('0').rstrip('.')
parts = []
for ch, b, x in (('S', sb, x0), ('M', mb, x0 + sw + a.gap)):
    pen = SVGPathPen(gs, ntos=fmt)
    gs[cm[ord(ch)]].draw(TransformPen(pen, (k, 0, 0, -k, x - b[0] * k, BASE + h[1] * k)))
    parts.append(pen.getCommands())

json.dump({
    'source': f'Quicksand wght {a.wght} (SIL OFL 1.1), "S" + "M" outlines, cap height {CAP} on a {GRID} grid, gap {a.gap}',
    'viewBox': GRID,
    'lightFill': '#111111',
    'd': ' '.join(parts),
}, open(a.out, 'w'), indent=2)
open(a.out, 'a').write('\n')
print('wrote', os.path.normpath(a.out))
