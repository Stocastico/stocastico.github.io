/* ═══════════════════════════════════════════════════════════
   HERO GRID — the name, as an untuned television shows it

   The homepage hero. "Stefano Masneri" is rasterised into a grid of cells and
   painted in black and white: ink where the letters are, a faint cell where
   they are not. Now and then, for a third of a second, broadcast static tears
   across it — a few horizontal bands slip sideways, and on one or two of them
   the edges split into two colours taken from the palette's colour bars.
   Then the picture settles back to the plain name.

   It replaced the receptive-field hero (a 5×5 convolution window dragged over
   the name, with filters including a learned LeNet kernel). That was a fine
   idea for a reader who already knew what a convolution is, and a puzzle for
   everyone else; this one needs no explanation, and it says "video" rather
   than "machine learning", which is the half of the site's two-line pitch the
   old hero never touched.

   Three decisions worth keeping straight:

   · **Still by default, drawn in bursts.** Between bursts nothing runs: no
     animation loop, no listeners, no observers beyond the resize one. A burst
     is five frames at ~16 fps (a TV tear should look stepped, not smooth),
     re-rolled each frame, followed by a clean frame. Under reduced motion
     there are no bursts at all and the hero is the plain picture.

   · **The maths are pure** (glitchBands, sampleShifted) and take their random
     source as a parameter, so test/hero-grid.test.mjs can hold them to the
     invariants that keep the name legible: bands stay inside the grid, never
     overlap, never slip by zero and never cover more than half the rows.

   · **The <h1> stays the text.** The canvas is aria-hidden decoration laid
     over it, and the CSS only hides the text once the canvas has painted
     (`.is-drawn` on the hero), so no-JS, print, forced colours and crawlers
     keep the name.
   ═══════════════════════════════════════════════════════════ */

import { getTheme, rgba } from './theme.js';
import { prefersReducedMotion } from './utils.js';

/* The shape of a burst. Heights and shifts are in grid cells. */
export const BURST = {
  minBands: 2,
  maxBands: 5,
  maxHeight: 3,
  maxShift: 9,
  maxTinted: 2,
  frames: 5,
  stepMs: 60,
  firstAfterMs: [1200, 1800],
  everyMs: [5000, 10000],
};

/* ── Pure maths (unit-tested in Node) ──────────────────────────────────── */

/* The bands of one frame of a burst: where each is, how far it slips, and —
   for one or two of them — the pair of colours its edges split into.
   `rand` is any () => [0, 1) source. Bands never overlap and together never
   take more than half the rows, so the name stays readable through the worst
   frame. */
export function glitchBands(rand, cols, rows, colors) {
  if (!(rows >= 1) || !(cols >= 1)) return [];
  const want = BURST.minBands + Math.floor(rand() * (BURST.maxBands - BURST.minBands + 1));
  const budget = Math.ceil(rows / 2);
  const taken = new Set();
  const bands = [];
  for (let attempt = 0; attempt < want * 6 && bands.length < want; attempt++) {
    const h = Math.min(rows, 1 + Math.floor(rand() * BURST.maxHeight));
    const y = Math.floor(rand() * (rows - h + 1));
    let clash = taken.size + h > budget;
    for (let r = y; r < y + h && !clash; r++) clash = taken.has(r);
    if (clash) continue;
    for (let r = y; r < y + h; r++) taken.add(r);
    const dx = (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * BURST.maxShift));
    bands.push({ y, h, dx, tint: null });
  }
  if (bands.length && colors.length >= 2) {
    const k = Math.min(bands.length, 1 + Math.floor(rand() * BURST.maxTinted));
    const start = Math.floor(rand() * bands.length);
    for (let j = 0; j < k; j++) {
      const a = Math.floor(rand() * colors.length);
      const b = (a + 1 + Math.floor(rand() * (colors.length - 1))) % colors.length;
      bands[(start + j) % bands.length].tint = [colors[a], colors[b]];
    }
  }
  return bands;
}

/* The cell that shows at (x, y) when its row has slipped right by dx: the one
   dx to its left, wrapping round the edge like a tape running off its reel. */
