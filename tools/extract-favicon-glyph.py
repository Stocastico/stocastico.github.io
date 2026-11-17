#!/usr/bin/env python3
"""Extract "SM" from Archivo as SVG outlines for the favicon (#195).

An SVG favicon is a document of its own: it cannot load the site's web fonts,
so `<text font-family="Archivo">` would fall back to whatever the browser has
(it said Georgia, and the icon never matched the type). The letters are
therefore baked as paths, once, here — the output is committed and read by
scripts/generate-theme.js, so the site build needs no Python.

Archivo is variable; the icon uses the display cut the site sets its titles
in: width 62, weight 800.

Run (needs `pip install fonttools brotli`), only when the face or the
lettering changes:
    python3 tools/extract-favicon-glyph.py > scripts/lib/favicon-glyph.json
"""
import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "fonts" / "archivo-latin-wdth-wght-normal.woff2"
TEXT = "SM"
BOX = 64          # viewBox
CAP_H = 34        # target cap height in viewBox units
TRACK = 1.5       # extra space between the letters, in viewBox units

font = instantiateVariableFont(TTFont(FONT), {"wdth": 62, "wght": 800})
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
cap = font["OS/2"].sCapHeight
scale = CAP_H / cap

names = [cmap[ord(c)] for c in TEXT]
advances = [font["hmtx"][n][0] * scale for n in names]
width = sum(advances) + TRACK * (len(names) - 1)
x = (BOX - width) / 2
baseline = (BOX + CAP_H) / 2

parts = []
for name, adv in zip(names, advances):
    pen = SVGPathPen(glyphs, lambda v: f"{round(v, 1):g}")
    # Font units are y-up; SVG is y-down: flip and move to the baseline.
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
    parts.append(pen.getCommands())
    x += adv + TRACK

json.dump({
    "source": "fonts/archivo-latin-wdth-wght-normal.woff2 @ wdth 62, wght 800",
    "viewBox": BOX,
    "d": " ".join(parts),
}, sys.stdout, indent=2)
sys.stdout.write("\n")