export function sampleShifted(grid, w, x, y, dx) {
  return grid[y * w + (((x - dx) % w) + w) % w];
}

/* Largest integer font size (in cells) at which the widest line still fits
   the grid. `measure(text, size)` is canvas measureText in production and a
   stub in the tests. */
export function fitFont(lines, cols, measure) {
  let size = 4;
  while (size < 400 && Math.max(...lines.map((l) => measure(l, size + 1))) <= cols) size++;
  return size;
}

/* CSS font-stretch (a percentage, as getComputedStyle reports it) → the
   keyword the canvas font shorthand accepts, which takes no percentages. */
export function stretchKeyword(value) {
  const pct = parseFloat(value);
  if (!Number.isFinite(pct)) return 'normal';
  const steps = [
    [50, 'ultra-condensed'], [62.5, 'extra-condensed'], [75, 'condensed'], [87.5, 'semi-condensed'],
    [100, 'normal'], [112.5, 'semi-expanded'], [125, 'expanded'], [150, 'extra-expanded'], [200, 'ultra-expanded'],
  ];
  let best = steps[0];
  for (const st of steps) if (Math.abs(st[0] - pct) < Math.abs(best[0] - pct)) best = st;
  return best[1];
}

/* ── Renderer ──────────────────────────────────────────────────────────── */

const INK = 0.35; // coverage above which a cell counts as ink

export class HeroGrid {
  /* root: the hero section. It must contain #field-canvas and the h1 the name
     is read from. opts.random drives bursts and their timing (tests pin it). */
  constructor(root, onReady, { random = Math.random } = {}) {
    this.root = root;
    this.canvas = root.querySelector('#field-canvas');
    this.ctx = this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
    this._listeners = [];
    this._timers = [];
    this._ro = null;
    if (!this.ctx) return;

    this._random = random;
    this._theme = getTheme();
    const { accent, accent2, pins } = this._theme;
    this._colors = [accent, accent2, pins.lived, pins.holiday, pins.current, pins.worktrip];
    this._onReady = typeof onReady === 'function' ? onReady : null;
    this._words = (root.querySelector('h1')?.textContent || 'Stefano Masneri').trim().split(/\s+/);

    this._layout();
    this._draw(null);

    if (typeof ResizeObserver === 'function') {
      let last = this.canvas.clientWidth;
      this._ro = new ResizeObserver(() => {
        if (this.canvas.clientWidth === last) return;
        last = this.canvas.clientWidth;
        this._layout();
        this._draw(null);
      });
      this._ro.observe(this.root);
    }

    /* The display face is a web font with font-display: swap, so the first
       layout may have measured a fallback. Lay out again once it is in. */
    if (document.fonts && typeof document.fonts.load === 'function') {
      document.fonts.load(this._font(100)).then(() => {
        if (!this.ctx) return;
        this._layout();
        this._draw(null);
      }, () => {});
    }

    if (!prefersReducedMotion()) this._schedule(BURST.firstAfterMs);
  }

  _later(fn, ms) {
    const t = setTimeout(fn, ms);
    if (t && typeof t.unref === 'function') t.unref(); // never keep a Node test process alive
    this._timers.push(t);
    return t;
  }

  _between([lo, hi]) {
    return lo + this._random() * (hi - lo);
  }

  /* Wait, then tear — and only when the page is on screen to see it. */
  _schedule(range) {
    this._later(() => {
      if (!this.ctx) return;
      if (typeof document !== 'undefined' && document.hidden) this._schedule(BURST.everyMs);
      else this._burst();
    }, this._between(range));
  }

  _burst() {
    for (let k = 0; k < BURST.frames; k++) {
      this._later(() => {
        if (this.ctx) this._draw(glitchBands(this._random, this.cols, this.rows, this._colors));
      }, k * BURST.stepMs);
    }
    this._later(() => {
      if (!this.ctx) return;
      this._draw(null);
      this._schedule(BURST.everyMs);
    }, BURST.frames * BURST.stepMs);
  }

  /* Grid size from the canvas width, then the name rasterised into it. */
  _layout() {
    const width = Math.max(200, this.canvas.clientWidth || this.root.clientWidth);
    /* ~7px cells on a desktop, ~5px on a phone: big enough to read as
       pixels, small enough that a condensed stroke is several cells wide. */
    const target = width >= 900 ? 7 : width >= 600 ? 6 : 5;
    const cols = Math.round(width / target);
    /* One line where there is room for it, a word per line where there is
       not: set condensed, the whole name runs as a banner across a desktop,
       and on a phone two lines keep each letter tall enough to read in 5px
       cells. */
    this._lines = width >= 900 ? [this._words.join(' ')] : this._words;
    /* Weight, width and family come from the <h1> itself, so the grid and
       the no-JS text are the same type and a CSS change moves both. */
    const cs = getComputedStyle(this.root.querySelector('h1') || this.root);
    const head = `${cs.fontWeight || 800} ${stretchKeyword(cs.fontStretch)}`;
    const probe = document.createElement('canvas').getContext('2d');
    const font = (s) => `${head} ${s}px ${cs.fontFamily}`;
    this._font = font;
    const size = fitFont(this._lines, cols, (text, s) => { probe.font = font(s); return probe.measureText(text).width; });
    const lineH = Math.round(size * 0.94);
    const cap = Math.round(size * 0.76);
    const rows = 2 + lineH * (this._lines.length - 1) + cap;

    const off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    const g = off.getContext('2d');
    g.font = font(size);
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    this._lines.forEach((l, i) => g.fillText(l, 0, 1 + cap + i * lineH));
    const px = g.getImageData(0, 0, cols, rows).data;
    const grid = new Float32Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = px[i * 4 + 3] / 255;

    Object.assign(this, { cols, rows, grid, cell: width / cols });

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(rows * this.cell * dpr);
    this.canvas.style.height = `${rows * this.cell}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* One frame. `bands` is null for the plain name, or glitchBands() output. */
  _draw(bands) {
    const { ctx, cols, rows, cell, grid } = this;
    if (!ctx || !grid) return;
    const { text } = this._theme;
    const gap = Math.max(1, cell * 0.14);
    const s = cell - gap;
    const empty = rgba(text, 0.07);
    const rand = this._random;

    const byRow = new Array(rows).fill(null);
    for (const b of bands || []) for (let y = b.y; y < Math.min(rows, b.y + b.h); y++) byRow[y] = b;

    ctx.clearRect(0, 0, cols * cell, rows * cell);
    for (let y = 0; y < rows; y++) {
      const b = byRow[y];
      for (let x = 0; x < cols; x++) {
        let fill = empty;
        if (!b) {
          const v = grid[y * cols + x];
          if (v > INK) fill = rgba(text, v);
        } else if (b.tint) {
          /* Two ghosts of the row, slipped opposite ways: each in its own
             colour, white where they overlap — a mis-registered print. */
          const a = sampleShifted(grid, cols, x, y, b.dx) > INK;
          const c = sampleShifted(grid, cols, x, y, -b.dx) > INK;
          if (a && c) fill = rgba(text, 1);
          else if (a) fill = rgba(b.tint[0], 1);
          else if (c) fill = rgba(b.tint[1], 1);
        } else if (sampleShifted(grid, cols, x, y, b.dx) > INK) {
          fill = rgba(text, 1);
        }
        /* Snow: the odd lit cell where a torn row has nothing to show. */
        if (b && fill === empty && rand() < 0.05) fill = rgba(text, 0.3 + rand() * 0.3);
        ctx.fillStyle = fill;
        ctx.fillRect(x * cell, y * cell, s, s);
      }
    }

    if (this._onReady) { const cb = this._onReady; this._onReady = null; cb(); }
  }

  destroy() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    for (const { target, type, fn, opts } of this._listeners) {
      try { target.removeEventListener(type, fn, opts); } catch (_) { /* ignore */ }
    }
    this._listeners = [];
    this.ctx = null;
  }
}
